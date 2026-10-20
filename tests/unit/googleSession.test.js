import { describe, it, expect, vi } from 'vitest';
import {
  createGoogleSession, sessionFromRoot, keyTag, nextPacificMidnight, ROOT_URL,
  PhotorealUnavailable,
} from '../../src/googleSession.js';

const ROOT = {
  asset: { version: '1.0' },
  root: { boundingVolume: { box: [] }, children: [
    { children: [{ content: { uri: '/v1/3dtiles/datasets/CgA/files/AbC.json?session=SESS123' } }] },
  ] },
};

function memStorage() {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const ok = (body) => ({ ok: true, status: 200, json: async () => structuredClone(body) });
const status = (s) => ({ ok: false, status: s, json: async () => ({}) });

describe('helpers', () => {
  it('finds the session token on the first child content URI', () => {
    expect(sessionFromRoot(ROOT)).toBe('SESS123');
    expect(sessionFromRoot({ root: {} })).toBeNull();
  });
  it('tags keys without revealing them, and differently per key', () => {
    expect(keyTag('abc')).not.toContain('abc');
    expect(keyTag('abc')).not.toBe(keyTag('abd'));
  });
  it('computes the next midnight in Los Angeles', () => {
    const now = Date.parse('2026-10-17T15:00:00Z'); // 08:00 PDT
    expect(new Date(nextPacificMidnight(now)).toISOString()).toBe('2026-10-18T07:00:00.000Z');
  });
});

describe('session reuse (memory only, per the Google no-caching policy)', () => {
  it('fetches the root once per page; later callers reuse the session', async () => {
    const storage = memStorage();
    const fetch = vi.fn(async () => ok(ROOT));
    const a = createGoogleSession({ key: 'K', fetch, storage });
    const r1 = await a.getRoot();
    expect(r1.session).toBe('SESS123');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(`${ROOT_URL}?key=K`);
    // Full-URL referrer, or Google rejects the path-restricted key.
    expect(fetch.mock.calls[0][1]).toEqual({ referrerPolicy: 'no-referrer-when-downgrade' });
    await a.getRoot();
    await a.getRoot();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(a.page).toMatchObject({ roots: 1, reuses: 2 });
  });
  it('never stores Google content: storage holds only our counters', async () => {
    const storage = memStorage();
    await createGoogleSession({ key: 'K', fetch: async () => ok(ROOT), storage }).getRoot();
    const all = [...storage.m.values()].join(' ');
    expect(all).not.toContain('SESS123');
    expect(all).not.toContain('3dtiles');
    expect([...storage.m.keys()]).toEqual(['openaero_g3dt_usage_v1']);
  });
  it('a new page fetches a new root (nothing persisted)', async () => {
    const storage = memStorage();
    const fetch = vi.fn(async () => ok(ROOT));
    await createGoogleSession({ key: 'K', fetch, storage }).getRoot();
    const b = createGoogleSession({ key: 'K', fetch, storage });
    await b.getRoot();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(b.usage.roots).toBe(2); // lifetime counter survives, for verifying spend
  });
  it('concurrent callers share one root request', async () => {
    const fetch = vi.fn(async () => ok(ROOT));
    const s = createGoogleSession({ key: 'K', fetch, storage: memStorage() });
    await Promise.all([s.getRoot(), s.getRoot(), s.getRoot()]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('refresh() starts a new session when Google rejects the old one', async () => {
    const fetch = vi.fn(async () => ok(ROOT));
    const s = createGoogleSession({ key: 'K', fetch, storage: memStorage() });
    await s.getRoot();
    await s.refresh();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(s.page.refreshes).toBe(1);
  });
  it('works without storage (private mode)', async () => {
    const s = createGoogleSession({ key: 'K', fetch: async () => ok(ROOT), storage: null });
    expect((await s.getRoot()).session).toBe('SESS123');
  });
});

describe('quota and errors', () => {
  it('429 → unavailable, remembered until the Pacific reset (no more root requests)', async () => {
    const storage = memStorage();
    let t = Date.parse('2026-10-17T15:00:00Z');
    const fetch = vi.fn(async () => status(429));
    const s = createGoogleSession({ key: 'K', fetch, storage, now: () => t });
    await expect(s.getRoot()).rejects.toMatchObject({ reason: 'quota', status: 429 });
    await expect(createGoogleSession({ key: 'K', fetch, storage, now: () => t }).getRoot()).rejects.toBeInstanceOf(PhotorealUnavailable);
    expect(fetch).toHaveBeenCalledTimes(1);
    t = Date.parse('2026-10-18T07:00:01Z');
    fetch.mockResolvedValueOnce(ok(ROOT));
    expect((await createGoogleSession({ key: 'K', fetch, storage, now: () => t }).getRoot()).session).toBe('SESS123');
  });
  it('403 (referrer/key) → unavailable for 10 minutes, then asks again', async () => {
    const storage = memStorage();
    let t = 0;
    const fetch = vi.fn(async () => status(403));
    await expect(createGoogleSession({ key: 'K', fetch, storage, now: () => t }).getRoot()).rejects.toMatchObject({ reason: 'forbidden' });
    t = 9 * 60 * 1000;
    await expect(createGoogleSession({ key: 'K', fetch, storage, now: () => t }).getRoot()).rejects.toMatchObject({ reason: 'forbidden' });
    expect(fetch).toHaveBeenCalledTimes(1);
    t = 11 * 60 * 1000;
    fetch.mockResolvedValueOnce(ok(ROOT));
    expect((await createGoogleSession({ key: 'K', fetch, storage, now: () => t }).getRoot()).session).toBe('SESS123');
  });
  it('a network failure is unavailable but not remembered', async () => {
    const storage = memStorage();
    const fetch = vi.fn(async () => { throw new TypeError('offline'); });
    await expect(createGoogleSession({ key: 'K', fetch, storage }).getRoot()).rejects.toMatchObject({ reason: 'network' });
    fetch.mockResolvedValueOnce(ok(ROOT));
    expect((await createGoogleSession({ key: 'K', fetch, storage }).getRoot()).session).toBe('SESS123');
  });
});

describe('sign', () => {
  it('adds key and session to Google tile URLs only', async () => {
    const s = createGoogleSession({ key: 'K', fetch: async () => ok(ROOT), storage: null });
    await s.getRoot();
    const u = new URL(s.sign('https://tile.googleapis.com/v1/3dtiles/datasets/CgA/files/x.glb?session=OLD'));
    expect(u.searchParams.get('key')).toBe('K');
    expect(u.searchParams.get('session')).toBe('SESS123');
    expect(s.sign('https://server.arcgisonline.com/a.png')).toBe('https://server.arcgisonline.com/a.png');
  });
});
