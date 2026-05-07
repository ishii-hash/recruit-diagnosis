const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
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

export async function onRequest({ request, env, params }) {
  if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);

  const id = Number(params.id);
  const method = request.method;

  if (method === 'PUT') {
    const body = await request.json();
    await env.DB.prepare(`
      UPDATE gacha_prizes SET
        name        = COALESCE(?, name),
        description = COALESCE(?, description),
        image_url   = COALESCE(?, image_url),
        rarity      = COALESCE(?, rarity),
        weight      = COALESCE(?, weight),
        is_active   = COALESCE(?, is_active)
      WHERE id = ?
    `).bind(
      body.name ?? null,
      body.description ?? null,
      body.image_url ?? null,
      body.rarity ?? null,
      body.weight != null ? Number(body.weight) : null,
      body.is_active != null ? Number(body.is_active) : null,
      id
    ).run();
    return json({ success: true });
  }

  if (method === 'DELETE') {
    await env.DB.prepare('DELETE FROM gacha_prizes WHERE id = ?').bind(id).run();
    return json({ success: true });
  }

  return json({ error: 'method not allowed' }, 405);
}
