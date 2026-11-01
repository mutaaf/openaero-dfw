// Controls cheat sheet (ticket 0049): keyboard, gamepad and touch, one "?" or one Controls button
// away. A lazy chunk: main.js imports it on the first open. The rows are data so a unit test can hold
// them to the bindings (tests/unit/controlsSheet.test.js fails when a bound key has no row).
// codes: KeyboardEvent.code values (main.js e.code / keys[], input.js), keys: KeyboardEvent.key values,
// buttons: gamepad.js BUTTON names, ids: the touch deck's element ids (index.html).

export const KEYBOARD = [
  { input: 'W or ↓', does: 'Nose down', codes: ['KeyW', 'ArrowDown'] },
  { input: 'S or ↑', does: 'Nose up', codes: ['KeyS', 'ArrowUp'] },
  { input: 'A or ←  /  D or →', does: 'Bank left / right', codes: ['KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight'] },
  { input: 'Q / E', does: 'Rudder: swing the nose left / right', codes: ['KeyQ', 'KeyE'] },
  { input: 'Shift / Ctrl (hold)', does: 'More power / less power', codes: ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'] },
  { input: '[ / ]  (Num 7 / Num 1)', does: 'Trim (holds the nose where you set it) down / up (Pilot; not the F-16)', codes: ['BracketLeft', 'BracketRight', 'Numpad7', 'Numpad1'] },
  { input: 'Space', does: 'Center the controls and stop any rotation (a sim helper)', codes: ['Space'] },
  { input: 'G', does: 'Gear up / down (in the air; not the Cessna)', codes: ['KeyG'] },
  { input: 'F', does: 'Flaps: next notch', codes: ['KeyF'] },
  { input: 'B', does: 'Brakes on / off', codes: ['KeyB'] },
  { input: 'K', does: 'Autobrake setting (737)', codes: ['KeyK'] },
  { input: 'R', does: 'Reverse thrust on the ground (737; power goes to idle)', codes: ['KeyR'] },
  { input: 'Z', does: 'Autopilot on / off', codes: ['KeyZ'] },
  { input: 'C', does: 'Next camera view', codes: ['KeyC'] },
  { input: 'M', does: 'Fly with the mouse on / off', codes: ['KeyM'] },
  { input: 'H', does: 'Show / hide the instrument panels', codes: ['KeyH'] },
  { input: '?', does: 'This controls sheet', keys: ['?'] },
  { input: 'Esc', does: 'Close a menu or this sheet', keys: ['Escape'] },
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
];

// A touch screen reads its own controls first.
export function sheetSections(touch) {
  const kb = { title: 'Keyboard and mouse', rows: KEYBOARD };
  const pad = { title: 'Gamepad', rows: GAMEPAD };
  const t = { title: 'Touch', rows: TOUCH };
  return touch ? [t, kb, pad] : [kb, pad, t];
}

// --- The sheet itself (DOM). The shell is #controlsSheet in index.html. ---
let filled = false;
let opener = null;
let resume = null; // undoes the pause on close, if the sheet made it
const el = (id) => document.getElementById(id);
const isOpen = () => !el('controlsSheet').classList.contains('hidden');

function fill(touch) {
  const body = el('controlsBody');
  body.textContent = '';
  for (const s of sheetSections(touch)) {
    const sec = document.createElement('section');
    const h = document.createElement('h3');
    h.className = 'text-[11px] font-bold uppercase tracking-wider text-sky-300 mb-1';
    h.textContent = s.title;
    const dl = document.createElement('dl');
    dl.className = 'controls-list';
    for (const r of s.rows) {
      const dt = document.createElement('dt');
      dt.textContent = r.input;
      const dd = document.createElement('dd');
      dd.textContent = r.does;
      dl.append(dt, dd);
    }
    sec.append(h, dl);
    body.append(sec);
  }
}

export function closeControls(restoreFocus = true) {
  if (!isOpen()) return;
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
  if (!filled) {
    filled = true;
    fill(touch);
    el('btnCloseControls').addEventListener('click', (e) => closeControls(e.detail === 0));
    el('controlsSheet').addEventListener('pointerdown', (e) => { if (e.target === e.currentTarget) closeControls(false); });
    // While open the sheet owns the keyboard: no flight key, nor the start screen's Escape or Tab
    // trap, reaches anything behind it. Escape and "?" close it; Tab cycles inside.
    document.addEventListener('keydown', (e) => {
      if (!isOpen()) return;
      e.stopImmediatePropagation();
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
