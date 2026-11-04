// The takeoff coach's rotation (ticket 0093), flown: what the coach asks for must be a takeoff
// the model flies. The takeoff mission's set-up (main.js: flaps notch 1, the takeoff trim of 0141,
// stick-fixed as Pilot flies it): full power from a standstill, at Vr the pilot eases the nose to
// the coach's ROTATE_PITCH_DEG (src/takeoffCoach.js: the 737's ~8° from Boeing's FCTM, the F-16's
// 8-12° from its -1, the Cessna's 7°, no published figure) and holds it. The card: it lifts off
// within 10 s of Vr, never comes within the coach's tail margin of the tail-strike attitude in the
// first 10 ft, and is climbing at more than 300 fpm 10 s after lift-off.
import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { elevatorForPitch } from '../../src/autopilot.js';
import { takeoffTrimAoaDeg } from '../../src/trim.js';
import { radioAltitudeM } from '../../src/gear.js';
import { M_TO_FT } from '../../src/constants.js';
import { ROTATE_PITCH_DEG, TAIL_MARGIN_DEG, createTakeoffCoach, takeoffTarget, tailStrikeDeg, slowKtsFor } from '../../src/takeoffCoach.js';
import { stallSpeedKts } from '../../src/aero.js';
import { makeBody, fly, attitude, vsFpm } from './harness.js';

const coachIn = (x, raFt, pitchDeg) => ({
  onGround: x.onGround, raFt, aglFt: raFt, iasKts: x.iasKts, gsKts: x.iasKts, vsiFpm: vsFpm(x), throttle: x.throttle,
  brakesOn: false, gearDown: true, kid: false, crossM: x.pos.x, pitchDeg,
});

function coachedTakeoff(key) {
  const spec = AIRCRAFT_DATABASE[key];
  const target = ROTATE_PITCH_DEG[key];
  const b = Object.assign(makeBody(spec, { flaps: 1, throttle: 1 }), { autoTrim: false, apMaster: false, trimAlphaDeg: takeoffTrimAoaDeg(spec, 1) });
  let vrT = null, liftT = null, liftKts = null, lowPeakDeg = 0, rollFt = 0;
  // The coach watching the same flight (its own logic, not only the attitude): what it said.
  const st = createTakeoffCoach(key, spec, 1);
  st.slowKts = slowKtsFor(spec, spec.pitchFbw ? null : stallSpeedKts(spec, 1)); // main.js's sim.stallKts
  const said = new Set();
  fly(b, spec, 120, (x, dt) => {
    if (vrT === null && x.iasKts >= spec.vrKts) vrT = x.t;
    // Eased, not yanked: the stick through the game's 10/s lag, toward the pitch-hold command.
    const want = vrT === null ? 0 : elevatorForPitch(target, attitude(x).pitchDeg, x.angVel.x);
    x.elevInput += (want - x.elevInput) * Math.min(1, dt * 10);
  }, (x) => {
    const pitch = attitude(x).pitchDeg;
    const raFt = radioAltitudeM(x, spec) * M_TO_FT;
    if (vrT !== null && raFt < 10) lowPeakDeg = Math.max(lowPeakDeg, pitch);
    said.add(takeoffTarget(st, coachIn(x, raFt, pitch)));
    if (liftT === null && x.t > 1 && !x.onGround) { liftT = x.t; liftKts = x.iasKts; rollFt = x.distM * M_TO_FT; }
    return liftT !== null && x.t - liftT >= 10;
  });
  return { said, spec, target, vrT, liftT, liftKts, lowPeakDeg, rollFt, vs: vsFpm(b), pitch: attitude(b).pitchDeg, kts: b.iasKts };
}

describe('takeoff coach: the rotate attitude is a takeoff (ticket 0093)', () => {
  for (const key of Object.keys(ROTATE_PITCH_DEG)) {
    it(`${key}: rotate at Vr to ${ROTATE_PITCH_DEG[key]}°: lifts off within 10 s, clear of the tail, climbing 10 s later`, () => {
      const r = coachedTakeoff(key);
      const tailDeg = tailStrikeDeg(r.spec);
      console.log(`[${key} takeoff coach] Vr ${r.spec.vrKts} kt at ${r.vrT?.toFixed(1)} s, lift-off ${r.liftKts?.toFixed(0)} kt `
        + `${(r.liftT - r.vrT).toFixed(1)} s later after ${r.rollFt.toFixed(0)} ft, peak pitch under 10 ft ${r.lowPeakDeg.toFixed(1)}° `
        + `(tail ${tailDeg}°), 10 s on: ${r.vs.toFixed(0)} fpm at ${r.kts.toFixed(0)} kt, ${r.pitch.toFixed(1)}°`);
      expect(r.liftT).not.toBeNull();
      expect(r.liftT - r.vrT).toBeLessThan(10);
      expect(r.lowPeakDeg).toBeLessThan(tailDeg - TAIL_MARGIN_DEG);
      expect(r.vs).toBeGreaterThan(300);
      // Flown as coached, the coach never calls it slow or near the tail (physics panel).
      expect(r.said.has('toSlow')).toBe(false);
      expect(r.said.has('toEase')).toBe(false);
      expect(r.said.has('toRotate')).toBe(true);
    });
  }
});

// The Cessna yanked to full aft stick on the roll (a kid's pull, early or at Vr): the coach's
// "ease the nose" must come before the tail meets the runway (gear.js wheelLoads[3], 0144). It
// first touches at ~14.2° pulled at 35 kt (static struts), ~15.2° at Vr: the call is set 1° short
// of 13.7° (takeoffCoach.js tailStrikeDeg).
describe('takeoff coach: "ease the nose" comes before the Cessna\'s tail strikes (ticket 0093)', () => {
  for (const pullKts of [35, 45, 55]) {
    it(`full aft from ${pullKts} kt: ease called at least ${TAIL_MARGIN_DEG}° before the tail touches`, () => {
      const spec = AIRCRAFT_DATABASE.c172;
      const st = createTakeoffCoach('c172', spec, 1);
      const b = Object.assign(makeBody(spec, { flaps: 1, throttle: 1 }), { autoTrim: false, apMaster: false, trimAlphaDeg: takeoffTrimAoaDeg(spec, 1) });
      let easeDeg = null, tailDeg = null;
      fly(b, spec, 60, (x, dt) => {
        x.elevInput += ((x.iasKts >= pullKts ? -1 : 0) - x.elevInput) * Math.min(1, dt * 10);
      }, (x) => {
        const pitch = attitude(x).pitchDeg;
        const raFt = radioAltitudeM(x, spec) * M_TO_FT;
        if (easeDeg === null && takeoffTarget(st, coachIn(x, raFt, pitch)) === 'toEase') easeDeg = pitch;
        if (tailDeg === null && x.wheelLoads?.[3] > 0) tailDeg = pitch;
        return tailDeg !== null;
      });
      console.log(`[c172 takeoff coach] full aft from ${pullKts} kt: ease at ${easeDeg?.toFixed(1)}°, tail touches at ${tailDeg?.toFixed(1)}° (tailStrikeDeg ${tailStrikeDeg(spec)}°)`);
      expect(tailDeg).not.toBeNull();
      expect(easeDeg).not.toBeNull();
      expect(tailDeg - easeDeg).toBeGreaterThanOrEqual(TAIL_MARGIN_DEG);
    });
  }
});
