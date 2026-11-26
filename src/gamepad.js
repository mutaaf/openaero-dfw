// Gamepad support (standard mapping). Pure helpers are unit-tested; pollGamepad() is the
// thin browser wrapper called once per frame from main.js. A lazy chunk: main.js fetches it on the
// first gamepadconnected (0161: off the boot budget; no pad, no poll).
//
// Mapping: left stick = roll/pitch (stick back = nose up), LB/RB = rudder,
// RT/LT = throttle up/down, right stick forward/back = pitch trim nose down/up (0094), A = flaps, B = gear, X = brakes, Y = camera,
// Start = pause, D-pad up = ILS autoland.

export const DEADZONE = 0.12;
export const EXPO = 0.35;

// Deadzone + expo: zero near centre, gentle around it, full scale at the edges.
export function shapeAxis(v, deadzone = DEADZONE, expo = EXPO) {
  const a = Math.abs(v);
  if (a <= deadzone) return 0;
  const n = Math.min(1, (a - deadzone) / (1 - deadzone));
  return Math.sign(v) * ((1 - expo) * n + expo * n * n * n);
}

const val = (b) => (b ? (typeof b.value === 'number' ? b.value : b.pressed ? 1 : 0) : 0);
const down = (b) => !!(b && b.pressed);

// `mapping`: the right stick's Y is axes[3] only on the 'standard' layout; elsewhere (a flight
// stick's throttle slider, Firefox/Linux pads) it is something else, so it never trims.
export function gamepadTargets(axes, buttons, mapping = 'standard') {
  const roll = shapeAxis(axes[0] || 0);
  const pitch = -shapeAxis(axes[1] || 0);
  const yaw = (down(buttons[5]) ? 1 : 0) - (down(buttons[4]) ? 1 : 0);
  const throttleRate = val(buttons[7]) - val(buttons[6]);
  const active = roll !== 0 || pitch !== 0 || yaw !== 0 || Math.abs(throttleRate) > 0.05;
  // Trim is not "flying the pad": a thumb on the trim leaves the keyboard's pitch in charge.
  const trim = mapping === 'standard' ? shapeAxis(axes[3] || 0) : 0;
  return { roll, pitch: pitch === 0 ? 0 : pitch, yaw, throttleRate: Math.abs(throttleRate) > 0.05 ? throttleRate : 0, active, trim: trim === 0 ? 0 : trim };
}

// Indices of buttons that went from released to pressed since `prev` (array of booleans).
export function buttonEdges(prev, buttons) {
  const edges = [];
  for (let i = 0; i < buttons.length; i++) {
    if (down(buttons[i]) && !prev[i]) edges.push(i);
  }
  return edges;
}

