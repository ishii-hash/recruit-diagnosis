/**
 * POST /api/analyze
 * Cloudflare Pages Function
 *
 * 入力: { url: string }
 * 処理:
 *   1) URLを取得してHTML→テキスト抽出
 *   2) Claude API に評価を依頼（言霊原理構造学 + 構造チェック + 改善提案）
 *   3) D1 へ入力URLを保存（リード取得）
 * 返却: 診断結果JSON
 *
 * 必要な環境変数:
 *   - CLAUDE_API_KEY : Anthropic API キー
 * 必要なバインディング:
 *   - DB : D1 データベース
 */

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const MAX_LINKED_PAGES = 5;
const MAIN_PAGE_TEXT_MAX = 10000;
const SUB_PAGE_TEXT_MAX = 2500;
const FETCH_TIMEOUT_MS = 8000;

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const rawUrl = (body && body.url || '').trim();
    if (!rawUrl) return jsonError('URLが指定されていません', 400);

    let parsed;
    try { parsed = new URL(rawUrl); }
    catch { return jsonError('URLの形式が正しくありません', 400); }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return jsonError('http/https のURLのみ対応しています', 400);
    }

    // -- 1) Fetch main page --
    let html;
    try {
      const res = await fetchWithTimeout(parsed.href, FETCH_TIMEOUT_MS);
      if (!res.ok) return jsonError(`ページ取得に失敗しました (status: ${res.status})`, 400);
      html = await res.text();
    } catch (err) {
      return jsonError('ページ取得に失敗しました', 400);
    }

    const mainText = extractVisibleText(html, MAIN_PAGE_TEXT_MAX);
    if (mainText.length < 200) {
      return jsonError('ページから十分な本文を取得できませんでした', 400);
    }

    // -- 1b) Fetch internal linked pages (recruit-related) --
    const linkedPages = await fetchLinkedPages(html, parsed);

    // -- 2) Claude に診断を依頼 --
    if (!env.CLAUDE_API_KEY) {
      return jsonError('サーバー設定エラー: APIキーが未設定です', 500);
    }
    const combinedText = buildCombinedText(parsed.href, mainText, linkedPages);
    const analysis = await callClaude(combinedText, parsed.href, env.CLAUDE_API_KEY);

    // -- 3) D1 へ記録（失敗してもユーザー側には影響させない） --
    if (env.DB) {
      context.waitUntil(
        saveToDb(env.DB, parsed, analysis, request).catch(err => console.error('D1 save error:', err))
      );
    }

    return jsonOk(analysis);
  } catch (err) {
    console.error('analyze error:', err);
    return jsonError(err.message || '診断処理でエラーが発生しました', 500);
  }
}

/* ============================================================
   Helpers
   ============================================================ */

function jsonOk(obj) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function extractVisibleText(html, maxLen) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen || 15000);
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RecruitSiteAnalyzer/1.0)' },
      cf: { cacheTtl: 300 },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

// 採用文脈で重視したいURLキーワード（スコア高いほど優先）
const KEYWORD_WEIGHTS = [
  ['recruit', 5], ['career', 5], ['job', 4], ['careers', 5],
  ['member', 4], ['members', 4], ['people', 4], ['team', 3],
  ['interview', 5], ['voice', 4], ['story', 3], ['stories', 3],
  ['culture', 4], ['value', 3], ['values', 3], ['mission', 3],
  ['vision', 3], ['philosophy', 3], ['message', 3],
  ['about', 2], ['company', 2], ['benefit', 3], ['welfare', 3],
  ['environment', 2], ['work', 2], ['workstyle', 3]
];

