// α-rate pitch damping (Cmα̇, ticket 0202) in flightModel.js: the Cessna's Roskam −5.2 (src/aircraft.js),
// as our JSBSim C172 flies it. The cards against JSBSim are in c172.test.js (full aft at Vr: peak α); these
// check the term's own guards: a zero step, a teleport, and its sign.
import { describe, it, expect } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { stepFlightModel } from '../../src/flightModel.js';
import { makeBody, fly } from './harness.js';

const c172 = AIRCRAFT_DATABASE.c172;
const finite = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

describe('Cessna 172 α-rate damping (Cmα̇, ticket 0202)', () => {
  it('is the Cessna\'s alone, Roskam\'s −5.2', () => {
    expect(c172.cmAlphaDot).toBe(-5.2);
    for (const k of ['b738', 'f16']) expect(AIRCRAFT_DATABASE[k].cmAlphaDot).toBeUndefined();
  });

  it('a zero step (a paused frame) leaves the pitch rate finite and the α̇ state as it was', () => {
    const b = Object.assign(makeBody(c172, { kts: 90, altM: 900 }), { apMaster: false, autoTrim: false, elevInput: -0.6 });
    for (let i = 0; i < 60; i++) stepFlightModel(b, c172, 1 / 120);
    const { aoaPrevRad, aoaRateF } = b;
    stepFlightModel(b, c172, 0);
    expect(finite(b.angVel)).toBe(true);
    expect(b.aoaPrevRad).toBe(aoaPrevRad);
    expect(b.aoaRateF).toBe(aoaRateF);
    for (let i = 0; i < 60; i++) stepFlightModel(b, c172, 1 / 120);
    expect(finite(b.angVel)).toBe(true);
  });

  it('a teleport that clears the state reads no α-rate: the first step after it pitches as if the term were not there', () => {
    // Cruise at 90 KIAS, then the attitude jumps 10° nose up (an upset or spawn set-up): with the state cleared
    // the first step's pitch acceleration is the same as on an airframe without Cmα̇; left stale, the ±2 rad/s
    // clamped "rate" would throw the nose down.
    const jump = (clear, spec) => {
      const b = Object.assign(makeBody(spec, { kts: 90, altM: 900 }), { apMaster: false, autoTrim: false });
      for (let i = 0; i < 120; i++) stepFlightModel(b, spec, 1 / 120);
      b.quat.premultiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 10 * Math.PI / 180));
      b.angVel.set(0, 0, 0);
      if (clear) { b.aoaPrevRad = null; b.aoaRateF = 0; }
      stepFlightModel(b, spec, 1 / 120);
      return b.angVel.x;
    };
    const none = jump(true, { ...c172, cmAlphaDot: undefined }), cleared = jump(true, c172), stale = jump(false, c172);
    console.log(`[c172 flightModel] 10° attitude jump, first step's pitch rate: ${none.toFixed(5)} rad/s without Cmα̇, ${cleared.toFixed(5)} cleared, ${stale.toFixed(5)} stale`);
    // The 2 s before the jump flew slightly differently with the term (its own damping): within 1e-4 rad/s.
    expect(Math.abs(cleared - none)).toBeLessThan(1e-4);
    expect(stale).toBeLessThan(none * 1.3); // what the reset is for: left stale, 30%+ more nose-down in one step (and on, as the filter decays)
  });

  it('damps a pull: the same 1 s of half back stick from 90 KIAS peaks at a lower α with it than without', () => {
    const peak = (spec) => {
      const b = Object.assign(makeBody(spec, { kts: 90, altM: 900 }), { apMaster: false, autoTrim: false });
      let maxAoa = -Infinity;
      fly(b, spec, 4, (x) => { x.elevInput = x.t < 1 ? -0.5 : 0; maxAoa = Math.max(maxAoa, x.aoaDeg ?? -Infinity); });
      return maxAoa;
    };
    const withIt = peak(c172), without = peak({ ...c172, cmAlphaDot: undefined });
    console.log(`[c172 flightModel] half pull 1 s at 90 KIAS: peak α ${withIt.toFixed(2)}° with Cmα̇, ${without.toFixed(2)}° without`);
    expect(withIt).toBeLessThan(without);
  });
});
