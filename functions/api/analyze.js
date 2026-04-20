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

    // -- 1) Fetch target page --
    let html;
    try {
      const res = await fetch(parsed.href, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RecruitSiteAnalyzer/1.0)'
        },
        cf: { cacheTtl: 300 }
      });
      if (!res.ok) return jsonError(`ページ取得に失敗しました (status: ${res.status})`, 400);
      html = await res.text();
    } catch (err) {
      return jsonError('ページ取得に失敗しました', 400);
    }

    const pageText = extractVisibleText(html);
    if (pageText.length < 200) {
      return jsonError('ページから十分な本文を取得できませんでした', 400);
    }

    // -- 2) Claude に診断を依頼 --
    if (!env.CLAUDE_API_KEY) {
      return jsonError('サーバー設定エラー: APIキーが未設定です', 500);
    }
    const analysis = await callClaude(pageText, parsed.href, env.CLAUDE_API_KEY);

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

function extractVisibleText(html) {
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
    .slice(0, 15000);
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
      max_tokens: 4096,
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

  // JSON部分のみ抽出してパース
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Claude応答のJSONパースに失敗しました');

  const parsed = JSON.parse(text.slice(start, end + 1));
  // サーバー側で補填
  parsed.url = targetUrl;
  parsed.analyzedAt = formatDate(new Date());
  return parsed;
}

function buildSystemPrompt() {
  return `あなたは日本語の採用サイト・採用広報記事を診断する専門家です。
「言霊原理構造学」という評価フレームワーク（人間理解・意味編集・構造設計・言語表現・視座操作・編集者的倫理観・内発性の7カテゴリをL1〜L5で評価）と、採用UXチェックリスト（基本情報の明示／魅力訴求／信頼性／応募導線／視覚UX／SEO技術）の観点で、構造と表現の両面から診断します。
出力は必ず指定されたJSON形式のみで返し、余計な説明文や前置きは一切含めないでください。`;
}

function buildUserPrompt(pageText, url) {
  return `以下は採用サイトまたは採用広報記事から抽出した本文です。この内容を診断し、JSONで結果を返してください。

【URL】
${url}

【本文抽出】
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
