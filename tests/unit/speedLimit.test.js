import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE as AIRCRAFT } from '../../src/aircraft.js';
import { speedLimitKts, overspeedStep, OVERSPEED_REARM_KTS } from '../../src/aero.js';
import { speedLimitBand, TAPE_TOP } from '../../src/hudLayout.js';

// Ticket 0127: the speed the airplane must not exceed for where its flaps are.
describe('speedLimitKts', () => {
  const b738 = AIRCRAFT.b738, c172 = AIRCRAFT.c172;

  it('737-800: VMO 340 clean (TCDS A16WE), the published placards at its flap notches', () => {
    expect(b738.flapDetentsDeg).toEqual([0, 10, 30, 40]);
    expect(speedLimitKts(b738, 0)).toBe(340);
    expect(speedLimitKts(b738, 10)).toBe(210);
    expect(speedLimitKts(b738, 30)).toBe(175);
    expect(speedLimitKts(b738, 40)).toBe(162);
  });

  it('C172S: VNE 163 clean, 110 KIAS to 10°, 85 KIAS from 10° to 30° (POH Section 2)', () => {
    expect(c172.flapDetentsDeg).toEqual([0, 10, 20, 30]);
    expect(speedLimitKts(c172, 0)).toBe(163);
    expect(speedLimitKts(c172, 10)).toBe(110);
    expect(speedLimitKts(c172, 20)).toBe(85);
    expect(speedLimitKts(c172, 30)).toBe(85);
  });

  it('flaps in transit take the placard of where they are, including the 737\'s 15 and 25 on the way', () => {
    expect(speedLimitKts(b738, 0.3)).toBe(340); // a hair of travel is still clean
    expect(speedLimitKts(b738, 4)).toBe(210);
    expect(speedLimitKts(b738, 12)).toBe(200);
    expect(speedLimitKts(b738, 15)).toBe(200);
    expect(speedLimitKts(b738, 20)).toBe(190);
    expect(speedLimitKts(b738, 27)).toBe(175);
    expect(speedLimitKts(b738, 35)).toBe(162);
    expect(speedLimitKts(c172, 15)).toBe(85);
  });

  it('a 737 retracting 30 -> 10 at 185 kt is called once, only while the flaps are still past 25', () => {
    let warned = false, calls = 0;
    for (let deg = 30; deg >= 10; deg -= 0.25) {
      const w = overspeedStep(warned, 185, speedLimitKts(b738, deg));
      if (w && !warned) calls++;
      warned = w;
      if (deg < 25) expect(w, `${deg}°`).toBe(false);
    }
    expect(calls).toBe(1);
  });

  it('flap load relief: flaps held at 30 above 162 kt are inside the 175 limit', () => {
    expect(speedLimitKts(b738, 30)).toBeGreaterThan(b738.systems.flaps.loadRelief.aboveKts);
  });

  it('the F-16 has no limit here (out of scope): null, so nothing is drawn or said', () => {
    expect(speedLimitKts(AIRCRAFT.f16, 0)).toBeNull();
  });

  it('the 737 on the default final (flaps 30, Vref + 5 = 155) is 20 kt inside its limit', () => {
    expect(b738.vrefKts + 5).toBe(155);
    expect(speedLimitKts(b738, 30) - (b738.vrefKts + 5)).toBe(20);
    expect(b738.vrefKts + 5 + 50).toBeGreaterThan(speedLimitKts(b738, 30)); // the e2e's +50 kt
  });
});

describe('overspeedStep: fires once, re-arms below the limit', () => {
  it('trips above the limit and holds while above', () => {
    let w = false;
    w = overspeedStep(w, 174.9, 175); expect(w).toBe(false);
    w = overspeedStep(w, 175.2, 175); expect(w).toBe(true);
    w = overspeedStep(w, 180, 175); expect(w).toBe(true);
  });

  it('a speed hovering at the limit does not chatter: it clears only OVERSPEED_REARM_KTS below', () => {
    let w = overspeedStep(false, 176, 175);
    w = overspeedStep(w, 174, 175); expect(w).toBe(true);
    w = overspeedStep(w, 175 - OVERSPEED_REARM_KTS - 0.1, 175); expect(w).toBe(false);
    w = overspeedStep(w, 174, 175); expect(w).toBe(false);
  });

  it('no limit, no warning', () => {
    expect(overspeedStep(false, 900, null)).toBe(false);
    expect(overspeedStep(true, 900, null)).toBe(false);
  });
});

describe('speedLimitBand: the amber mark on the speed tape (2 px/kt, ±90 px)', () => {
  const cy = 360, out = {};
  it('on the span: a tick at the limit and a band from it to the tape top', () => {
    speedLimitBand(cy, 175, 155, out);
    expect(out.tick).toBe(true);
    expect(out.y).toBe(cy - 40);
    expect(out.top).toBe(cy + TAPE_TOP);
    expect(out.bot).toBe(cy - 40);
    expect(out.show).toBe(true);
  });

  it('above the span (far below the limit): nothing drawn', () => {
    speedLimitBand(cy, 340, 155, out);
    expect(out.tick).toBe(false);
    expect(out.show).toBe(false);
  });

  it('below the span (far past the limit): no tick, the band fills the tape', () => {
    speedLimitBand(cy, 175, 300, out);
    expect(out.tick).toBe(false);
    expect(out.show).toBe(true);
    expect(out.top).toBe(cy - 90);
    expect(out.bot).toBe(cy + 90);
  });

  it('reuses the object it is given (no per-frame allocation)', () => {
    expect(speedLimitBand(cy, 175, 170, out)).toBe(out);
  });
});
