const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function isAdmin(request, env) {
  const pass = env.ADMIN_PASSWORD;
  return pass && request.headers.get('X-Admin-Password') === pass;
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequest({ request, env }) {
  const method = request.method;

  if (method === 'GET') {
    const admin = isAdmin(request, env);
    const query = admin
      ? 'SELECT * FROM gacha_prizes ORDER BY id DESC'
      : 'SELECT * FROM gacha_prizes WHERE is_active = 1 ORDER BY rarity DESC';
    const { results } = await env.DB.prepare(query).all();

    let stats = null;
    if (admin) {
      const row = await env.DB.prepare(
        "SELECT COUNT(*) as total, COUNT(CASE WHEN pulled_at >= datetime('now','-1 day') THEN 1 END) as today FROM gacha_results"
      ).first();
      stats = row;
    }

    return json({ prizes: results, stats });
  }

  if (method === 'POST') {
    if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);

    const { name, description = '', image_url = '', rarity = 'normal', weight = 100 } =
      await request.json();
    if (!name) return json({ error: 'name is required' }, 400);

    const result = await env.DB.prepare(
      'INSERT INTO gacha_prizes (name, description, image_url, rarity, weight, is_active) VALUES (?,?,?,?,?,1)'
    ).bind(name, description, image_url, rarity, Number(weight)).run();

    return json({ id: result.meta.last_row_id, success: true }, 201);
  }

  return json({ error: 'method not allowed' }, 405);
}
