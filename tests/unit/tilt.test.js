import { describe, it, expect, vi } from 'vitest';
import { tiltAngles, tiltAxis, tiltToStick, createTilt, TILT_DEAD_DEG, TILT_FULL_DEG, TILT_WAIT_MS, TILT_TEXT } from '../../src/tilt.js';

// Ticket 0231: phone tilt steering. beta/gamma are DeviceOrientationEvent's (MDN): beta + as the
// top rises (0 flat, 90 upright), gamma + as the right edge drops. Stick units: x + roll right,
// y + nose down (the top of the touch stick, y < 0, is nose up).
const N = (beta, gamma, angle = 0) => tiltAngles(beta, gamma, angle);

describe('tiltAngles: the tilt in the screen\'s axes', () => {
  it('portrait: roll is gamma and pitch is beta for a phone held up at 45°', () => {
    const t = tiltAngles(45, 0, 0);
    expect(t.roll).toBeCloseTo(0, 6);
    expect(t.pitch).toBeCloseTo(45, 6);
    expect(tiltAngles(0, 10, 0).roll).toBeCloseTo(10, 6);
    expect(tiltAngles(0, -10, 0).roll).toBeCloseTo(-10, 6);
  });
  it('landscape (90: the phone\'s top to the left) reads the same yoke as portrait', () => {
    // Screen right edge = the device's bottom: dropping it raises the top, beta +.
    expect(tiltAngles(10, 0, 90).roll).toBeCloseTo(10, 6);
    // Screen top = the device's right edge: raising it is gamma -.
    expect(tiltAngles(0, -30, 90).pitch).toBeCloseTo(30, 6);
    expect(tiltAngles(-10, 0, 270).roll).toBeCloseTo(10, 6);
    expect(tiltAngles(0, 30, 270).pitch).toBeCloseTo(30, 6);
    expect(tiltAngles(0, -10, 180).roll).toBeCloseTo(10, 6);
  });
  it('upright in landscape: past gamma 90 the browser reports beta 180, gamma -89, the same tilt', () => {
    // A phone turned 91° about its long axis is reported as (beta 180, gamma -89): gamma is ±90 only.
    const a = tiltAngles(0, 91, 90), b = tiltAngles(180, -89, 90), c = tiltAngles(0, 89, 90);
    expect(b.roll).toBeCloseTo(a.roll, 6);
    expect(b.pitch).toBeCloseTo(a.pitch, 6);
    expect(Math.abs(b.pitch - c.pitch)).toBeCloseTo(2, 6); // 2° of real tilt, not a 180° jump
  });
  it('held up, roll is the screen edge\'s lean from level: asin(cos beta sin gamma)', () => {
    expect(tiltAngles(40, 25, 0).roll).toBeCloseTo(Math.asin(Math.cos(40 * Math.PI / 180) * Math.sin(25 * Math.PI / 180)) * 180 / Math.PI, 9);
  });
});

describe('tiltAxis and tiltToStick: deadzone, full deflection, clamp', () => {
  it('inside the deadzone is 0; full at 25°; clamped past it; odd', () => {
    expect(tiltAxis(0)).toBe(0);
    expect(tiltAxis(TILT_DEAD_DEG)).toBe(0);
    expect(tiltAxis(-2.9)).toBe(0);
    expect(tiltAxis(TILT_FULL_DEG)).toBeCloseTo(1, 9);
    expect(tiltAxis(-TILT_FULL_DEG)).toBeCloseTo(-1, 9);
    expect(tiltAxis(60)).toBe(1);
    expect(tiltAxis(-60)).toBe(-1);
    expect(tiltAxis(14)).toBeCloseTo(0.5, 9);
    expect(tiltAxis(NaN)).toBe(0);
  });
  it('the neutral gives 0 in any orientation', () => {
    for (const [b, g, a] of [[40, 0, 0], [30, 12, 0], [10, -70, 90], [-20, 60, 270], [130, 5, 180]]) {
      const s = tiltToStick(b, g, a, N(b, g, a));
      expect(s.x).toBe(0);
      expect(s.y).toBe(0);
    }
  });
  it('portrait: right edge down rolls right; the top toward you is nose up (y < 0)', () => {
    const n = N(40, 0);
    expect(tiltToStick(0, 25, 0, N(0, 0)).x).toBeCloseTo(1, 9); // flat: 25° of gamma is full
    expect(tiltToStick(40, 40, 0, n).x).toBe(1); // held up at 40°: the edge leans 29.5°
    expect(tiltToStick(40, -40, 0, n).x).toBe(-1);
    expect(tiltToStick(40, 25, 0, n).x).toBeCloseTo(tiltAxis(tiltAngles(40, 25, 0).roll), 9);
    expect(tiltToStick(40 + 25, 0, 0, n).y).toBeCloseTo(-1, 6);
    expect(tiltToStick(40 - 14, 0, 0, n).y).toBeCloseTo(0.5, 6);
    expect(tiltToStick(40 + 50, 0, 0, n).y).toBe(-1);
  });
  it('landscape held upright: a steering-wheel tip and a pull read the same way', () => {
    // Held near upright in landscape (90): neutral at gamma -80; top toward you raises the screen's top.
    const n = N(0, -60, 90);
    expect(tiltToStick(25, -60, 90, n).x).toBeGreaterThan(0.9); // screen right edge down
    expect(tiltToStick(0, -60 - 14, 90, n).y).toBeCloseTo(-0.5, 6);
    expect(tiltToStick(0, -60 + 14, 90, n).y).toBeCloseTo(0.5, 6);
  });
  it('writes into the out object (no allocation per reading)', () => {
    const out = { x: 9, y: 9 };
    expect(tiltToStick(40, 0, 0, N(40, 0), out)).toBe(out);
  });
});