export const BUTTON = { A: 0, B: 1, X: 2, Y: 3, START: 9, DPAD_UP: 12 };
// The button each edge presses (main.js clicks it): A flaps, B gear, X brakes, Y camera,
// Start pause, D-pad up the ILS autoland.
// The toast when a pad connects (main.js): its name without the vendor/product tail, and the mapping.
export const padName = (id) => (id || 'Controller').replace(/\s*\(.*$/, '').trim() || 'Controller';
// A pad that can rumble says so, and how to stop it (0228).
const canRumble = (id) => { try { return !!navigator.getGamepads().find((p) => p?.id === id)?.vibrationActuator; } catch { return false; } };
export const connectedText = (id) => `🎮 ${padName(id)} connected: left stick flies, RT/LT throttle, A flaps, B gear, right stick trims in Pilot`
  + (canRumble(id) ? '. It rumbles: Vibrate in the menu turns that off' : '');
export const PAD_CLICKS = { [BUTTON.A]: 'btnFlaps', [BUTTON.B]: 'btnGear', [BUTTON.X]: 'btnBrakes', [BUTTON.Y]: 'btnCamera', [BUTTON.START]: 'btnPause', [BUTTON.DPAD_UP]: 'btnApApr' };

// Rumble (0228): the pad's dual-rumble motors (Gamepad API vibrationActuator.playEffect; Chromium has it,
// others may not: feature-detected) feel what the phone's haptics feel. strongMagnitude is the
// low-frequency motor, weakMagnitude the high one; both 0-1, duration in ms.
// The touchdown: a thump scaled by the sink like haptics.js touchdownPattern, 120 ms for a greaser, to
// 0.8 at 600 fpm; only past it (landing.js's crash) the full 250 ms; Kid (gentle) never gets past 0.6.
export function touchdownRumble(vsFpm, gentle = false, out = {}) {
  const sink = Math.max(0, -vsFpm) || 0;
  const k = Math.min(gentle ? 0.6 : 1, sink > 600 ? 1 : 0.8 * sink / 600);
  out.startDelay = 0;
  out.duration = Math.round(120 + 130 * k);
  out.strongMagnitude = 0.2 + 0.8 * k;
  out.weakMagnitude = 0.15 + 0.85 * k; // low for a greaser: the roll's light motor follows at once
  return out;
}

// Continuous feels are short pulses re-sent every RUMBLE_GAP_MS, each a little longer than the gap.
export const RUMBLE_GAP_MS = 100;
// In the air, the stall buffet (buffet.js writes its 0-1 intensity to sim.buffetK): mostly the heavy
// motor, from nothing as the shudder starts. On the wheels, the ground roll: the light motor, growing
// with the square of the ground speed to full at 60 kt on a piston, 120 kt on a jet (rollSound.js
// rumbleLevel's speeds), each pulse ±20% (runway texture, not a motor's whine), Kid's at 0.6; a slow
// taxi is all but still; stopped or on a belly slide, nothing. rand: 0-1 (Math.random).
export function feelRumble(sim, out = {}, rand = Math.random) {
  let strong = 0, weak = 0;
  if (!sim.onGround) {
    const k = sim.buffetK > 0.02 ? Math.min(1, sim.buffetK) : 0;
    if (k) { strong = 0.8 * k; weak = 0.3 * k; }
  } else if ((sim.gearPos ?? (sim.gearDown === false ? 0 : 1)) >= 1 && sim.gsKts > 2) {
    const r = Math.min(1, sim.gsKts / (sim.spec?.engine?.type === 'piston-prop' ? 60 : 120));
    const w = 0.4 * r * r * (0.8 + 0.4 * rand()) * (sim.assist === 'kid' ? 0.6 : 1);
    if (w >= 0.03) { weak = w; strong = 0.2 * w; }
  }
  out.startDelay = 0;
  out.duration = RUMBLE_GAP_MS + 40;
  out.strongMagnitude = strong;
  out.weakMagnitude = weak;
  return out;
}

const noop = () => {};
// One pad's rumble: call it every frame with the pad's actuator, the sim (tdT: main.js touchdownBuzz's
// sim time; lastAirVsi, assist, onGround, gsKts, gearPos, buffetK, spec), whether it may play
// (the haptics setting, no reduced motion, flying: no start screen, results card, pause or replay)
// and the wall clock in ms. One params object for every effect; never throws; a touchdown while it
// may not play is not felt later; a pad whose promise rejects is left alone for 5 s.
export function createRumble() {
  const fx = { startDelay: 0, duration: 0, strongMagnitude: 0, weakMagnitude: 0 };
  let lastTd, nextAt = 0, playing = false, mutedUntil = -Infinity, lastT = 0;
  const onFail = () => { mutedUntil = lastT + 5000; playing = false; };
  const play = (act) => {
    try {
      act.playEffect('dual-rumble', fx)?.catch?.(onFail);
      playing = true;
    } catch { onFail(); }
  };
  return (act, sim, on, t) => {
    lastT = t;
    const td = sim.tdT;
    const fresh = td !== lastTd && Number.isFinite(td) && sim.simTime - td < 0.25;
    lastTd = td;
    if (!on || typeof act?.playEffect !== 'function' || t < mutedUntil) {
      if (playing) { try { act?.reset?.()?.catch?.(noop); } catch { /* best-effort */ } }
      playing = false;
      return false;
    }
    if (fresh) {
      touchdownRumble(sim.lastAirVsi, sim.assist === 'kid', fx);
      nextAt = t + fx.duration;
      play(act);
      return true;
    }
    if (t < nextAt) return false;
    feelRumble(sim, fx);
    if (!(fx.strongMagnitude > 0 || fx.weakMagnitude > 0)) return false; // the last pulse ends by itself
    nextAt = t + RUMBLE_GAP_MS;
    play(act);
    return true;
  };
}

// Browser wrapper, from pollGamepad each frame with main.js's sim and haptics setting (`on`). It plays
// only in a flight the player is flying: no start screen (#onboardingModal) or results card up, not
// paused, not in the replay (body.replaying), no reduced motion (the rumble is motion-like;
// haptics.js keeps one tick there, a pad keeps none). A pad that can rumble shows the Options' Vibrate
// toggle (main.js binds it; on a phone it is shown already).
const padRumble = createRumble();
let curPad = null, toggleShown = false, els = null, reduced = null;
const hidden = (el) => !el || el.classList.contains('hidden');
function rumble(sim, on) {
  const act = curPad?.vibrationActuator;
  if (act && !toggleShown) {
    toggleShown = true;
    const btn = document.getElementById('btnHaptics');
    btn?.classList.remove('hidden');
    // Turning it on answers in kind, as the phone's tick does (main.js's handler ran first: aria-pressed is the new state).
    btn?.addEventListener('click', () => {
      const a = curPad?.vibrationActuator;
      if (btn.getAttribute('aria-pressed') !== 'true' || typeof a?.playEffect !== 'function') return;
      try { a.playEffect('dual-rumble', touchdownRumble(0))?.catch?.(noop); } catch { /* best-effort */ }
    });
  }
  if (on && act) {
    els ??= [document.getElementById('onboardingModal'), document.getElementById('resultsCard')];
    reduced ??= globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? { matches: false };
    on = !sim.paused && !reduced.matches && hidden(els[0]) && hidden(els[1]) && !document.body.classList.contains('replaying');
  }
  return padRumble(act, sim, !!on, performance.now());
}

// Browser wrapper: returns { targets, edges, id } for the first connected pad, or null; given a sim,
// it rumbles that pad too (0228).
let prevPressed = [];
export function pollGamepad(sim, rumbleOn = false) {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  const pads = navigator.getGamepads();
  for (const p of pads) {
    if (!p || !p.connected) continue;
    const targets = gamepadTargets(p.axes, p.buttons, p.mapping);
    const edges = buttonEdges(prevPressed, p.buttons);
    prevPressed = Array.from(p.buttons, down);
    curPad = p;
    if (sim) rumble(sim, rumbleOn);
    return { targets, edges, id: p.id };
  }
  prevPressed = [];
  curPad = null;
  return null;
}
