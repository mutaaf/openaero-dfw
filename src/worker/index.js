// OpenAero DFW edge Worker. Static assets are served by Workers Static Assets directly;
// only /openaero/api/* reaches this script (wrangler.jsonc → assets.run_worker_first).
//
// GET /openaero/api/metar?ids=KDFW,KDAL → today's METARs from aviationweather.gov
// (NOAA Aviation Weather Center, public data), trimmed to what the sim uses and cached at
// the edge for 5 minutes. aviationweather.gov is the only host this Worker talks to.

const UPSTREAM = 'https://aviationweather.gov/api/data/metar';
const TTL_S = 300;          // how long the edge (caches.default) keeps a copy
const BROWSER_TTL_S = 60;   // what browsers are told, on every response we return
const MAX_IDS = 6;
const ID_RE = /^K[A-Z0-9]{3}$/;

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
});

function withBrowserTtl(res) {
  const out = new Response(res.body, res);
  out.headers.set('cache-control', `public, max-age=${BROWSER_TTL_S}`);
  return out;
}

// "kdfw, KDAL" → ['KDAL', 'KDFW'] (sorted, deduped), or null if anything is invalid.
export function parseIds(raw) {
  if (!raw) return null;
  const ids = [...new Set(raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))].sort();
  if (ids.length === 0 || ids.length > MAX_IDS || !ids.every((id) => ID_RE.test(id))) return null;
  return ids;
}

export function trimMetar(m) {
  return {
    icaoId: m.icaoId, obsTime: m.obsTime, rawOb: m.rawOb, temp: m.temp, dewp: m.dewp,
    wdir: m.wdir, wspd: m.wspd, wgst: m.wgst ?? null, visib: m.visib, altim: m.altim,
    clouds: Array.isArray(m.clouds) ? m.clouds.map((c) => ({ cover: c.cover, base: c.base ?? null })) : [],
    fltCat: m.fltCat ?? null,
  };
}

// deps: { fetch, cache, waitUntil } — injected so the handler is unit-testable.
export async function handleMetar(request, deps) {
  const url = new URL(request.url);
  const ids = parseIds(url.searchParams.get('ids'));
  if (!ids) return json(400, { error: `ids must be 1-${MAX_IDS} comma-separated K-prefixed ICAO codes` });

  const cacheKey = `${url.origin}${url.pathname}?ids=${ids.join(',')}`;
  // Re-stamp cache-control on hits: zone rules (Browser Cache TTL) can rewrite the stored
  // header to hours, and weather must not sit stale in a browser cache.
  const hit = await deps.cache.match(cacheKey);
  if (hit) return withBrowserTtl(hit);

  let upstream;
  try {
    upstream = await deps.fetch(`${UPSTREAM}?ids=${ids.join(',')}&format=json`, {
      headers: { 'user-agent': 'OpenAero-DFW/1.0 (+https://mutaafaziz.com/openaero/)' },
    });
  } catch {
    return json(502, { error: 'upstream unreachable' });
  }
  if (upstream.status === 204) {
    return json(200, { source: 'aviationweather.gov', fetchedAt: new Date().toISOString(), metars: [] });
  }
  if (!upstream.ok) return json(502, { error: `upstream returned ${upstream.status}` });

  let data;
  try { data = await upstream.json(); } catch { return json(502, { error: 'upstream sent invalid JSON' }); }
  const body = {
    source: 'aviationweather.gov',
    fetchedAt: new Date().toISOString(),
    metars: (Array.isArray(data) ? data : []).map(trimMetar),
  };
  const res = json(200, body, { 'cache-control': `public, max-age=${TTL_S}` });
  deps.waitUntil(deps.cache.put(cacheKey, res.clone()));
  return withBrowserTtl(res);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method !== 'GET') return json(405, { error: 'GET only' }, { allow: 'GET' });
    if (url.pathname === '/openaero/api/metar') {
      return handleMetar(request, {
        fetch: (u, init) => fetch(u, init),
        cache: caches.default,
        waitUntil: (p) => ctx.waitUntil(p),
      });
    }
    return json(404, { error: 'not found' });
  },
};
