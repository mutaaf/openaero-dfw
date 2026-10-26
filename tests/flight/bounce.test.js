// Bounced landings (ticket 0091): landing.js's bounce tracker on the flight model, flown
// headless. Landed too fast (the FAA Airplane Flying Handbook's commonest bounce), the
// Cessna's struts throw it back into the air: trimmed for its speed, stick fixed, it hits at
// 400 fpm and the gear, not the wing, stops the descent (a no-ground control holds the same
// descent). A normal landing, flown the way the other cards fly it, counts no bounce.
//
// Documented, not asserted as a gap: the 737 does not bounce off a 300-900 fpm touchdown at
// 6° nose up (its wheels stay under 1 ft: the struts and auto ground spoilers keep it down),
// though over-flared by 4° it balloons 9-12 ft, which counts (a balloon, not the gear). Its
// cards pin "no false bounce" on these cases; no it.fails card is filed, for want of a
// published bounce height to check it against. Also noted by the 0091 physics panel: a
// nose-wheel-first C172 hit at 400-590 fpm can throw it 20-98 ft, which looks too lively.
import { describe, it, expect } from 'vitest';
import { Euler } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { trimThrottle } from '../../src/flightModel.js';
import { airAt } from '../../src/atmosphere.js';
import { vrefFor } from '../../src/aero.js';
import { trimAoaDeg, elevatorForPitch, aileronForBank } from '../../src/autopilot.js';
import { createBounceTracker, stepBounce } from '../../src/landing.js';
import { DEG_TO_RAD, KTS_TO_MPS, M_TO_FT, RAD_TO_DEG } from '../../src/constants.js';
import { makeBody, fly, attitude, shortFieldLanding, DT } from './harness.js';

const c172 = AIRCRAFT_DATABASE.c172, b738 = AIRCRAFT_DATABASE.b738;
const wheelFt = (x, spec) => (x.pos.y - x.groundY - spec.gearHeight) * M_TO_FT;

// Drops the airplane onto the runway from 0.6 m: idle, stick fixed and trimmed for `kts`
// (lift = weight), the nose at the trim angle of attack along a `sinkFpm` descent. The tracker
// runs from the first touch for up to 10 s; sink is the vertical speed at that touch.
function dropOnto(spec, { kts, flaps, sinkFpm, pitchDeg = null, ground = true }) {
  const b = makeBody(spec, { kts, altM: spec.gearHeight + 0.6, flaps });
  const v = -b.vel.z, vy = -sinkFpm / 60 / M_TO_FT;
  const trim = trimAoaDeg(spec, v, flaps);
  b.quat.setFromEuler(new Euler((pitchDeg ?? trim + Math.atan2(vy, v) * RAD_TO_DEG) * DEG_TO_RAD, 0, 0, 'YXZ'));
  b.vel.y = vy;
  b.throttle = 0; b.apMaster = false; b.autoTrim = false; b.trimAlphaDeg = trim;
  if (!ground) b.groundY = -1000;
  const t = createBounceTracker();
  let td = null;
  fly(b, spec, ground ? 10 : 2, (x) => { x.elevInput = 0; x.aileronInput = 0; }, (x) => {
    if (!td && x.onGround) td = { sinkFpm: -x.vel.y * M_TO_FT * 60 };
    if (td) stepBounce(t, wheelFt(x, spec), x.onGround, DT);
    return t.settled;
  });
  return { t, td, vyEnd: b.vel.y * M_TO_FT * 60 };
}

describe('bounced landings (0091)', () => {
  it('C172: landed 20 kt fast at 400 fpm (trimmed, stick fixed), the struts bounce it past 2 ft', () => {
    const kts = vrefFor(c172, 3) + 20;
    const { t, td } = dropOnto(c172, { kts, flaps: 3, sinkFpm: 400 });
    expect(td.sinkFpm).toBeGreaterThan(300); // a real hit: the wing did not stop the descent first
    expect(t.bounces).toBeGreaterThanOrEqual(1);
    expect(t.peakFt).toBeGreaterThan(2);
    // Control: with no runway the same airplane keeps descending (it is the gear, not a balloon).
    expect(dropOnto(c172, { kts, flaps: 3, sinkFpm: 400, ground: false }).vyEnd).toBeLessThan(-250);
  });

  it('C172: the short-field landing pilot (POH technique, gentle on the mains) counts no bounce', () => {
    const t = createBounceTracker();
    shortFieldLanding(c172, { onStep: (x, td) => { if (td) stepBounce(t, wheelFt(x, c172), x.onGround, DT); } });
    expect(t.bounces).toBe(0);
    expect(t.settled).toBe(true);
  });

  for (const sinkFpm of [300, 900]) {
    it(`737: a ${sinkFpm} fpm touchdown at 6° nose up stays down (no false bounce)`, () => {
      const { t } = dropOnto(b738, { kts: b738.vrefKts + 5, flaps: 2, sinkFpm, pitchDeg: 6 });
      expect(t.bounces).toBe(0);
      expect(t.settled).toBe(true);
    });
  }

  it('737: a 3° approach with a flare from 30 ft (14 CFR 25.125, as b738.test.js) counts no bounce', () => {
    const kts = b738.vrefKts, v = kts * KTS_TO_MPS;
    const b = makeBody(b738, { kts, altM: b738.gearHeight + 50 / M_TO_FT, flaps: 2, throttle: trimThrottle(b738, v, 2, -3, true, airAt(15)) });
    b.vel.set(0, -v * Math.sin(3 * DEG_TO_RAD), -v * Math.cos(3 * DEG_TO_RAD));
    const pitch0 = trimAoaDeg(b738, v, 2) - 3;
    b.quat.setFromAxisAngle({ x: 1, y: 0, z: 0 }, pitch0 * DEG_TO_RAD);
    const t = createBounceTracker();
    let td = false;
    fly(b, b738, 60, (x) => {
      const { pitchDeg, bankRightDeg } = attitude(x);
      const ft = wheelFt(x, b738);
      let cmd = pitch0;
      if (td) { cmd = -1; x.throttle = 0; x.brakesOn = true; }
      else if (ft < 30) { cmd = pitch0 + Math.min(3, (30 - ft) * 0.2); x.throttle = 0; }
      x.elevInput = elevatorForPitch(cmd, pitchDeg, x.angVel.x);
      x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z);
    }, (x) => {
      td ||= x.onGround;
      if (td) stepBounce(t, wheelFt(x, b738), x.onGround, DT);
      return t.settled;
    });
    expect(t.bounces).toBe(0);
    expect(t.settled).toBe(true);
  });
});
