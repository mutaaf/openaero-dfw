import { describe, it, expect, vi } from 'vitest';
import { touchdownRumble, feelRumble, createRumble, RUMBLE_GAP_MS } from '../../src/gamepad.js';

// Ticket 0228: the pad's dual-rumble motors feel the touchdown, the stall buffet and the ground roll.

describe('touchdownRumble', () => {
  it('a hard touchdown is longer and stronger than a soft one', () => {
    const soft = touchdownRumble(-150), hard = touchdownRumble(-700);
    expect(hard.duration).toBeGreaterThan(soft.duration);
    expect(hard.strongMagnitude).toBeGreaterThan(soft.strongMagnitude);
    expect(hard.weakMagnitude).toBeGreaterThan(soft.weakMagnitude);
  });
  it('stays in 120-250 ms and 0-1 magnitudes, whatever the sink', () => {
    for (const vs of [0, 50, -0, -100, -240, -600, -1500, NaN, -Infinity]) {
      const r = touchdownRumble(vs);
      expect(r.duration).toBeGreaterThanOrEqual(120);
      expect(r.duration).toBeLessThanOrEqual(250);
      for (const m of [r.strongMagnitude, r.weakMagnitude]) { expect(m).toBeGreaterThan(0); expect(m).toBeLessThanOrEqual(1); }
    }
    expect(touchdownRumble(-600).duration).toBe(250);
  });
  it('Kid (gentle) never gets the crash thump', () => {
    expect(touchdownRumble(-1200, true).strongMagnitude).toBeLessThan(touchdownRumble(-1200).strongMagnitude);
  });
  it('writes into the object it is given (no allocation per call)', () => {
    const out = {};
    expect(touchdownRumble(-300, false, out)).toBe(out);
  });
});

const air = (k) => ({ onGround: false, buffetK: k, gsKts: 60, gearPos: 1, spec: { engine: { type: 'piston-prop' } } });
const ground = (gs, extra = {}) => ({ onGround: true, buffetK: 0, gsKts: gs, gearPos: 1, spec: { engine: { type: 'piston-prop' } }, ...extra });

describe('feelRumble', () => {
  it('the buffet shakes in proportion to its intensity, nothing without it', () => {
    expect(feelRumble(air(0)).strongMagnitude).toBe(0);
    expect(feelRumble(air(undefined)).strongMagnitude).toBe(0);
    const light = feelRumble(air(0.3)).strongMagnitude, full = feelRumble(air(1)).strongMagnitude;
    expect(light).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(light);
    expect(full).toBeLessThanOrEqual(1);
  });
  it('the ground roll rumbles with speed, not stopped, not on a belly slide', () => {
    expect(feelRumble(ground(0)).weakMagnitude).toBe(0);
    expect(feelRumble(ground(60, { gearPos: 0 })).weakMagnitude).toBe(0);
    const slow = feelRumble(ground(15)).weakMagnitude, fast = feelRumble(ground(60)).weakMagnitude;
    expect(slow).toBeGreaterThan(0);
    expect(fast).toBeGreaterThan(slow);
    // A jet's rumble builds to 120 kt, the Cessna's to 60 (rollSound.js's rule).
    expect(feelRumble(ground(60, { spec: { engine: { type: 'jet' } } })).weakMagnitude).toBeLessThan(fast);
  });
  it('each pulse outlasts the gap to the next (a continuous feel), in the one object', () => {
    const out = {};
    expect(feelRumble(ground(40), out)).toBe(out);
    expect(out.duration).toBeGreaterThan(RUMBLE_GAP_MS);
  });
});

const actuator = () => ({ playEffect: vi.fn(() => Promise.resolve('complete')), reset: vi.fn(() => Promise.resolve()) });
const flying = () => ({ onGround: false, buffetK: 0, gsKts: 70, gearPos: 1, simTime: 10, lastAirVsi: -300, assist: 'pilot', spec: { engine: { type: 'piston-prop' } } });

describe('createRumble', () => {
  it('a touchdown (sim.tdT moves) plays one dual-rumble scaled by its sink', () => {
    const act = actuator(), rumble = createRumble(), sim = flying();
    rumble(act, sim, true, 0);
    expect(act.playEffect).not.toHaveBeenCalled();
    sim.tdT = 10; sim.onGround = true; sim.gsKts = 0; sim.lastAirVsi = -800;
    expect(rumble(act, sim, true, 16)).toBe(true);
    expect(act.playEffect).toHaveBeenCalledTimes(1);
    const [type, fx] = act.playEffect.mock.calls[0];
    expect(type).toBe('dual-rumble');
    expect(fx.duration).toBe(250);
    // Once per touchdown.
    rumble(act, sim, true, 400);
    expect(act.playEffect).toHaveBeenCalledTimes(1);
  });
  it('the buffet pulses every RUMBLE_GAP_MS, reusing one params object', () => {
    const act = actuator(), rumble = createRumble(), sim = flying();
    sim.buffetK = 0.8;
    for (let t = 0; t <= 1000; t += 16) rumble(act, sim, true, t);
    const n = act.playEffect.mock.calls.length;
    expect(n).toBeGreaterThanOrEqual(9);
    expect(n).toBeLessThanOrEqual(11);
    const objs = new Set(act.playEffect.mock.calls.map((c) => c[1]));
    expect(objs.size).toBe(1);
  });
  it('silent when off (the setting, reduced motion, a menu or a pause), and a touchdown behind it is not felt later', () => {
    const act = actuator(), rumble = createRumble(), sim = flying();
    sim.buffetK = 1;
    rumble(act, sim, true, 0);
    expect(act.playEffect).toHaveBeenCalledTimes(1);
    rumble(act, sim, false, 200);
    expect(act.reset).toHaveBeenCalledTimes(1); // a running pulse stops with the pause
    sim.buffetK = 0; sim.tdT = 10; sim.onGround = true; sim.gsKts = 0;
    for (let t = 200; t < 1000; t += 16) rumble(act, sim, false, t);
    rumble(act, sim, true, 1000);
    expect(act.playEffect).toHaveBeenCalledTimes(1);
  });
  it('a pad with no actuator, or one that throws or rejects, is silent and never throws', async () => {
    const rumble = createRumble(), sim = flying();
    sim.buffetK = 1;
    expect(() => rumble(undefined, sim, true, 0)).not.toThrow();
    expect(() => rumble({}, sim, true, 100)).not.toThrow();
    const throws = { playEffect: () => { throw new Error('nope'); } };
    expect(() => rumble(throws, sim, true, 200)).not.toThrow();
    const rejects = { playEffect: vi.fn(() => Promise.reject(new Error('NotSupportedError'))) };
    const r2 = createRumble();
    r2(rejects, sim, true, 0);
    await Promise.resolve(); await Promise.resolve();
    // A pad that refused backs off rather than being asked ten times a second.
    for (let t = 100; t < 2000; t += 16) r2(rejects, sim, true, t);
    expect(rejects.playEffect).toHaveBeenCalledTimes(1);
  });
});