function rankInternalLinks(html, baseUrl) {
  const seen = new Map();
  const re = /<a\s+[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const rawHref = m[1];
    const anchorText = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    let resolved;
    try { resolved = new URL(rawHref, baseUrl.href); }
    catch { continue; }
    if (resolved.hostname !== baseUrl.hostname) continue;
    if (!/^https?:$/.test(resolved.protocol)) continue;
    // 拡張子フィルタ
    if (/\.(pdf|jpe?g|png|gif|svg|webp|ico|zip|mp4|mov|webm|css|js)(\?|$)/i.test(resolved.pathname)) continue;
    // 自分自身はスキップ
    if (resolved.href.replace(/\/$/, '') === baseUrl.href.replace(/\/$/, '')) continue;
    resolved.hash = '';
    const key = resolved.href;
    if (seen.has(key)) continue;

    const path = resolved.pathname.toLowerCase();
    let score = 0;
    for (const [kw, w] of KEYWORD_WEIGHTS) {
      if (path.includes(kw)) score += w;
    }
    // アンカーテキストにも採用系キーワードがあれば加点
    const anchorLower = anchorText.toLowerCase();
    for (const kw of ['社員', 'メンバー', '採用', '募集', '仕事', 'インタビュー', '声', 'カルチャー', '文化', 'ビジョン', 'ミッション', '代表', 'メッセージ', '福利', '制度']) {
      if (anchorText.includes(kw)) score += 3;
    }
    for (const [kw, w] of KEYWORD_WEIGHTS) {
      if (anchorLower.includes(kw)) score += 1;
    }
    if (score <= 0) continue;
    seen.set(key, { url: resolved.href, score, anchorText: anchorText.slice(0, 40) });
  }
  return Array.from(seen.values()).sort((a, b) => b.score - a.score);
}

async function fetchLinkedPages(html, baseUrl) {
  const candidates = rankInternalLinks(html, baseUrl).slice(0, MAX_LINKED_PAGES);
  const results = await Promise.all(
    candidates.map(async (c) => {
      try {
        const res = await fetchWithTimeout(c.url, FETCH_TIMEOUT_MS);
        if (!res.ok) return null;
        const text = extractVisibleText(await res.text(), SUB_PAGE_TEXT_MAX);
        if (text.length < 100) return null;
        return { url: c.url, anchorText: c.anchorText, text };
      } catch { return null; }
    })
  );
  return results.filter(Boolean);
}

function buildCombinedText(mainUrl, mainText, linkedPages) {
  const parts = [`=== メインページ: ${mainUrl} ===\n${mainText}`];
  linkedPages.forEach((p, i) => {
    parts.push(`\n=== 関連ページ${i + 1}: ${p.anchorText ? p.anchorText + ' / ' : ''}${p.url} ===\n${p.text}`);
  });
  return parts.join('\n');
}

async function callClaude(pageText, targetUrl, apiKey) {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(pageText, targetUrl);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: '{' } // プリフィルでJSON開始を強制
      ]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const text = '{' + (data.content[0]?.text || '');

  const parsed = parseJsonLenient(text);
  // サーバー側で補填
  parsed.url = targetUrl;
  parsed.analyzedAt = formatDate(new Date());
  return parsed;
}

// Claudeのレスポンスが途中で切れた場合でも、構造が追えるところまで復元してパース
function parseJsonLenient(text) {
  const start = text.indexOf('{');
  if (start === -1) throw new Error('Claude応答にJSONが含まれていません');
  let body = text.slice(start);

  // まず素直に試す
  try { return JSON.parse(body); } catch { /* fallthrough */ }

  // 末尾のカンマや不完全なトークンを削り、括弧/引用符を閉じる
  let s = body;
  // 閉じ未了の文字列をトリム: 最後のエスケープされていない " の直後まで有効と見なす
  const lastCompleteQuoteMatch = findSafeTail(s);
  s = s.slice(0, lastCompleteQuoteMatch);
  // 末尾のカンマや空白を落とす
  s = s.replace(/[,\s]+$/g, '');

  // スタック解析で未閉じの {, [ を追加
  const stack = [];
  let inStr = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  while (stack.length) {
    const open = stack.pop();
    s += open === '{' ? '}' : ']';
  }

  try { return JSON.parse(s); }
  catch (e) { throw new Error('Claude応答のJSONパースに失敗しました: ' + e.message); }
}

