// Wet runway cards (ticket 0108). A METAR with rain or drizzle at the field wets the runway
// (weather.js), and the brakes then get 14 CFR 25.109(c)'s wet tyre-to-ground braking
// coefficient: (c)(1)'s cubic in groundspeed for the tyre pressure, times (c)(2)'s anti-skid
// efficiency (fully modulating 0.80), never more than the dry brakes (systems.js brakeMu).
// The same pilot flies the same landing, dry and wet: the air phase is identical, so the
// touchdown is as gradable as the dry one, and only the roll gets longer.
//
// What a wet landing should cost:
//  - 737: Boeing's advisory landing distances (737-800 QRH, flaps 30, max manual) put a
//    "good" (wet) runway at roughly 1.4x dry from 50 ft and ~1.6x on the roll, with reverse;
//    with 25.109(c)'s default 0.80 efficiency (a demonstrated anti-skid usually does better)
//    and no reverse, the model sits on the pessimistic side of that, so its roll is pinned to
//    1.5-2.0x dry. A loose ceiling as well: 14 CFR 121.195(d) plans a turbojet's wet landing
//    on 115% of the dry field length (the demonstrated distance / 0.6, 121.195(b); ACAP §3.4.3
//    reads 5,690 ft at 65 t, b738.test.js), so the wet stop from 50 ft must fit 6,544 ft or
//    the dispatch rule itself would be violated. That is a sanity bound, not a validation.
//  - C172: the UK CAA's Safety Sense Leaflet 7 (Aeroplane Performance) adds 15% to a light
//    aircraft's landing distance from 50 ft on a wet paved runway. The C172's anti-skid-free
//    efficiency is fitted to it (aircraft.js), so this card pins the fit.
// Either way the braked roll alone grows by at least the ticket's 30%.
import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { trimThrottle } from '../../src/flightModel.js';
import { airAt } from '../../src/atmosphere.js';
import { stallSpeedKts } from '../../src/aero.js';
import { trimAoaDeg, elevatorForPitch, aileronForBank } from '../../src/autopilot.js';
import { M_TO_FT, KTS_TO_MPS, DEG_TO_RAD } from '../../src/constants.js';
import { makeBody, fly, attitude, shortFieldLanding } from './harness.js';

const c172 = AIRCRAFT_DATABASE.c172, b738 = AIRCRAFT_DATABASE.b738;

// The 737 card's landing (b738.test.js, Boeing ACAP §3.4.3): a 3° approach at Vref30 to 50 ft,
// idle and flare from 30 ft, then nose down and maximum manual braking, no reverse.
function b738Landing({ wet }) {
  const FLAPS_30 = 2;
  const kts = 1.23 * stallSpeedKts(b738, FLAPS_30);
  const v = kts * KTS_TO_MPS;
  const b = makeBody(b738, { kts, altM: b738.gearHeight + 50 / M_TO_FT, flaps: FLAPS_30, throttle: trimThrottle(b738, v, FLAPS_30, -3, true, airAt(15)) });
  b.wetRunway = wet;
  b.vel.set(0, -v * Math.sin(3 * DEG_TO_RAD), -v * Math.cos(3 * DEG_TO_RAD));
  const pitch0 = trimAoaDeg(b738, v, FLAPS_30) - 3;
  b.quat.setFromAxisAngle({ x: 1, y: 0, z: 0 }, pitch0 * DEG_TO_RAD);
  let td = null;
  fly(b, b738, 120, (x) => {
    const { pitchDeg, bankRightDeg } = attitude(x);
    const ft = (x.pos.y - b738.gearHeight) * M_TO_FT;
    let cmd = pitch0;
    if (td) { cmd = -1; x.throttle = 0; x.brakesOn = true; }
    else if (ft < 30) { cmd = pitch0 + Math.min(3, (30 - ft) * 0.2); x.throttle = 0; }
    x.elevInput = elevatorForPitch(cmd, pitchDeg, x.angVel.x);
    x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z);
  }, (x) => {
    if (!td && x.onGround) td = { sinkFpm: x.lastAirVsi, distM: x.distM, gsKts: Math.hypot(x.vel.x, x.vel.z) / KTS_TO_MPS };
    return td && Math.hypot(x.vel.x, x.vel.z) < 0.3;
  });
  return { rollFt: (b.distM - td.distM) * M_TO_FT, airFt: td.distM * M_TO_FT, sinkFpm: td.sinkFpm, tdKts: td.gsKts, stopped: Math.hypot(b.vel.x, b.vel.z) < 0.3 };
}

describe('wet runway braking (14 CFR 25.109(c), ticket 0108)', () => {
  it('737-800: the same landing, wet, rolls 1.5-2x as far (Boeing good-vs-dry pattern, 25.109(c) 0.80), within 121.195(d)\'s 115% of the ACAP field length; the touchdown is the same', () => {
    const dry = b738Landing({ wet: false });
    const wet = b738Landing({ wet: true });
    console.log(`[b738 wet] roll dry ${dry.rollFt.toFixed(0)} ft, wet ${wet.rollFt.toFixed(0)} ft (${((wet.rollFt / dry.rollFt) * 100).toFixed(0)}%), `
      + `from 50 ft wet ${(wet.airFt + wet.rollFt).toFixed(0)} ft (plan 6,544), touchdown ${dry.tdKts.toFixed(0)} kt at ${(-dry.sinkFpm).toFixed(0)} fpm`);
    expect(wet.stopped).toBe(true);
    expect(wet.airFt).toBeCloseTo(dry.airFt, 0);
    expect(wet.sinkFpm).toBeCloseTo(dry.sinkFpm, 0);
    expect(wet.rollFt / dry.rollFt).toBeGreaterThanOrEqual(1.5);
    expect(wet.rollFt / dry.rollFt).toBeLessThanOrEqual(2.0);
    expect(wet.airFt + wet.rollFt).toBeLessThanOrEqual(1.15 * 5690);
  });

  it('C172S: the POH short-field landing, wet, needs 15% more from 50 ft (UK CAA SSL 7, ±5 points), rolls 30-100% further and still stops', () => {
    const dry = shortFieldLanding(c172);
    const wet = shortFieldLanding(c172, { wet: true });
    console.log(`[c172 wet] roll dry ${dry.rollFt.toFixed(0)} ft, wet ${wet.rollFt.toFixed(0)} ft (${((wet.rollFt / dry.rollFt) * 100).toFixed(0)}%); `
      + `from 50 ft dry ${dry.totalFt.toFixed(0)} ft, wet ${wet.totalFt.toFixed(0)} ft (${((wet.totalFt / dry.totalFt) * 100).toFixed(0)}%)`);
    expect(wet.stopped).toBe(true);
    expect(wet.bounceS).toBe(0);
    expect(wet.tdSinkFpm).toBeCloseTo(dry.tdSinkFpm, 0);
    expect(wet.totalFt / dry.totalFt).toBeGreaterThanOrEqual(1.10);
    expect(wet.totalFt / dry.totalFt).toBeLessThanOrEqual(1.20);
    expect(wet.rollFt / dry.rollFt).toBeGreaterThanOrEqual(1.3);
    expect(wet.rollFt / dry.rollFt).toBeLessThanOrEqual(2.0);
  });
});
