// Rebindable keys (ticket 0171): the binding table, its storage and the rebinding. A lazy chunk
// (imported by controlsSheet.js): boot only has input.js keyCode/setKeyMap, which read the Map built
// here. Pure but for saveKeys/clearKeys, unit-tested (tests/unit/input.test.js).
//
// Each action's KeyboardEvent.codes; the first is the one a player rebinds, the rest (the arrows,
// the numpad trim keys, the right-hand Shift and Ctrl) stay. With no stored map every key is the
// default (keyCode passes it through).

export const DEFAULT_KEYS = {
  pitchDown: ['KeyW', 'ArrowDown'], pitchUp: ['KeyS', 'ArrowUp'],
  bankLeft: ['KeyA', 'ArrowLeft'], bankRight: ['KeyD', 'ArrowRight'],
  yawLeft: ['KeyQ'], yawRight: ['KeyE'],
  powerUp: ['ShiftLeft', 'ShiftRight'], powerDown: ['ControlLeft', 'ControlRight'],
  trimDown: ['BracketLeft', 'Numpad7'], trimUp: ['BracketRight', 'Numpad1'],
  center: ['Space'], gear: ['KeyG'], flaps: ['KeyF'], brakes: ['KeyB'], autobrake: ['KeyK'],
  reverse: ['KeyR'], autopilot: ['KeyZ'], camera: ['KeyC'], mouseYoke: ['KeyM'], panels: ['KeyH'],
  landingLight: ['KeyL'],
};

// What each action does, in the Keys sheet's words (and a conflict's: "J is already Bank right").
export const ACTION_WORDS = {
  pitchDown: 'Nose down', pitchUp: 'Nose up', bankLeft: 'Bank left', bankRight: 'Bank right',
  yawLeft: 'Rudder left', yawRight: 'Rudder right', powerUp: 'More power (hold)', powerDown: 'Less power (hold)',
  trimDown: 'Trim nose down', trimUp: 'Trim nose up', center: 'Center the controls', gear: 'Gear up / down',
  flaps: 'Flaps: next notch', brakes: 'Brakes on / off', autobrake: 'Autobrake setting (737)',
  reverse: 'Reverse thrust (737)', autopilot: 'Autopilot on / off', camera: 'Next camera view',
  mouseYoke: 'Fly with the mouse', panels: 'Show / hide the panels', landingLight: 'Landing light',
};

export const KEYS_STORE = 'openaero_keys_v1';
// Keys a flight key can't take: Tab and Escape run the menus and this sheet; the OS keys belong to the OS.
const RESERVED = /^(Tab|Escape|Meta\w*|OS\w*|ContextMenu|Unidentified)?$/;
const CODE = /^[A-Z]\w{1,24}$/;

export const defaultMap = () => Object.fromEntries(Object.entries(DEFAULT_KEYS).map(([a, l]) => [a, [...l]]));

// The Map input.js setKeyMap takes: each bound code -> the default code at its slot, and ' ' + every
// default code (a default key moved away gives null). null for the defaults themselves.
export function keyTable(map) {
  if (!map || Object.keys(DEFAULT_KEYS).every((a) => map[a].every((c, i) => c === DEFAULT_KEYS[a][i]))) return null;
  const t = new Map();
  for (const a in DEFAULT_KEYS) DEFAULT_KEYS[a].forEach((d, i) => { t.set(' ' + d, d); t.set(map[a][i], d); });
  return t;
}

// The stored { v: 1, map, labels, at } as { map, labels }, or null (the defaults): JSON that does not
// parse or is not v 1 is null; an action whose list is not plain codes of the default's length keeps its
// default; a code bound twice drops the whole map. labels: the key each code printed when it was bound.
export function readKeys(raw) {
  let o;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || o.v !== 1 || typeof o.map !== 'object' || !o.map) return null;
  const map = {}, seen = new Set();
  for (const a in DEFAULT_KEYS) {
    const l = o.map[a];
    const ok = Array.isArray(l) && l.length === DEFAULT_KEYS[a].length && l.every((c) => typeof c === 'string' && CODE.test(c) && !RESERVED.test(c));
    map[a] = ok ? [...l] : [...DEFAULT_KEYS[a]];
    for (const c of map[a]) { if (seen.has(c)) return null; seen.add(c); }
  }
  const labels = {};
  if (o.labels && typeof o.labels === 'object') {
    for (const c in o.labels) if (seen.has(c) && typeof o.labels[c] === 'string' && o.labels[c].length <= 12) labels[c] = o.labels[c];
  }
  return { map, labels };
}

export const ownerOf = (map, code) => Object.keys(map).find((a) => map[a].includes(code)) ?? null;

// Bind `code` as `act`'s key (its first slot). Returns { map } (a new map), or { conflict: action } when
// another action (or another slot of this one) has the code, or { reserved: true } for Tab/Escape/OS keys.
export function rebindKey(map, act, code) {
  if (!DEFAULT_KEYS[act]) throw new Error(`no action ${act}`);
  if (RESERVED.test(code) || !CODE.test(code)) return { reserved: true };
  const owner = ownerOf(map, code);
  if (owner && !(owner === act && map[act][0] === code)) return { conflict: owner };
  const next = Object.fromEntries(Object.entries(map).map(([a, l]) => [a, [...l]]));
  next[act][0] = code;
  return { map: next };
}

// A key's name on screen: the one it printed when bound (labels), else the keyboard layout's (Chromium's
// navigator.keyboard.getLayoutMap, `layout`), else a name from the code (US layout).
const NAMED = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftLeft: 'Shift', ShiftRight: 'Shift',
  ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt', BracketLeft: '[', BracketRight: ']',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Minus: '-', Equal: '=',
  Backquote: '`', Space: 'Space', Enter: 'Enter', Backspace: 'Backspace', IntlBackslash: '\\',
};
export function keyLabel(code, labels = {}, layout = null) {
  if (labels[code]) return labels[code];
  const l = layout?.get?.(code);
  if (typeof l === 'string' && l.length === 1 && l !== ' ') return l.toUpperCase();
  return NAMED[code] ?? code.replace(/^Key|^Digit/, '').replace(/^Numpad(\w+)/, 'Num $1');
}
// The name to keep for a key pressed in the Keys sheet: the character it typed, if it typed one.
export const pressedLabel = (e) => (e.key?.length === 1 && e.key !== ' ' ? e.key.toUpperCase() : keyLabel(e.code));

export function saveKeys(map, labels) {
  try { localStorage.setItem(KEYS_STORE, JSON.stringify({ v: 1, map, labels, at: Date.now() })); return true; } catch { return false; }
}
export function clearKeys() {
  try { localStorage.removeItem(KEYS_STORE); } catch { /* nothing stored anyway */ }
}
export function loadKeys() {
  try { return readKeys(localStorage.getItem(KEYS_STORE)); } catch { return null; }
}