// 末尾が文字列リテラルの途中で切れていたら、その手前までに切り詰める
function findSafeTail(s) {
  let inStr = false;
  let escape = false;
  let lastSafe = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inStr = false; lastSafe = i + 1; }
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    lastSafe = i + 1;
  }
  return lastSafe;
}

function buildSystemPrompt() {
  return `あなたは日本語の採用サイト・採用広報記事を診断する専門家です。
「言霊原理構造学」という評価フレームワーク（人間理解・意味編集・構造設計・言語表現・視座操作・編集者的倫理観・内発性の7カテゴリをL1〜L5で評価）と、採用UXチェックリスト（基本情報の明示／魅力訴求／信頼性／応募導線／視覚UX／SEO技術）の観点で、構造と表現の両面から診断します。
出力は必ず指定されたJSON形式のみで返し、余計な説明文や前置きは一切含めないでください。`;
}

function buildUserPrompt(pageText, url) {
  return `以下は診断対象の採用サイトから抽出した本文です。メインページに加えて、内部リンクで辿れる関連ページ（社員紹介・メッセージ・カルチャー等）の本文も含まれています。サイト全体を総合的に評価し、JSONで結果を返してください。

【診断対象URL】
${url}

【本文抽出（メインページ＋関連ページ）】
${pageText}

【出力JSONフォーマット】
{
  "totalScore": <0〜100の整数>,
  "grade": "<A+/A/B+/B/C+/C/Dのいずれか>",
  "heroTitle": "<総評を一言で表す見出し。30〜50字>",
  "heroDesc": "<診断の総括。文章で140〜200字>",
  "radar": [
    { "name": "人間理解力",     "level": <1〜5>, "description": "<一言コメント 30字前後>" },
    { "name": "意味編集力",     "level": <1〜5>, "description": "..." },
    { "name": "構造設計力",     "level": <1〜5>, "description": "..." },
    { "name": "言語表現力",     "level": <1〜5>, "description": "..." },
    { "name": "視座操作力",     "level": <1〜5>, "description": "..." },
    { "name": "編集者的倫理観", "level": <1〜5>, "description": "..." },
    { "name": "内発性",         "level": <1〜5>, "description": "..." }
  ],
  "structure": [
    {
      "title": "基本情報の明示",
      "score": "<n/10>",
      "items": [
        { "status": "<ok|warn|ng>", "label": "<判定項目の名称>", "note": "<改善ヒント、不要なら空文字>" }
      ]
    },
    { "title": "魅力訴求",         "score": "...", "items": [...] },
    { "title": "信頼性・社員の顔", "score": "...", "items": [...] },
    { "title": "応募導線・CTA",    "score": "...", "items": [...] },
    { "title": "視覚・UX",         "score": "...", "items": [...] },
    { "title": "SEO・技術",        "score": "...", "items": [...] }
  ],
  "actions": [
    {
      "title": "<改善アクションの見出し>",
      "impact": "<効果：大/中/小>",
      "ease": "<実装：易/中/難>",
      "body": "<200〜280字の具体的な改善提案>"
    }
    /* ちょうど3つ */
  ]
}

【ルール】
- structureの各カテゴリには3〜5個のitemsを含める
- JSON以外の文字（コードフェンス、前置き、後書き）は一切出力しない
- 値はすべて日本語で書く
- 判定は本文の内容から根拠を持って行う`;
}

async function saveToDb(db, parsedUrl, analysis, request) {
  const domain = parsedUrl.hostname;
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ua = request.headers.get('User-Agent') || '';
  const referer = request.headers.get('Referer') || '';

  await db.prepare(`
    INSERT INTO analyses
      (url, domain, total_score, grade, analyzed_at, ip, user_agent, referer)
    VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?)
  `).bind(
    parsedUrl.href,
    domain,
    analysis.totalScore || 0,
    analysis.grade || '',
    ip,
    ua,
    referer
  ).run();
}

function formatDate(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
