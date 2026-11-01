// Haptics (0033): a short buzz on the phone at touchdown (stronger when it is hard), a pulse
// at the stall warning's and the GPWS pull-up's onset. navigator.vibrate is Android
// Chrome/Firefox only (iOS Safari has none), so this is an enhancement: feature-detected,
// try/caught, never waited on. Pure; the navigator and storage are passed in.
// Remembered as openaero_haptics_v1 = { v: 1, on, at }; on by default.
export const HAPTICS_KEY = 'openaero_haptics_v1';

// The sink bands follow landing.js's rate curve and crash rule (sink = max(0, -vsFpm)): full-ish
// marks to 240 fpm, a crash only past 600. 40 ms is the shortest a phone motor reliably spins up.
// gentle (Kid): no crash thump, its crash is a "Boing!" and a try again.
export const TICK = [40];
export function touchdownPattern(vsFpm, reduced = false, gentle = false) {
  const sink = Math.max(0, -vsFpm) || 0;
  if (reduced || sink < 240) return TICK;
  return sink <= 600 || gentle ? [80] : [80, 40, 120];
}

const ALERTS = { stall: [40, 60, 40, 60, 40], pullup: [120, 80, 120] };
// Alerts are motion-like: skipped under prefers-reduced-motion (the banner and voice stay).
export const alertPattern = (kind, reduced = false) => (reduced ? null : ALERTS[kind] ?? null);

export const patternMs = (p) => p.reduce((a, b) => a + b, 0);

// Onset detector: true on the frame a warning comes on, then not again until it has been
// off and holdS seconds have passed since the last buzz (a flickering warning is one buzz).
export function createAlertEdge(holdS = 3) {
  let was = false, lastT = -Infinity;
  return (on, t) => {
    const fire = on && !was && t - lastT >= holdS;
    if (fire) lastT = t;
    was = on;
    return fire;
  };
}

export const hapticsSupported = (nav) => typeof nav?.vibrate === 'function';

export function buzz(nav, pattern) {
  if (!pattern || !hapticsSupported(nav)) return false;
  try { return nav.vibrate(pattern) !== false; } catch { return false; }
}

export function loadHaptics(storage) {
  try {
    const d = JSON.parse(storage.getItem(HAPTICS_KEY) || 'null');
    return d && d.v === 1 && typeof d.on === 'boolean' ? d.on : true;
  } catch {
    return true;
  }
}

export function saveHaptics(storage, on, now = Date.now()) {
  try { storage.setItem(HAPTICS_KEY, JSON.stringify({ v: 1, on: !!on, at: now })); } catch { /* private mode */ }
}
