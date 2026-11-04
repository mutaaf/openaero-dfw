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
import { ROTATE_PITCH_DEG, TAIL_MARGIN_DEG } from '../../src/takeoffCoach.js';
import { makeBody, fly, attitude, vsFpm } from './harness.js';

function coachedTakeoff(key) {
  const spec = AIRCRAFT_DATABASE[key];
  const target = ROTATE_PITCH_DEG[key];
  const b = Object.assign(makeBody(spec, { flaps: 1, throttle: 1 }), { autoTrim: false, apMaster: false, trimAlphaDeg: takeoffTrimAoaDeg(spec, 1) });
  let vrT = null, liftT = null, liftKts = null, lowPeakDeg = 0, rollFt = 0;
  fly(b, spec, 120, (x, dt) => {
    if (vrT === null && x.iasKts >= spec.vrKts) vrT = x.t;
    // Eased, not yanked: the stick through the game's 10/s lag, toward the pitch-hold command.
    const want = vrT === null ? 0 : elevatorForPitch(target, attitude(x).pitchDeg, x.angVel.x);
    x.elevInput += (want - x.elevInput) * Math.min(1, dt * 10);
  }, (x) => {
    const pitch = attitude(x).pitchDeg;
    const raFt = radioAltitudeM(x, spec) * M_TO_FT;
    if (vrT !== null && raFt < 10) lowPeakDeg = Math.max(lowPeakDeg, pitch);
    if (liftT === null && x.t > 1 && !x.onGround) { liftT = x.t; liftKts = x.iasKts; rollFt = x.distM * M_TO_FT; }
    return liftT !== null && x.t - liftT >= 10;
  });
  return { spec, target, vrT, liftT, liftKts, lowPeakDeg, rollFt, vs: vsFpm(b), pitch: attitude(b).pitchDeg, kts: b.iasKts };
}

describe('takeoff coach: the rotate attitude is a takeoff (ticket 0093)', () => {
  for (const key of Object.keys(ROTATE_PITCH_DEG)) {
    it(`${key}: rotate at Vr to ${ROTATE_PITCH_DEG[key]}°: lifts off within 10 s, clear of the tail, climbing 10 s later`, () => {
      const r = coachedTakeoff(key);
      const tailDeg = r.spec.maxGroundPitchDeg ?? 15;
      console.log(`[${key} takeoff coach] Vr ${r.spec.vrKts} kt at ${r.vrT?.toFixed(1)} s, lift-off ${r.liftKts?.toFixed(0)} kt `
        + `${(r.liftT - r.vrT).toFixed(1)} s later after ${r.rollFt.toFixed(0)} ft, peak pitch under 10 ft ${r.lowPeakDeg.toFixed(1)}° `
        + `(tail ${tailDeg}°), 10 s on: ${r.vs.toFixed(0)} fpm at ${r.kts.toFixed(0)} kt, ${r.pitch.toFixed(1)}°`);
      expect(r.liftT).not.toBeNull();
      expect(r.liftT - r.vrT).toBeLessThan(10);
      expect(r.lowPeakDeg).toBeLessThan(tailDeg - TAIL_MARGIN_DEG);
      expect(r.vs).toBeGreaterThan(300);
    });
  }
});
