const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestGet({ request, env }) {
  const pass = env.ADMIN_PASSWORD;
  if (!pass || request.headers.get('X-Admin-Password') !== pass) {
    return json({ error: 'unauthorized' }, 401);
  }

  const { results } = await env.DB.prepare(`
    SELECT
      c.id, c.name, c.company, c.email, c.claimed_at,
      p.name  AS prize_name,
      p.rarity AS prize_rarity
    FROM gacha_claims c
    LEFT JOIN gacha_prizes p ON p.id = c.prize_id
    ORDER BY c.claimed_at DESC
    LIMIT 200
  `).all();

  return json({ claims: results });
}
