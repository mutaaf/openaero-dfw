import { describe, it, expect, vi } from 'vitest';
import worker, { handleConfig, handleMetar, parseIds, trimMetar } from '../../src/worker/index.js';

const SAMPLE = [{
  icaoId: 'KDFW', obsTime: 1792183980, reportTime: '2026-10-16T21:00:00.000Z', temp: 18.3, dewp: 2.8,
  wdir: 350, wspd: 23, wgst: 32, visib: '10+', altim: 1029.9, slp: 1029.1, qcField: 4,
  rawOb: 'METAR KDFW 162053Z 35023G32KT 10SM FEW050 BKN250 18/03 A3041', lat: 32.8974, lon: -97.022,
  elev: 168, name: 'Dallas-Ft Worth Intl, TX, US', clouds: [{ cover: 'FEW', base: 5000 }, { cover: 'BKN', base: 25000 }], fltCat: 'VFR',
}];

function memoryCache() {
  const store = new Map();
  return {
    store,
    match: vi.fn(async (req) => { const r = store.get(typeof req === 'string' ? req : req.url); return r ? r.clone() : undefined; }),
    put: vi.fn(async (req, res) => { store.set(typeof req === 'string' ? req : req.url, res.clone()); }),
  };
}
const deps = (fetchImpl, cache = memoryCache()) => ({ fetch: fetchImpl, cache, waitUntil: (p) => p });
const req = (q) => new Request(`https://mutaafaziz.com/openaero/api/metar${q}`);

describe('parseIds', () => {
  it('normalises, dedupes and sorts', () => {
    expect(parseIds(' kdfw,KDAL ,kdfw')).toEqual(['KDAL', 'KDFW']);
  });
  it('rejects non-K ids, junk and more than six', () => {
    expect(parseIds('EGLL')).toBeNull();
    expect(parseIds('KDFW;DROP')).toBeNull();
    expect(parseIds('')).toBeNull();
    expect(parseIds('KA01,KA02,KA03,KA04,KA05,KA06,KA07')).toBeNull();
  });
});

describe('trimMetar', () => {
  it('keeps only the fields the sim uses', () => {
    const t = trimMetar(SAMPLE[0]);
    expect(t).toEqual({
      icaoId: 'KDFW', obsTime: 1792183980, rawOb: SAMPLE[0].rawOb, temp: 18.3, dewp: 2.8,
      wdir: 350, wspd: 23, wgst: 32, visib: '10+', altim: 1029.9,
      clouds: [{ cover: 'FEW', base: 5000 }, { cover: 'BKN', base: 25000 }], fltCat: 'VFR',
    });
  });
});

describe('handleMetar', () => {
  it('fetches upstream once, then serves from cache', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(SAMPLE), { status: 200, headers: { 'content-type': 'application/json' } }));
    const d = deps(f);
    const r1 = await handleMetar(req('?ids=KDFW'), d);
    expect(r1.status).toBe(200);
    const body = await r1.json();
    expect(body.metars[0].icaoId).toBe('KDFW');
    expect(body.source).toBe('aviationweather.gov');
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0][0])).toBe('https://aviationweather.gov/api/data/metar?ids=KDFW&format=json');
    expect(r1.headers.get('cache-control')).toBe('public, max-age=60');
    const r2 = await handleMetar(req('?ids=kdfw'), d);
    expect((await r2.json()).metars[0].icaoId).toBe('KDFW');
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('re-stamps cache-control on cache hits (edge rules may have rewritten the stored header)', async () => {
    const cache = memoryCache();
    // Simulate a stored copy whose header was stretched to 4 hours.
    cache.store.set('https://mutaafaziz.com/openaero/api/metar?ids=KDFW', new Response(JSON.stringify({ metars: [] }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=14400' },
    }));
    const f = vi.fn();
    const r = await handleMetar(req('?ids=KDFW&t=29870000'), deps(f, cache));
    expect(f).not.toHaveBeenCalled();
    expect(r.headers.get('cache-control')).toBe('public, max-age=60');
    expect(r.headers.get('content-type')).toMatch(/json/);
  });
  it('the edge copy is kept for 5 minutes', async () => {
    const cache = memoryCache();
    const f = vi.fn(async () => new Response(JSON.stringify(SAMPLE), { status: 200 }));
    await handleMetar(req('?ids=KDFW'), deps(f, cache));
    const stored = cache.store.get('https://mutaafaziz.com/openaero/api/metar?ids=KDFW');
    expect(stored.headers.get('cache-control')).toBe('public, max-age=300');
  });
  it('400s on invalid ids without calling upstream', async () => {
    const f = vi.fn();
    const r = await handleMetar(req('?ids=../../etc'), deps(f));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/ids/);
    expect(f).not.toHaveBeenCalled();
  });
  it('502s with JSON when upstream fails', async () => {
    const r = await handleMetar(req('?ids=KDFW'), deps(async () => new Response('boom', { status: 503 })));
    expect(r.status).toBe(502);
    expect((await r.json()).error).toMatch(/upstream/);
  });
  it('502s when upstream throws', async () => {
    const r = await handleMetar(req('?ids=KDFW'), deps(async () => { throw new Error('net'); }));
    expect(r.status).toBe(502);
  });
  it('treats 204 (no data) as an empty list', async () => {
    const r = await handleMetar(req('?ids=KXXX'), deps(async () => new Response(null, { status: 204 })));
    expect(r.status).toBe(200);
    expect((await r.json()).metars).toEqual([]);
  });
});

describe('worker.fetch routing', () => {
  it('404s unknown api paths and passes nothing else through', async () => {
    const env = { ASSETS: { fetch: vi.fn() } };
    const r = await worker.fetch(new Request('https://mutaafaziz.com/openaero/api/nope'), env, { waitUntil() {} });
    expect(r.status).toBe(404);
  });
  it('only allows GET', async () => {
    const r = await worker.fetch(new Request('https://mutaafaziz.com/openaero/api/metar?ids=KDFW', { method: 'POST' }), { ASSETS: {} }, { waitUntil() {} });
    expect(r.status).toBe(405);
  });
});

describe('config endpoint', () => {
  it('returns the Google tiles key from the secret, never cached', async () => {
    const res = handleConfig({ GOOGLE_MAPS_KEY: ' abc123 ' });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ googleTilesKey: 'abc123' });
  });
  it('returns null when the secret is unset or blank', async () => {
    expect(await handleConfig({}).json()).toEqual({ googleTilesKey: null });
    expect(await handleConfig({ GOOGLE_MAPS_KEY: '  ' }).json()).toEqual({ googleTilesKey: null });
    expect(await handleConfig(undefined).json()).toEqual({ googleTilesKey: null });
  });
  it('is routed at /openaero/api/config', async () => {
    const res = await worker.fetch(new Request('https://mutaafaziz.com/openaero/api/config'), { GOOGLE_MAPS_KEY: 'k' }, { waitUntil() {} });
    expect(await res.json()).toEqual({ googleTilesKey: 'k' });
  });
});