// A fake window: deviceorientation listeners, a timer, the document's visibility.
function fakeWin(angle = 0) {
  const ls = new Map(), dl = new Map();
  const add = (m) => (t, f) => { if (!m.has(t)) m.set(t, new Set()); m.get(t).add(f); };
  const rm = (m) => (t, f) => m.get(t)?.delete(f);
  const w = {
    screen: { orientation: { angle } },
    document: { hidden: false, addEventListener: add(dl), removeEventListener: rm(dl) },
    addEventListener: add(ls), removeEventListener: rm(ls),
    setTimeout: (f, ms) => setTimeout(f, ms),
    fire: (beta, gamma) => { for (const f of ls.get('deviceorientation') ?? []) f({ beta, gamma }); },
    hide: () => { w.document.hidden = true; for (const f of dl.get('visibilitychange') ?? []) f(); },
    listeners: () => ls.get('deviceorientation')?.size ?? 0,
  };
  return w;
}

describe('createTilt: opt-in, gated, honest when it cannot', () => {
  it('nothing listens until start; the first reading is the neutral', async () => {
    const w = fakeWin(), sim = {};
    const t = createTilt(w, sim, () => true);
    expect(w.listeners()).toBe(0);
    expect(sim.tilt).toEqual({ x: 0, y: 0, active: false });
    const p = t.start(undefined);
    w.fire(40, 0);
    expect(await p).toBe(null);
    expect(t.on).toBe(true);
    expect(sim.tilt).toEqual({ x: 0, y: 0, active: true });
    w.fire(40, 40);
    expect(sim.tilt.x).toBe(1);
    t.recentre();
    w.fire(40, 40);
    expect(sim.tilt.x).toBe(0);
  });
  it('a refused permission leaves it off with the reason and no listener', async () => {
    const w = fakeWin(), sim = {};
    const t = createTilt(w, sim, () => true);
    expect(await t.start(Promise.resolve('denied'))).toBe(TILT_TEXT.denied);
    expect(await t.start(Promise.reject(new Error('NotAllowedError')))).toBe(TILT_TEXT.denied);
    // Chrome's 'prompt' (no prompt to show) is not a refusal: a reading turns it on.
    const p = t.start(Promise.resolve('prompt'));
    await Promise.resolve(); await Promise.resolve();
    w.fire(40, 0);
    expect(await p).toBe(null);
    t.stop();
    expect(t.on).toBe(false);
    expect(w.listeners()).toBe(0);
    w.fire(40, 25);
    expect(sim.tilt.active).toBe(false);
  });
  it('no reading (a desktop or no sensor; null angles) within the wait: off with the reason', async () => {
    vi.useFakeTimers();
    try {
      const w = fakeWin(), sim = {};
      const t = createTilt(w, sim, () => true);
      const p = t.start(Promise.resolve('granted'));
      await Promise.resolve(); await Promise.resolve();
      w.fire(null, null);
      vi.advanceTimersByTime(TILT_WAIT_MS + 1);
      expect(await p).toBe(TILT_TEXT.none);
      expect(t.on).toBe(false);
      expect(w.listeners()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it('paused, behind a screen or a hidden tab: zero input, and stop zeroes it', async () => {
    const w = fakeWin(), sim = {};
    let live = true;
    const t = createTilt(w, sim, () => live);
    const p = t.start(); w.fire(40, 0); await p;
    w.fire(40, 25);
    expect(sim.tilt.active).toBe(true);
    live = false;
    w.fire(40, 25);
    expect(sim.tilt).toEqual({ x: 0, y: 0, active: false });
    live = true;
    w.fire(40, 25);
    w.hide();
    expect(sim.tilt).toEqual({ x: 0, y: 0, active: false });
    w.document.hidden = false;
    w.fire(40, -40);
    expect(sim.tilt.x).toBe(-1);
    t.stop();
    expect(sim.tilt).toEqual({ x: 0, y: 0, active: false });
    expect(w.listeners()).toBe(0);
  });
  it('a rotated screen takes a new neutral rather than a jump', async () => {
    const w = fakeWin(0), sim = {};
    const t = createTilt(w, sim, () => true);
    const p = t.start(); w.fire(40, 0); await p;
    w.screen.orientation.angle = 90;
    w.fire(0, -60);
    expect(sim.tilt.x).toBe(0);
    expect(sim.tilt.y).toBe(0);
  });
});
