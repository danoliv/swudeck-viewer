// supabase/functions/swudb-deck/index.ts
// Same-purpose replacement for the free CORS proxies in src/lib/api.ts:
// fetches one SWUDB deck JSON server-side and returns it with CORS headers.
// Deliberately not a general proxy — only https://swudb.com/api/getDeckJson/<id>
// with a validated id can be reached. Deployed with verify_jwt = false because
// the frontend's publishable key is not a JWT.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};

const DECK_ID = /^[A-Za-z0-9_-]{1,64}$/;
const UPSTREAM_TIMEOUT_MS = 10_000;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!DECK_ID.test(id)) return json({ error: 'Invalid deck id' }, 400);

  try {
    const upstream = await fetch(`https://swudb.com/api/getDeckJson/${id}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (err) {
    return json({ error: `Upstream fetch failed: ${err instanceof Error ? err.message : String(err)}` }, 502);
  }
});
