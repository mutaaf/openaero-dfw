// Google Photorealistic 3D Tiles: the billable part, kept as small as possible.
//
// Google bills (and our project's quota counts) one "root tileset request" per session; the
// tile requests that follow are not billed separately. A session lasts ~3 hours, so:
//   - the root is fetched only when the player actually starts flying (never on the title
//     screen, never in tests without a key), at most once per page;
//   - the session is reused for everything on this page (missions, cameras, the whole
//     flight) and never re-created; it is NOT persisted across reloads, because Google's
//     Map Tiles policy says "you must not pre-fetch, index, store, or cache any Content
//     except under the limited conditions stated in the terms";
//   - a 403/429 on the root (referrer mismatch, daily quota) switches the page to the free
//     terrain and is remembered (quota: until Google's midnight-Pacific reset) so we don't
//     keep knocking.
// Tiles themselves are never stored or proxied by us (Google's terms): the browser's own
// HTTP cache handles them (per the policy: "Cache-Control and ETag headers ... should be
// implemented according to the HTTP protocol"). Only our own bookkeeping (the quota block
// and usage counters) goes to localStorage. Pure module: inject fetch, storage and clock; no THREE, no DOM.

export const ROOT_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json';
const BLOCK_KEY = 'openaero_g3dt_block_v1';
const USAGE_KEY = 'openaero_g3dt_usage_v1';

// A short, non-reversible tag of the key, so a rotated key never reuses an old session.
export function keyTag(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

// The session token Google puts on the root's child content URIs.
export function sessionFromRoot(json) {
  const stack = json && json.root ? [json.root] : [];
  while (stack.length) {
    const t = stack.pop();
    const uri = t.content && (t.content.uri || t.content.url);
    if (uri && uri.includes('?')) {
      const s = new URLSearchParams(uri.split('?')[1]).get('session');
      if (s) return s;
    }
    if (Array.isArray(t.children)) stack.push(...t.children);
  }
  return null;
}

// Next midnight in America/Los_Angeles (when Google's daily quotas reset), as epoch ms.
export function nextPacificMidnight(now) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: 'numeric', minute: 'numeric', second: 'numeric' });
  const p = Object.fromEntries(fmt.formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  const elapsed = ((+p.hour % 24) * 3600 + +p.minute * 60 + +p.second) * 1000;
  return now - elapsed + 24 * 3600 * 1000;
}

const read = (storage, k) => {
  try { const v = storage?.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; }
};
const write = (storage, k, v) => {
  try { if (v === null) storage?.removeItem(k); else storage?.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ }
};

export class PhotorealUnavailable extends Error {
  constructor(reason, status = 0) { super(reason); this.reason = reason; this.status = status; }
}

export function createGoogleSession({ key, fetch: fetchFn, storage, now = () => Date.now() }) {
  const tag = keyTag(key);
  const usage = read(storage, USAGE_KEY) || { roots: 0, reuses: 0 };
  const page = { roots: 0, reuses: 0, refreshes: 0 };
  let current = null;      // { root, session, issuedAt } — memory only, this page
  let inflight = null;

  const bump = (field) => {
    usage[field]++;
    page[field]++;
    write(storage, USAGE_KEY, usage);
  };

  async function fetchRoot() {
    const block = read(storage, BLOCK_KEY);
    if (block && block.tag === tag && block.until > now()) throw new PhotorealUnavailable(block.reason);
    let res;
    try {
      res = await fetchFn(`${ROOT_URL}?key=${encodeURIComponent(key)}`);
    } catch {
      throw new PhotorealUnavailable('network');
    }
    if (res.status === 429 || res.status === 403) {
      const reason = res.status === 429 ? 'quota' : 'forbidden';
      // Quota resets at midnight Pacific; a forbidden key/referrer is retried in an hour.
      const until = res.status === 429 ? nextPacificMidnight(now()) : now() + 3600 * 1000;
      write(storage, BLOCK_KEY, { tag, reason, until });
      throw new PhotorealUnavailable(reason, res.status);
    }
    if (!res.ok) throw new PhotorealUnavailable(`http ${res.status}`, res.status);
    const root = await res.json();
    const session = sessionFromRoot(root);
    if (!session) throw new PhotorealUnavailable('no session in root');
    bump('roots');
    current = { root, session, issuedAt: now() };
    return current;
  }

  return {
    page,
    usage,
    get current() { return current; },
    // The root for this page: fetched once, then every later caller reuses the session.
    getRoot() {
      if (current) { bump('reuses'); return Promise.resolve(current); }
      if (!inflight) inflight = fetchRoot().finally(() => { inflight = null; });
      return inflight;
    },
    // Google rejected the session (it outlived ~3 h on a long flight): start a new one.
    async refresh() {
      current = null;
      page.refreshes++;
      return fetchRoot();
    },
    // URL for any tile.googleapis.com request: our key + the current session.
    sign(url) {
      const u = new URL(url);
      if (u.host !== 'tile.googleapis.com') return url;
      u.searchParams.set('key', key);
      if (current) u.searchParams.set('session', current.session);
      return u.toString();
    },
  };
}
