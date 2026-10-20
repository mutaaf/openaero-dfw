// Flight test cards for the Boeing 737-800 (65 t). The first three pin operational facts
// pilots know; the rest read Boeing's published airport data:
//  - ACAP: 737 Airplane Characteristics for Airport Planning, D6-58325-7 Rev C (Oct 2025),
//    737NG_REV_C.pdf, §3.3.25 (takeoff) and §3.4.3 (landing) charts
//  - ARC: Aerodrome Reference Code and Approach Speeds, Rev A (Aug 2026),
//    arcandapproachspeeds.pdf
//  - VLA: Visual Landing Aids Data, Rev A (Jun 2026), icaoadmpart4a.pdf, Table A6-1
// all under https://www.boeing.com/content/dam/boeing/v2/airports/ (acaps/, faq/).
// The charts are images; values were read off the raster at the grid's pixel scale.
//
// A card the model does not yet meet is a KNOWN GAP: `it.fails` with its ticket, never a
// looser tolerance. The fixing PR promotes it to `it`.
import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { trimThrottle } from '../../src/flightModel.js';
import { engineThrust } from '../../src/engine.js';
import { airAt } from '../../src/atmosphere.js';
import { liftCoefficient, dragCoefficient, stallSpeedKts } from '../../src/aero.js';
import { trimAoaDeg, elevatorForPitch, aileronForBank } from '../../src/autopilot.js';
import { M_TO_FT, KTS_TO_MPS, DEG_TO_RAD } from '../../src/constants.js';
import { makeBody, fly, attitude } from './harness.js';

const b738 = AIRCRAFT_DATABASE.b738;
const vApp = (b738.vrefKts + 5) * 0.514444;
const within = (measured, ref, tol) => expect(Math.abs(measured - ref) / ref).toBeLessThanOrEqual(tol);
const LB_PER_KG = 2.20462;
const MLW_KG = 66361; // ARC / ACAP: maximum landing weight 146,300 lb
// Model flap notches are 0/10/25/40 (main.js flapAngles); the real 737 lands with 30 or 40.
const FLAPS_25 = 2, FLAPS_40 = 3;

// 14 CFR 25.125(b)(2): VREF ≥ 1.23 VSR0, the 1-g reference stall speed in the landing
// configuration. Scaled to another mass by √(m / massKg) (same CL, same speed squared).
const vrefKts = (flaps, massKg = b738.massKg) => 1.23 * stallSpeedKts(b738, flaps) * Math.sqrt(massKg / b738.massKg);

describe('Boeing 737-800', () => {
  it('flies a 3° final at Vref+5 on ~20–35% thrust (N1 ~55–60%), not near idle', () => {
    const thr = trimThrottle(b738, vApp, 2, -3, true, airAt(200));
    expect(thr).toBeGreaterThan(0.2);
    expect(thr).toBeLessThan(0.35);
  });

  it('landing configuration L/D is about 7–8', () => {
    const aoa = trimAoaDeg(b738, vApp, 2) * Math.PI / 180;
    const cl = liftCoefficient(b738, aoa, 2);
    const ld = cl / dragCoefficient(b738, cl, true, 2, 1);
    expect(ld).toBeGreaterThan(7);
    expect(ld).toBeLessThan(8.2);
  });

  it('at idle on the final it cannot hold the path without slowing down (drag > idle thrust)', () => {
    const air = airAt(200);
    const aoa = trimAoaDeg(b738, vApp, 2) * Math.PI / 180;
    const cl = liftCoefficient(b738, aoa, 2);
    const q = 0.5 * 1.225 * vApp * vApp;
    const drag = dragCoefficient(b738, cl, true, 2, 1) * q * b738.wingAreaM2;
    const along = engineThrust(b738, 0, vApp, air, vApp / 340, q) + b738.massKg * 9.80665 * Math.sin(3 * Math.PI / 180) - drag;
    expect(along).toBeLessThan(0);
  });
});

