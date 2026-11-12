// Controls cheat sheet (ticket 0049): keyboard, gamepad and touch, one "?" or one Controls button
// away. A lazy chunk: main.js imports it on the first open. The rows are data so a unit test can hold
// them to the bindings (tests/unit/controlsSheet.test.js fails when a bound key has no row).
// codes: KeyboardEvent.code values (main.js e.code / keys[], input.js), keys: KeyboardEvent.key values,
// buttons: gamepad.js BUTTON names, ids: the touch deck's element ids (index.html).
// acts (0171): keyMap.js actions; the sheet prints the player's own keys for those rows (codes stay the
// defaults, which is what every handler reads through input.js keyCode).
import { setKeyMap } from './input.js';
import { DEFAULT_KEYS, ACTION_WORDS, defaultMap, keyTable, rebindKey, keyLabel, pressedLabel, saveKeys, clearKeys, loadKeys } from './keyMap.js';

export const KEYBOARD = [
  { input: 'W or ↓', does: 'Nose down', codes: ['KeyW', 'ArrowDown'], acts: ['pitchDown'] },
  { input: 'S or ↑', does: 'Nose up', codes: ['KeyS', 'ArrowUp'], acts: ['pitchUp'] },
  { input: 'A or ←  /  D or →', does: 'Bank left / right', codes: ['KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight'], acts: ['bankLeft', 'bankRight'] },
  { input: 'Q / E', does: 'Rudder: swing the nose left / right', codes: ['KeyQ', 'KeyE'], acts: ['yawLeft', 'yawRight'] },
  { input: 'Shift / Ctrl (hold)', does: 'More power / less power', codes: ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'], acts: ['powerUp', 'powerDown'], hold: true },
  { input: '[ / ]  (Num 7 / Num 1)', does: 'Trim (holds the nose where you set it) down / up (Pilot; not the F-16)', codes: ['BracketLeft', 'BracketRight', 'Numpad7', 'Numpad1'], acts: ['trimDown', 'trimUp'] },
  { input: 'Space', does: 'Center the controls and stop any rotation (a sim helper)', codes: ['Space'], acts: ['center'] },
  { input: 'G', does: 'Gear up / down (in the air; not the Cessna)', codes: ['KeyG'], acts: ['gear'] },
  { input: 'F', does: 'Flaps: next notch', codes: ['KeyF'], acts: ['flaps'] },
  { input: 'B', does: 'Brakes on / off', codes: ['KeyB'], acts: ['brakes'] },
  { input: 'K', does: 'Autobrake setting (737)', codes: ['KeyK'], acts: ['autobrake'] },
  { input: 'R', does: 'Reverse thrust on the ground (737; power goes to idle)', codes: ['KeyR'], acts: ['reverse'] },
  { input: 'Z', does: 'Autopilot on / off', codes: ['KeyZ'], acts: ['autopilot'] },
  { input: 'C', does: 'Next camera view', codes: ['KeyC'], acts: ['camera'] },
  { input: 'M', does: 'Fly with the mouse on / off', codes: ['KeyM'], acts: ['mouseYoke'] },
  { input: 'H', does: 'Show / hide the instrument panels', codes: ['KeyH'], acts: ['panels'] },
  { input: 'L', does: 'Landing light on / off (it lights the ground ahead at night)', codes: ['KeyL'], acts: ['landingLight'] },
  { input: '?', does: 'This controls sheet', keys: ['?'] },
  { input: 'Esc', does: 'Close a menu, the ATIS briefing or this sheet', keys: ['Escape'] },
  { input: 'Tab', does: 'Move between buttons in a menu', keys: ['Tab'] },
  { input: 'Mouse drag / wheel', does: 'Look around / zoom the outside view' },
];

export const GAMEPAD = [
  { input: 'Left stick', does: 'Nose up / down and bank (back = nose up)' },
  { input: 'LB / RB', does: 'Rudder: swing the nose left / right' },
  { input: 'RT / LT', does: 'More power / less power' },
  { input: 'Right stick fwd / back', does: 'Trim (holds the nose where you set it) down / up (Pilot; not the F-16)' },
  { input: 'A', does: 'Flaps: next notch', buttons: ['A'] },
  { input: 'B', does: 'Gear up / down (in the air; not the Cessna)', buttons: ['B'] },
  { input: 'X', does: 'Brakes on / off', buttons: ['X'] },
  { input: 'Y', does: 'Next camera view', buttons: ['Y'] },
  { input: 'Start', does: 'Pause / resume', buttons: ['START'] },
  { input: 'D-pad up', does: 'ILS autoland', buttons: ['DPAD_UP'] },
];

export const TOUCH = [
  { input: 'Right stick', does: 'Drag it: up = nose up, sideways banks (on Pilot it also steers on the ground)', ids: ['touchStick'] },
  { input: 'Left slider', does: 'Power: top is full, bottom is idle', ids: ['touchThrottle'] },
  { input: 'NOSE UP / NOSE DN', does: 'Hold to trim (Pilot; not the F-16)', ids: ['touchTrimUp', 'touchTrimDn'] },
  { input: 'GEAR', does: 'Gear up / down (in the air; not the Cessna)', ids: ['touchGear'] },
  { input: 'FLAPS', does: 'Flaps: next notch', ids: ['touchFlaps'] },
  { input: 'BRAKES', does: 'Brakes on / off', ids: ['touchBrakes'] },
  { input: 'ILS AUTO / REV', does: 'ILS autoland; REV on the 737 on the ground: reverse thrust', ids: ['touchIls'] },
  { input: '☰ Menu', does: 'Pause, camera, sound, missions, reset' },
  { input: '💡 ON / OFF (in ☰ Menu)', does: 'Landing light: lights the runway ahead at night' },
];

// A touch screen reads its own controls first.
export function sheetSections(touch) {
  const kb = { title: 'Keyboard and mouse', rows: KEYBOARD };
  const pad = { title: 'Gamepad', rows: GAMEPAD };
  const t = { title: 'Touch', rows: TOUCH };
  return touch ? [t, kb, pad] : [kb, pad, t];
}

// --- The player's keys (0171). bound: the map in use and the names keys printed when bound. ---
let bound = loadKeys() ?? { map: defaultMap(), labels: {} };
let layout = null; // Chromium's keyboard layout map: an AZERTY "A" on KeyQ reads A
try { navigator.keyboard?.getLayoutMap?.().then((m) => { layout = m; labelKeys(); }, () => {}); } catch { /* no layout API */ }
const label = (code) => keyLabel(code, bound.labels, layout);
// A row's keys as the player has them: each action's keys (one name once: Shift, not "Shift or Shift").
export function keysText(acts, map = bound.map, name = label) {
  return acts.map((a) => [...new Set(map[a].map(name))].join(' or ')).join(' / ');
}
// The in-flight key strip (index.html #keyHints, kbd data-k = an action) prints the player's key.
export function labelKeys() {
  for (const k of document.querySelectorAll('#keyHints kbd[data-k]')) k.textContent = label(bound.map[k.dataset.k][0]);
}
// main.js at boot when a map is stored: use it.
export function useStoredKeys() {
  setKeyMap(keyTable(bound.map));
  labelKeys();
}

// --- The sheet itself (DOM). The shell is #controlsSheet in index.html. ---
let filled = false;
let opener = null;
let resume = null; // undoes the pause on close, if the sheet made it
let lastTouch = false;
let capturing = null; // the action whose key the next keypress binds (Keys view)
const el = (id) => document.getElementById(id);
const isOpen = () => !el('controlsSheet').classList.contains('hidden');
const make = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const H3 = 'text-[11px] font-bold uppercase tracking-wider text-sky-300 mb-1';

function fill(touch) {
  capturing = null;
  const body = el('controlsBody');
  body.textContent = '';
  for (const s of sheetSections(touch)) {
    const sec = make('section');
    const dl = make('dl', 'controls-list');
    for (const r of s.rows) dl.append(make('dt', null, r.acts ? keysText(r.acts) + (r.hold ? ' (hold)' : '') : r.input), make('dd', null, r.does));
    sec.append(make('h3', H3, s.title), dl);
    if (s.rows === KEYBOARD) {
      const b = make('button', 'hud-btn mt-2 min-h-[44px] px-3 rounded-lg text-xs font-bold text-slate-200', '⌨ CHANGE KEYS');
      b.id = 'btnKeys';
      b.addEventListener('click', () => showKeys('btnKeys_' + Object.keys(DEFAULT_KEYS)[0]));
      sec.append(b);
    }
    body.append(sec);
  }
}

// The Keys view: each action, its key on a button; press the button, then the key. Escape cancels a
// capture; a key another action has is refused, naming it; Reset to defaults; Back to the sheet.
function showKeys(focusId, msg = '') {
  capturing = null;
  const body = el('controlsBody');
  body.textContent = '';
  const sec = make('section', 'col-span-full');
  sec.append(make('h3', H3, 'Your keys'),
    make('p', 'text-xs text-slate-300 mb-2', 'Press a button, then the key you want. Esc cancels. Saved on this device; the arrows, Num 7 / Num 1 and the right-hand Shift and Ctrl keep working.'));
  const dl = make('dl', 'controls-list keys-list');
  for (const a in DEFAULT_KEYS) {
    const [first, ...rest] = bound.map[a];
    const b = make('button', 'hud-btn min-h-[44px] min-w-[64px] px-3 rounded-lg text-xs font-bold font-mono text-white', label(first));
    b.id = 'btnKeys_' + a;
    b.dataset.act = a;
    b.setAttribute('aria-label', `${ACTION_WORDS[a]}: ${label(first)}. Change`);
    b.addEventListener('click', () => {
      capturing = a;
      b.textContent = 'Press a key…';
      el('txtKeysMsg').textContent = `Press the key for ${ACTION_WORDS[a]}, or Esc to cancel.`;
    });
    const dd = make('dd', 'flex items-center gap-2');
    dd.append(b);
    const alt = [...new Set(rest.map(label))].filter((n) => n !== label(first));
    if (alt.length) dd.append(make('span', 'text-xs text-slate-300', 'also ' + alt.join(', ')));
    dl.append(make('dt', null, ACTION_WORDS[a]), dd);
  }
  const status = make('p', 'text-xs text-amber-200 min-h-[1.25rem] mt-2', msg);
  status.id = 'txtKeysMsg';
  status.setAttribute('role', 'status');
  const row = make('div', 'flex flex-wrap gap-2 mt-1');
  const reset = make('button', 'hud-btn min-h-[44px] px-3 rounded-lg text-xs font-bold text-slate-200', 'RESET TO DEFAULTS');
  reset.id = 'btnKeysReset';
  reset.addEventListener('click', () => {
    bound = { map: defaultMap(), labels: {} };
    clearKeys();
    useStoredKeys();
    showKeys('btnKeysReset', 'Every key is back to the default.');
  });
  const back = make('button', 'hud-btn min-h-[44px] px-3 rounded-lg text-xs font-bold text-slate-200', '← BACK');
  back.id = 'btnKeysBack';
  back.addEventListener('click', () => { fill(lastTouch); focusIn('btnKeys'); });
  row.append(reset, back);
  sec.append(dl, status, row);
  body.append(sec);
  if (focusId === 'btnKeys_' + Object.keys(DEFAULT_KEYS)[0]) body.scrollTop = 0; // in from the sheet: the top
  focusIn(focusId);
}
const focusIn = (id) => { const n = el(id); n?.focus({ preventScroll: true }); n?.scrollIntoView({ block: 'nearest' }); };

// A key pressed while a Keys button waits for one.
function capture(e) {
  const a = capturing;
  if (e.key === 'Escape') return showKeys('btnKeys_' + a, 'Not changed.');
  const r = rebindKey(bound.map, a, e.code);
  const name = pressedLabel(e);
  if (r.reserved) return showKeys('btnKeys_' + a, `${name} can't be a flight key: it runs the menus. Pick another.`);
  if (r.conflict) return showKeys('btnKeys_' + a, r.conflict === a
    ? `${name} is already ${ACTION_WORDS[a]}.`
    : `${name} is already ${ACTION_WORDS[r.conflict]}: change that one first.`);
  const labels = { ...bound.labels, [e.code]: name };
  for (const c in labels) if (!Object.values(r.map).some((l) => l.includes(c))) delete labels[c];
  bound = { map: r.map, labels };
  const saved = saveKeys(bound.map, bound.labels);
  useStoredKeys();
  showKeys('btnKeys_' + a, `${ACTION_WORDS[a]} is now ${name}.` + (saved ? '' : " (This browser won't keep it after a reload.)"));
}

export function closeControls(restoreFocus = true) {
  if (!isOpen()) return;
  capturing = null;
  el('controlsSheet').classList.add('hidden');
  resume?.();
  resume = null;
  if (restoreFocus && opener?.offsetParent) opener.focus({ preventScroll: true });
  else document.activeElement?.blur();
  opener = null;
}

// pause(): pauses the flight and returns a function that undoes it (or null if it was already paused).
export function openControls({ from, touch, pause }) {
  if (isOpen()) return;
  lastTouch = !!touch;
  fill(lastTouch); // every open: the rows print the player's keys as they are now
  if (!filled) {
    filled = true;
    el('btnCloseControls').addEventListener('click', (e) => closeControls(e.detail === 0));
    // A tap on the dimmed backdrop closes it on click, not pointerdown: closing on pointerdown let the
    // tap's click land on the control behind (GEAR, ☰ Menu).
    el('controlsSheet').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeControls(false); });
    // While open the sheet owns the keyboard: no flight key, nor the start screen's Escape or Tab
    // trap, reaches anything behind it. Escape and "?" close it; Tab cycles inside.
    document.addEventListener('keydown', (e) => {
      if (!isOpen()) return;
      e.stopImmediatePropagation();
      if (e.repeat) { e.preventDefault(); return; } // a held "?" must not flicker it
      if (capturing) { e.preventDefault(); capture(e); return; } // the Keys view waits for a key (0171)
      if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); closeControls(); return; }
      if (e.key !== 'Tab') return;
      const panel = el('controlsPanel');
      const items = [...panel.querySelectorAll('button, a[href], [tabindex="0"]')];
      const i = items.indexOf(document.activeElement), n = items.length;
      e.preventDefault();
      if (n) items[i < 0 ? (e.shiftKey ? n - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + n) % n].focus();
    }, true);
  }
  opener = from ?? null;
  resume = pause();
  // On the start screen there is no flight to pause yet: don't say there is.
  el('txtControlsPaused').classList.toggle('hidden', !el('onboardingModal').classList.contains('hidden'));
  el('controlsSheet').classList.remove('hidden');
  el('controlsPanel').focus({ preventScroll: true });
}
