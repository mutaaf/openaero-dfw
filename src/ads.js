// Marquee ads (operator decision 2026-10-30, AGENTS.md invariant 3). A lazy chunk, fetched after
// boot; main.js only calls through `ads?.`. The loader is same-origin (index.html, ../ads/v1/ads.js)
// and OpenAero is a kids app there: Google requests are tagged child-directed, and every slot is a
// menu slot. The rules this module keeps:
// - Never in flight: every call needs the start screen or the results card on screen (inMenu).
// - Kid level, or a clean view the player chose (stored), shows no ads at all.
// - The post-flight break skips the first FLY AGAIN of the visit and waits BREAK_GAP_MS between.
// - The reward is opt-in (a button that says it's an ad) and hidden while its slot has no fill.
// - A missing or blocked loader is a no-op; nothing ever waits on an ad that isn't there.
export const SLOTS = { title: 'title', post: 'postflight', reward: 'livery' };
export const BREAK_GAP_MS = 4 * 60 * 1000;
const GOLD = 0xd4a017;

/** The slot can fill: Marquee is on and the slot's source isn't 'none'. */
export function slotFills(cfg, id) {
  const s = cfg && cfg.enabled && cfg.slots && cfg.slots[id];
  return !!s && s.source !== 'none';
}

/** No ads for Kid, nor for a player who chose the clean view (openaero_view_v1 stored clean). */
export function adsAllowed(level, storage) {
  if (level === 'kid') return false;
  try {
    const v = JSON.parse(storage.getItem('openaero_view_v1') || 'null');
    return !(v && v.v === 1 && v.clean === true);
  } catch { return true; }
}

/** A post-flight break is due: not the visit's first FLY AGAIN, and the last one was long enough ago. */
export function breakDue(state, now) {
  state.flights += 1;
  return state.flights > 1 && now - state.lastBreak >= BREAK_GAP_MS;
}

// The real loader has `v`; a { q: [] } stub (or nothing) means no ads this visit.
const api = () => (window.marquee && window.marquee.v ? window.marquee : null);

/**
 * opts: level() → 'kid'|'learner'|'pilot', inMenu() → start screen or results card showing,
 * pause()/resume() (sim + audio), root() → the aircraft group to paint.
 */
export function createAds(opts) {
  let cfg = null;
  let gold = false;
  const brk = { flights: 0, lastBreak: -Infinity };
  const storage = () => { try { return window.localStorage; } catch { return null; } };
  const allowed = () => adsAllowed(opts.level(), storage() || { getItem: () => null });
  const ready = (id) => cfg && allowed() && opts.inMenu() && slotFills(cfg, id) && api();
  const hooks = { beforeAd: () => opts.pause(), afterAd: () => opts.resume() };

  const panel = document.getElementById('modalScroll');
  const banner = document.createElement('div');
  banner.id = 'adTitle';
  banner.className = 'hidden shrink-0 rounded-xl overflow-hidden';
  const btn = document.createElement('button');
  btn.id = 'btnLivery';
  btn.className = 'hidden hud-btn shrink-0 rounded-xl min-h-[44px] px-3 text-xs font-bold text-amber-300 border-amber-400/50';
  btn.textContent = '✨ Gold livery for this visit · watch an ad';
  panel?.append(btn, banner);

  function sync() {
    const ok = !!cfg && allowed() && !!api();
    btn.classList.toggle('hidden', !ok || gold || !slotFills(cfg, SLOTS.reward));
    const showBanner = ok && slotFills(cfg, SLOTS.title);
    banner.classList.toggle('hidden', !showBanner);
    if (showBanner && opts.inMenu() && !banner.dataset.marquee) {
      banner.dataset.marquee = SLOTS.title;
      api().banner(banner, SLOTS.title);
    }
  }

  function paint(root = opts.root()) {
    if (!gold || !root) return;
    root.traverse((o) => {
      const m = o.isMesh && o.material;
      if (!m || !m.color || m.userData.gold || m.metalness > 0.8) return; // glass stays glass
      m.userData.gold = true;
      m.color.lerp(m.color.clone().setHex(GOLD), 0.7);
      if ('metalness' in m) m.metalness = Math.max(m.metalness, 0.6);
    });
  }

  btn.addEventListener('click', () => {
    if (!ready(SLOTS.reward)) return;
    btn.disabled = true;
    api().rewarded(SLOTS.reward, hooks).then((earned) => {
      btn.disabled = false;
      if (!earned) return;
      gold = true;
      paint();
      sync();
    });
  });
  document.getElementById('assistPicker')?.addEventListener('click', () => sync());

  const m = window.marquee || (window.marquee = { q: [] });
  const start = (a) => a.ready().then((c) => { cfg = c; sync(); });
  if (m.v) start(m); else m.q.push(start);

  return {
    sync,
    paint,
    /** Between flights (FLY AGAIN): a Promise while a break may show, undefined to go on at once. */
    between() {
      const due = breakDue(brk, Date.now());
      if (!due || !ready(SLOTS.post)) return undefined;
      brk.lastBreak = Date.now();
      return api().interstitial(SLOTS.post, hooks).catch(() => {});
    },
  };
}
