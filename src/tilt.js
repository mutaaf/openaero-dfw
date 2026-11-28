// Phone tilt steering (0231): an opt-in stand-in for the on-screen stick. Hold the phone like a
// yoke: tip it right (right edge down) to roll right, tip the top toward you to raise the nose.
// A lazy chunk, fetched only when the Options toggle is tapped (or a stored "on" is resumed by
// the Start flight tap). It writes sim.tilt = { x, y, active } in the stick's units (-1..1, y +
// = nose down, as stickFromPoint), which input.js combineTargets ranks below a held stick and a
// deflected pad, so the assists, Kid's shaping and the replay read it like the stick.
//
// Angles come from DeviceOrientationEvent beta/gamma (MDN: beta about the device's x axis, + as
// the top rises; gamma about its y axis, + as the right edge drops), turned into the gravity
// vector in device axes so a phone held upright in landscape (gamma at its ±90° gimbal edge,
// where beta flips by 180°) still reads one continuous tilt, then rotated into the screen's
// axes by screen.orientation.angle. Roll and pitch are measured from a neutral captured at the
// first reading after it is switched on, at Start flight, on Resume, on Re-centre and when the
// screen rotates. Deadzone 3°, full deflection at 25°.
export const TILT_DEAD_DEG = 3;
export const TILT_FULL_DEG = 25;
const D2R = Math.PI / 180;

/** The tilt as the player sees it on this screen: { roll, pitch, angle } in degrees. roll + =
 *  the screen's right edge down, measured as that edge's lean from the true horizontal (so it is
 *  gamma flat on a table, and less than gamma when the phone is held up: asin(cos beta sin gamma));
 *  pitch + = its top edge up (0 flat on a table, 90 upright). */
export function tiltAngles(beta, gamma, screenAngle, out = {}) {
  const b = beta * D2R, g = gamma * D2R, cb = Math.cos(b);
  // Down in the device's axes (x right, y up the screen in portrait, z out of the glass).
  const dx = cb * Math.sin(g), dy = -Math.sin(b), dz = -cb * Math.cos(g);
  const a = (((screenAngle || 0) % 360) + 360) % 360 * D2R, ca = Math.cos(a), sa = Math.sin(a);
  const sx = dx * ca - dy * sa, sy = dx * sa + dy * ca; // into the screen's axes
  out.roll = Math.asin(Math.max(-1, Math.min(1, sx))) / D2R;
  out.pitch = Math.atan2(-sy, -dz) / D2R;
  out.angle = screenAngle || 0;
  return out;
}

/** One axis: degrees from neutral to -1..1 with the deadzone and the full-deflection angle. */
export function tiltAxis(deg) {
  const m = Math.abs(deg) - TILT_DEAD_DEG;
  if (!(m > 0)) return 0;
  return Math.sign(deg) * Math.min(1, m / (TILT_FULL_DEG - TILT_DEAD_DEG));
}

const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const _a = {};
/** Pure: the stick position { x, y } for this reading against a neutral from tiltAngles. x + =
 *  roll right; y + = nose down (the stick's sign: tipping the top toward you gives y < 0). */
export function tiltToStick(beta, gamma, screenAngle, neutral, out = { x: 0, y: 0 }) {
  const t = tiltAngles(beta, gamma, screenAngle, _a);
  out.x = tiltAxis(t.roll - neutral.roll);
  out.y = 0 - tiltAxis(wrap(t.pitch - neutral.pitch)); // 0 - : never -0
  return out;
}

// No reading within this long of switching on: no sensor (a desktop browser has the event but
// never fires it with angles).
export const TILT_WAIT_MS = 2000;
export const TILT_TEXT = {
  denied: 'Motion access was not allowed, so tilt stays off. Allow Motion & Orientation for this site and tap again.',
  none: 'No tilt reading came from this device (no sensor, or motion access is off), so tilt stays off.',
  // The ask threw rather than answered (WebKit: not from a tap, e.g. Esc on an iPad's keyboard).
  tap: 'Tilt steering needs a tap to start: tap Tilt in Options.',
};

/** The controller. win: window; sim.tilt is created here; live(): the flight is being flown
 *  (not paused, no start screen or results card, the tab shown). */
export function createTilt(win, sim, live) {
  const t = (sim.tilt = { x: 0, y: 0, active: false });
  let neutral = null, seen = null, on = false, gen = 0; // gen: the latest start/stop; an older start's answer is dropped
  const zero = () => { t.active = false; t.x = 0; t.y = 0; };
  const onEvent = (e) => {
    if (e.beta == null || e.gamma == null) return;
    seen?.();
    const ang = win.screen?.orientation?.angle ?? win.orientation ?? 0;
    if (!neutral || neutral.angle !== ang) neutral = tiltAngles(e.beta, e.gamma, ang);
    if (!live()) { zero(); return; }
    tiltToStick(e.beta, e.gamma, ang, neutral, t);
    t.active = true;
  };
  const onHide = () => { if (win.document.hidden) zero(); };
  function stop() {
    gen++;
    seen = null;
    on = false;
    win.removeEventListener('deviceorientation', onEvent);
    win.document.removeEventListener('visibilitychange', onHide);
    zero();
  }
  return {
    get on() { return on; },
    recentre() { neutral = null; },
    stop,
    /** Switch on: ask (the permission promise main.js started inside the tap, or undefined where
     *  none is needed), then wait for a first reading. Resolves null when on, else the reason, or
     *  undefined when a later start or a stop overtook it (its answer is not the player's). */
    async start(ask) {
      const id = ++gen;
      // iOS answers 'granted' or 'denied'; Chrome (which has the call too) can answer 'prompt'
      // where it has no prompt to show: only a refusal stops here, the first-reading wait decides.
      const r = ask && (await Promise.resolve(ask).catch(() => 'threw'));
      if (id !== gen) return undefined;
      if (r === 'denied') { stop(); return TILT_TEXT.denied; }
      if (r === 'threw') { stop(); return TILT_TEXT.tap; }
      neutral = null;
      on = true;
      const first = new Promise((res) => { seen = () => { seen = null; res(true); }; win.setTimeout(() => res(false), TILT_WAIT_MS); });
      win.addEventListener('deviceorientation', onEvent);
      win.document.addEventListener('visibilitychange', onHide);
      const got = await first;
      if (id !== gen) return undefined;
      if (got) return null;
      stop();
      return TILT_TEXT.none;
    },
  };
}
