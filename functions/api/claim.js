const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost({ request, env }) {
  try {
    const { result_id, prize_id, name, company = '', email } = await request.json();

    if (!name || !email) return json({ error: 'name と email は必須です' }, 400);
    if (!EMAIL_RE.test(email)) return json({ error: 'メールアドレスの形式が正しくありません' }, 400);

    await env.DB.prepare(`
      INSERT INTO gacha_claims (result_id, prize_id, name, company, email, claimed_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      result_id ?? null,
      prize_id  ?? null,
      name.trim().slice(0, 100),
      company.trim().slice(0, 100),
      email.trim().toLowerCase().slice(0, 200)
    ).run();

    return json({ success: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
