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

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost({ env }) {
  try {
    const { results: prizes } = await env.DB.prepare(
      'SELECT * FROM gacha_prizes WHERE is_active = 1'
    ).all();

    if (!prizes || prizes.length === 0) {
      return json({ error: 'prizes_empty' }, 404);
    }

    const total = prizes.reduce((s, p) => s + p.weight, 0);
    let rand = Math.random() * total;
    let selected = prizes[prizes.length - 1];
    for (const p of prizes) {
      rand -= p.weight;
      if (rand <= 0) { selected = p; break; }
    }

    await env.DB.prepare(
      "INSERT INTO gacha_results (prize_id, pulled_at) VALUES (?, datetime('now'))"
    ).bind(selected.id).run();

    return json({ prize: selected });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
