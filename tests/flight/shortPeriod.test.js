// C172 short-period pitch response (ticket 0225, Validator). A held step of the elevator is the
// textbook short-period test (FAA-H-8083-25B ch. 5 "Dynamic stability": a stable airplane's pitch
// rate rises quickly and settles). The reference is JSBSim flying our public/jsbsim/ C172, whose
// derivatives are Roskam's (the same comparator c172.test.js uses); no POH number exists for it.
// Stick-fixed (trim not following alpha), 90 and 75 KIAS, 1,500 m, -0.2 elevator (back) held 4 s.
// Measured 2026-11-25: peak pitch rate 0.152 / 0.144 rad/s (flightModel.js) against 0.293 / 0.247
// (JSBSim), reached at 0.78 s against 0.37 s: the game's Cessna is about half as brisk to a pull.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { makeBody, fly, speedHoldPilot, useFdm } from './harness.js';
import { nodeJsbsim } from './jsbsimNode.js';

const c172 = AIRCRAFT_DATABASE.c172;

function backStep(kts) {
  const b = makeBody(c172, { kts, altM: 1500, throttle: 0.5 });
  fly(b, c172, 40, speedHoldPilot(() => kts));
  b.autoTrim = false;
  const t0 = b.t;
  let peak = 0, tPeak = 0;
  fly(b, c172, 4, (x) => { x.elevInput = -0.2; x.aileronInput = 0; }, (x) => {
    if (Math.abs(x.angVel.x) > peak) { peak = Math.abs(x.angVel.x); tPeak = x.t - t0; }
    return false;
  });
  return { peak, tPeak };
}

describe('Cessna 172S short-period pitch response (ticket 0225)', () => {
  const r = {};
  beforeAll(async () => {
    useFdm(null);
    for (const k of [75, 90]) r[`fm${k}`] = backStep(k);
    useFdm(await nodeJsbsim());
    for (const k of [75, 90]) r[`js${k}`] = backStep(k);
    console.log('[c172 short period]', JSON.stringify(r));
  }, 120000);
  afterAll(() => useFdm(null));

  for (const k of [75, 90]) {
    it(`${k} KIAS: a held back step pitches up within 1.5 s and the rate does not run away (peak 0.05-0.6 rad/s, both models)`, () => {
      for (const m of ['fm', 'js']) {
        expect(r[`${m}${k}`].peak).toBeGreaterThan(0.05);
        expect(r[`${m}${k}`].peak).toBeLessThan(0.6);
        expect(r[`${m}${k}`].tPeak).toBeLessThan(1.5);
      }
    });
    it.fails(`KNOWN GAP (0225): ${k} KIAS: flightModel.js's peak pitch rate is within 30% of JSBSim's Roskam C172`, () => {
      expect(Math.abs(r[`fm${k}`].peak - r[`js${k}`].peak) / r[`js${k}`].peak).toBeLessThanOrEqual(0.3);
    });
  }
});