describe('Boeing 737-800 vs Boeing airport data', () => {
  // ARC p. 3: 737-800 approach speed 142 kt at MLW 146,300 lb (66,361 kg), the Vref that
  // sets its approach category (14 CFR 97.3: Vref at maximum certificated landing weight).
  // The document names no flap; it is the lowest certified Vref, i.e. flaps 40 (the flaps
  // 30 Vref is higher). The model reaches 1.23 Vs at 130 kt: flaps 40 lifts too much (0057).
  it.fails('Vref flaps 40 at MLW 66,361 kg is about 142 kt (Boeing ARC Rev A, ±5 kt) [gap: 0057]', () => {
    expect(Math.abs(vrefKts(FLAPS_40, MLW_KG) - 142)).toBeLessThanOrEqual(5);
  });

  // VLA Table A6-1 (VREF+5), 3.0° glide slope column: 737-800, flaps 40, flight-director
  // pitch 1.3°. Speed: the ARC's 142 kt Vref scaled to 65 t (140.5 kt) + 5. Pitch on a
  // steady 3° path = trim AoA − 3°. The model needs −3.5° (nose down): flaps 40 (0057).
  it.fails('pitch on a 3° ILS at Vref+5, flaps 40, is about +1.3° (Boeing VLA Table A6-1, ±1°) [gap: 0057]', () => {
    const kts = 142 * Math.sqrt(b738.massKg / MLW_KG) + 5;
    const pitch = trimAoaDeg(b738, kts * KTS_TO_MPS, FLAPS_40) - 3;
    expect(Math.abs(pitch - 1.3)).toBeLessThanOrEqual(1);
  });

  // ACAP §3.4.3 (flaps 30, standard day, zero wind, dry, auto spoilers, anti-skid): the
  // sea-level dry curve reads 5,570 ft at 140,000 lb, 5,690 ft at 143,300 lb (65 t) and
  // 5,800 ft at MLW. That is the FAR landing field length, the demonstrated distance from
  // 50 ft divided by 0.6 (14 CFR 121.195(b)), so the airplane itself needs 0.6 × 5,690 =
  // 3,414 ft from 50 ft to a stop. Flown like 14 CFR 25.125: a steady 3° approach at Vref
  // (1.23 Vs) to 50 ft, idle and flare from 30 ft, then maximum braking, no reverse. Flaps
  // 25 is the game's landing flap and the model's nearest notch to 30 (0057).
  it('lands from 50 ft to a stop in about 3,414 ft, 65 t, sea level, dry (Boeing ACAP §3.4.3 × 0.6, ±15%)', () => {
    const kts = vrefKts(FLAPS_25);
    const v = kts * KTS_TO_MPS;
    const b = makeBody(b738, { kts, altM: b738.gearHeight + 50 / M_TO_FT, flaps: FLAPS_25, throttle: trimThrottle(b738, v, FLAPS_25, -3, true, airAt(15)) });
    b.vel.set(0, -v * Math.sin(3 * DEG_TO_RAD), -v * Math.cos(3 * DEG_TO_RAD));
    const pitch0 = trimAoaDeg(b738, v, FLAPS_25) - 3;
    b.quat.setFromAxisAngle({ x: 1, y: 0, z: 0 }, pitch0 * DEG_TO_RAD);
    let touchdown = null;
    fly(b, b738, 90, (x) => {
      const { pitchDeg, bankRightDeg } = attitude(x);
      const ft = (x.pos.y - b738.gearHeight) * M_TO_FT;
      let cmd = pitch0;
      if (touchdown) { cmd = -1; x.throttle = 0; x.brakesOn = true; } // nose down, max braking
      else if (ft < 30) { cmd = pitch0 + Math.min(3, (30 - ft) * 0.2); x.throttle = 0; } // flare
      x.elevInput = elevatorForPitch(cmd, pitchDeg, x.angVel.x);
      x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z);
    }, (x) => {
      if (!touchdown && x.onGround) touchdown = { sinkFpm: x.lastAirVsi, airFt: x.distM * M_TO_FT };
      return touchdown && -x.vel.z < 0.3;
    });
    // A real landing, not a drop: on the runway at under 600 fpm after ~1,000 ft in the air.
    expect(touchdown.sinkFpm).toBeGreaterThan(-600);
    expect(touchdown.airFt).toBeGreaterThan(700);
    within(b.distM * M_TO_FT, 0.6 * 5690, 0.15);
  });

  // ACAP §3.3.25 (26,000 lb SLST, the model's 2 × 120 kN; standard day, zero wind, dry,
  // optimum flap): the sea-level curve reads 4,600 ft at 143,300 lb (3,920 ft at 130,000;
  // it meets the chart's 5,902 ft line at 165,788 lb, the ACAP §3.3.41 code-3 limit).
  // 14 CFR 25.113(a): the takeoff distance is at least 115% of the all-engines distance to
  // 35 ft, so 1.15 × that distance can't exceed the field length (the engine-out cases
  // only make it longer). Flown with full thrust from brake release, rotation at Vr at
  // 2.5°/s (Boeing FCTM: 2–3°/s) to 15°, at the better of the model's takeoff flaps (10,
  // 25). The model needs ~5,420 ft: its acceleration averages ~0.25 g to lift-off (0058).
  it.fails('1.15 × the all-engines distance to 35 ft is within the 4,600 ft field length, 65 t, sea level (Boeing ACAP §3.3.25, 14 CFR 25.113) [gap: 0058]', () => {
    const toFt = (flaps) => {
      const b = makeBody(b738, { throttle: 1, flaps });
      let rot = null;
      fly(b, b738, 120, (x) => {
        const { pitchDeg, bankRightDeg } = attitude(x);
        if (x.iasKts >= b738.vrKts) {
          rot = (rot ?? pitchDeg) + 2.5 * (1 / 120);
          x.elevInput = elevatorForPitch(Math.min(x.onGround ? b738.maxGroundPitchDeg - 1 : 15, rot), pitchDeg, x.angVel.x);
        }
        x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z);
      }, (x) => (x.pos.y - b738.gearHeight) * M_TO_FT >= 35);
      return b.distM * M_TO_FT;
    };
    expect(1.15 * Math.min(toFt(1), toFt(FLAPS_25))).toBeLessThanOrEqual(4600);
  });
});

// 143,300 lb is 65,000 kg: the weight the cards above read the charts at.
it('the charts are read at the model mass (65,000 kg = 143,300 lb)', () => {
  expect(Math.abs(b738.massKg * LB_PER_KG - 143300)).toBeLessThan(100);
});
