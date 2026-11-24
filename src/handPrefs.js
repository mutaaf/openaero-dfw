// Left-handed touch layout (0221): the stick under the left thumb, the throttle (and the trim or
// pedals beside it) under the right, the function buttons between them. main.js sets the root
// class `lefty` on touch-only screens; styles.css mirrors the deck. Right-handed by default;
// remembered as openaero_hand_v1 = { v: 1, left, at }. Pure, storage passed in (it may be null or
// throw in private mode).
export const HAND_KEY = 'openaero_hand_v1';

export function loadLeftHanded(storage) {
  try {
    const d = JSON.parse(storage.getItem(HAND_KEY) || 'null');
    return !!d && d.v === 1 && d.left === true;
  } catch {
    return false;
  }
}

export function saveLeftHanded(storage, left, now = Date.now()) {
  try { storage.setItem(HAND_KEY, JSON.stringify({ v: 1, left: !!left, at: now })); } catch { /* private mode */ }
}
