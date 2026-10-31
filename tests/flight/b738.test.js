// Flight test cards for the Boeing 737-800 (65 t). The first three pin operational facts
// pilots know; the rest read Boeing's published airport data:
//  - ACAP: 737 Airplane Characteristics for Airport Planning, D6-58325-7 Rev C (Oct 2025),
//    737NG_REV_C.pdf, §3.3.29 (takeoff) and §3.4.3 (landing) charts
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
import { liftCoefficient, dragCoefficient, stallSpeedKts, vrefFor } from '../../src/aero.js';
import { trimAoaDeg, elevatorForPitch, aileronForBank } from '../../src/autopilot.js';
import { M_TO_FT, KTS_TO_MPS, DEG_TO_RAD } from '../../src/constants.js';
import { makeBody, fly, attitude, vsFpm, speedHoldPilot } from './harness.js';

const b738 = AIRCRAFT_DATABASE.b738;
const vApp = (b738.vrefKts + 5) * 0.514444;
const within = (measured, ref, tol) => expect(Math.abs(measured - ref) / ref).toBeLessThanOrEqual(tol);
const LB_PER_KG = 2.20462;
const MLW_KG = 66361; // ARC / ACAP: maximum landing weight 146,300 lb
// The model's flap notches are 0/10/30/40 (b738.flapDetentsDeg); the real 737 lands with 30 or 40.
const FLAPS_10 = 1, FLAPS_30 = 2, FLAPS_40 = 3;

// 14 CFR 25.125(b)(2): VREF ≥ 1.23 VSR0, the 1-g reference stall speed in the landing
// configuration. Scaled to another mass by √(m / massKg) (same CL, same speed squared).
const vrefKts = (flaps, massKg = b738.massKg) => 1.23 * stallSpeedKts(b738, flaps) * Math.sqrt(massKg / b738.massKg);

describe('Boeing 737-800', () => {
  it('flies a 3° final at Vref+5 on ~20–35% thrust (N1 ~55–60%), not near idle', () => {
    const thr = trimThrottle(b738, vApp, 2, -3, true, airAt(200));
    expect(thr).toBeGreaterThan(0.2);
    expect(thr).toBeLessThan(0.35);
  });

  it('the game\'s Vref (HUD, assists, autoland, spawns) is the model\'s own 1.23 Vs at flaps 30', () => {
    expect(b738.flapDetentsDeg[FLAPS_30]).toBe(30);
    expect(Math.abs(b738.vrefKts - vrefKts(FLAPS_30))).toBeLessThanOrEqual(1);
  });

  it('with flaps 40 the game flies the flaps 40 Vref (gate, grade, autoland, Kid), the model\'s 1.23 Vs there', () => {
    expect(b738.flapDetentsDeg[FLAPS_40]).toBe(40);
    expect(Math.abs(vrefFor(b738, FLAPS_40) - vrefKts(FLAPS_40))).toBeLessThanOrEqual(1);
    expect(vrefFor(b738, FLAPS_30)).toBe(b738.vrefKts);
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
  // The document names no flap: assumed flaps 40, the lowest Vref, which is the one that
  // sets the category. (Before 0057 flaps 40 lifted too much: 130 kt.)
  it('Vref flaps 40 at MLW 66,361 kg is about 142 kt (Boeing ARC Rev A, ±5 kt)', () => {
    expect(Math.abs(vrefKts(FLAPS_40, MLW_KG) - 142)).toBeLessThanOrEqual(5);
  });

  // VLA Table A6-1 (VREF+5), 3.0° glide slope column: 737-800 w/Winglets (the model's
  // 35.8 m span is the winglet airframe), flaps 40, flight-director pitch 0.9° (1.3° without
  // winglets). Speed: the ARC's 142 kt Vref scaled to 65 t (140.5 kt) + 5. Pitch on a
  // steady 3° path = trim AoA − 3°. (Before 0057 the model needed −3.5°, nose down.)
  it('pitch on a 3° ILS at Vref+5, flaps 40, is about +0.9° (Boeing VLA Table A6-1, winglets, ±1°)', () => {
    const kts = 142 * Math.sqrt(b738.massKg / MLW_KG) + 5;
    const pitch = trimAoaDeg(b738, kts * KTS_TO_MPS, FLAPS_40) - 3;
    expect(Math.abs(pitch - 0.9)).toBeLessThanOrEqual(1);
  });

  // VLA Table A6-1 (VREF), 3.0° glide slope column: 737-800 w/Winglets, flaps 30, flight-
  // director pitch 3.2°. No public source gives Vref30 itself, so the speed is the model's
  // own 1.23 Vs at flaps 30 (fitted with the same stall AoA as flaps 40): this card and the
  // ARC card above pin the flaps 30 lift.
  it('pitch on a 3° ILS at Vref, flaps 30, is about +3.2° (Boeing VLA Table A6-1, winglets, ±1°)', () => {
    const pitch = trimAoaDeg(b738, vrefKts(FLAPS_30) * KTS_TO_MPS, FLAPS_30) - 3;
    expect(Math.abs(pitch - 3.2)).toBeLessThanOrEqual(1);
  });

  // ACAP §3.4.3 (flaps 30, standard day, zero wind, dry, auto spoilers, anti-skid): the
  // sea-level dry curve reads 5,570 ft at 140,000 lb, 5,690 ft at 143,300 lb (65 t) and
  // 5,800 ft at MLW. That is the FAR landing field length, the demonstrated distance from
  // 50 ft divided by 0.6 (14 CFR 121.195(b)), so the airplane itself needs 0.6 × 5,690 =
  // 3,414 ft from 50 ft to a stop. Flown like 14 CFR 25.125: a steady 3° approach at Vref
  // (1.23 Vs) to 50 ft, idle and flare from 30 ft, then maximum braking, no reverse, in
  // Boeing's configuration: flaps 30 at the fitted Vref30 (~150 kt), auto ground spoilers.
  // (Before 0057 it flew flaps 25 at 139 kt with the wing still lifting on the rollout,
  // two errors that partly cancelled.)
  it('lands from 50 ft to a stop in about 3,414 ft, 65 t, sea level, dry (Boeing ACAP §3.4.3 × 0.6, ±15%)', () => {
    const kts = vrefKts(FLAPS_30);
    const v = kts * KTS_TO_MPS;
    const b = makeBody(b738, { kts, altM: b738.gearHeight + 50 / M_TO_FT, flaps: FLAPS_30, throttle: trimThrottle(b738, v, FLAPS_30, -3, true, airAt(15)) });
    b.vel.set(0, -v * Math.sin(3 * DEG_TO_RAD), -v * Math.cos(3 * DEG_TO_RAD));
    const pitch0 = trimAoaDeg(b738, v, FLAPS_30) - 3;
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

  // ACAP §3.3.29 (CFM56-7B24/-7B26/-7B27 at 26,000 lb SLST; the model has 2 × 120 kN ≈
  // 27,000 lb, 4% more; standard day, zero wind, dry, optimum flap; non-winglet performance,
  // "winglet aircraft will have slightly improved performance", so for the model's winglet
  // airframe it is an upper bound): the sea-level curve reads 5,120 ft at 143,300 lb (4,910
  // ft at 140,000). Not §3.3.25 (4,600 ft): that chart is the short field package, which the
  // model doesn't have.
  // 14 CFR 25.113(a): the takeoff distance is at least 115% of the all-engines distance to
  // 35 ft, so 1.15 × that distance can't exceed the field length (the engine-out cases
  // only make it longer). Flown with full thrust from brake release at the model's takeoff
  // flap (10; its other notches are the landing flaps 30 and 40), rotating at Vr like a line
  // crew (see takeoff() below). (Before 0058: Vr 142 kt and a slower rotation, ~5,520 ft.)
  it('1.15 × the all-engines distance to 35 ft is within the 5,100 ft field length, 65 t, sea level (Boeing ACAP §3.3.29, 14 CFR 25.113)', () => {
    expect(1.15 * takeoff(FLAPS_10).ft35).toBeLessThanOrEqual(5100);
  });
});

// Takeoff, 65 t, sea level, standard day, full thrust from brake release, wings level. At Vr
// the pilot rotates towards 15° at a commanded 3°/s, the top of the FCTM's 2–3°/s: the
// airplane follows ~1° behind, so it averages ~2.3°/s from Vr to lift-off, what crews fly
// (ATSB 200500382, VH-VXH, 737-838: 2.2°/s average over 23 normal takeoffs; ATSB
// AO-2018-011, VH-YIR, 737-800: 2.4°/s). Ground pitch is held 1° short of the 11° tailstrike.
// `oei`: one of the two engines fails at Vr (half the thrust; the model has no asymmetric yaw).
function takeoff(flaps, { oei = false } = {}) {
  const b = makeBody(b738, { throttle: 1, flaps });
  let rot = null, vr = null, liftoff = null;
  fly(b, b738, 120, (x, dt) => {
    const { pitchDeg, bankRightDeg } = attitude(x);
    if (x.iasKts >= b738.vrKts) {
      if (!vr) {
        vr = { t: x.t, pitchDeg };
        if (oei) x.throttle = (0.5 - b738.engine.idleFraction) / (1 - b738.engine.idleFraction);
      }
      rot = (rot ?? pitchDeg) + 3 * dt;
      x.elevInput = elevatorForPitch(Math.min(x.onGround ? b738.maxGroundPitchDeg - 1 : 15, rot), pitchDeg, x.angVel.x);
    }
    x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z);
  }, (x) => {
    if (vr && !liftoff && !x.onGround) {
      const { pitchDeg } = attitude(x);
      liftoff = { kts: x.iasKts, pitchDeg, ratePerS: (pitchDeg - vr.pitchDeg) / (x.t - vr.t), seconds: x.t - vr.t };
    }
    return (x.pos.y - b738.gearHeight) * M_TO_FT >= 35;
  });
  return { ft35: b.distM * M_TO_FT, kts35: b.iasKts, liftoff };
}

describe('Boeing 737-800 rotation and Vr (0058)', () => {
  // The test pilot rotates like a line crew, or the takeoff cards measure the pilot.
  it('rotates at an average ~2.2–2.4°/s from Vr to lift-off, like crews do (ATSB 200500382, AO-2018-011; FCTM 2–3°/s)', () => {
    const { ratePerS } = takeoff(FLAPS_10).liftoff;
    expect(ratePerS).toBeGreaterThan(2.1);
    expect(ratePerS).toBeLessThan(2.5);
  });

  // NTSB (American Airlines 737-800, LAX, 2011), quoting the operator's 737 manual: rotate at
  // 2–3°/s, "normal lift-off attitude is 8–9°" at flaps 1 and 5, tail contact at 11°. ATSB
  // AO-2018-011 quotes 8° for flaps 5; applied here to flaps 10. Vr is the speed from which that rotation lifts off at
  // that attitude: rotate too late and the wing is flying before the pitch gets there (at Vr
  // 142 the model lifted off at 7.0°, 157 kt, a long, flat takeoff). This card pins the
  // model's Vr (b738.vrKts, flaps 10) against its own lift curve, not against a published
  // Vr (none found; the flaps 10 lift itself is 0062).
  // KNOWN GAP since the struts (0074): the wheels now leave when lift (plus the thrust's
  // vertical part) carries the weight, at ~7.3°. The single contact point needed ~5% more
  // lift to move off the runway, which is what put this at 8.3°. Closing it is the flaps 10
  // lift / Vr fit (0062, 0070), not a looser tolerance.
  it.fails('KNOWN GAP (0074): rotating at Vr, it lifts off at the normal 8–9° attitude, short of the 11° tailstrike (NTSB, operator 737 manual)', () => {
    const { pitchDeg } = takeoff(FLAPS_10).liftoff;
    expect(pitchDeg).toBeGreaterThanOrEqual(8);
    expect(pitchDeg).toBeLessThanOrEqual(9);
  });

  // 14 CFR 25.107(b)/(e)(1)(iii): V2 ≥ 1.13 VSR, and Vr must let an airplane that loses an
  // engine at Vr reach V2 by 35 ft. A Vr low enough to lift off at 8–9° must still do that,
  // and 14 CFR 25.113(a)(1): the engine-out distance to 35 ft is within the field length too
  // (ACAP §3.3.29, 5,100 ft). Generous: no windmilling or sideslip drag from the dead engine.
  it('with an engine failed at Vr it still reaches V2 (1.13 Vs, flaps 10) by 35 ft, within 5,100 ft (14 CFR 25.107, 25.113)', () => {
    const { kts35, ft35 } = takeoff(FLAPS_10, { oei: true });
    expect(kts35).toBeGreaterThanOrEqual(1.13 * stallSpeedKts(b738, FLAPS_10));
    expect(ft35).toBeLessThanOrEqual(5100);
  });
});

// Published 737-800 takeoff speeds (0062). No Boeing table is public, but two accident
// reports print the crews' performance-tool output, the right and the wrong one:
//  - AAIB Bulletin 6/2019, YR-BMF (737-8Q8), Table 1: 59 t: VR 140, V2 143; 71.3 t: VR 153,
//    V2 157 (assets.publishing.service.gov.uk/media/5f4681b1d3bf7f5d84a943c8/)
//  - ATSB AO-2014-162, VH-VZR (737-838): 66.4 t: V1 145, VR 146, V2 149; 76.4 t:
//    V1 152, VR 155, V2 158 (read in the verbatim copy at b737.org.uk/incident_vh-vzr.htm,
//    atsb.gov.au refused the sandbox)
// Neither prints the flap (the bug card is an image). Scaled to 65 t by √(m / 65 t), the
// stall-speed law V-speeds follow above the minimum-control speeds (737-800 VMCG/VMCA ~110
// kt): VR 143.0–147.0, V2 145.7–150.1, V2 − VR 3–4 kt. Caveats: the scaled VR falls a little
// with weight (146.9, 146.1, 144.4, 143.0), which may mean mixed flaps, and the 59 t case
// was a derated takeoff (assumed 48 °C). The model has one takeoff notch, 10, and Boeing's field
// length card above (optimum flap) caps how little lift it can have: with VR 145 the
// model's all-engines takeoff would need ~5,500 ft. Line crews mostly take off with flaps
// 1 or 5 on long runways, which lift less and fly faster: those cards are known gaps until
// the model has a flaps 5 notch (0070).
const PUBLISHED_TAKEOFF = [ // { t, vr, v2 } at the crews' weights
  { t: 59, vr: 140, v2: 143 }, { t: 71.3, vr: 153, v2: 157 }, // AAIB 6/2019
  { t: 66.4, vr: 146, v2: 149 }, { t: 76.4, vr: 155, v2: 158 }, // ATSB AO-2014-162
];
const at65t = (kts, t) => kts * Math.sqrt(b738.massKg / (t * 1000));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const VR_65T = mean(PUBLISHED_TAKEOFF.map((p) => at65t(p.vr, p.t))); // 145.1 kt
const V2_65T = mean(PUBLISHED_TAKEOFF.map((p) => at65t(p.v2, p.t))); // 148.3 kt

describe('Boeing 737-800 takeoff speeds vs published crew data (0062)', () => {
  // 14 CFR 25.107(b): V2 ≥ 1.13 VSR; the model's V2 is that floor at flaps 10.
  const v2 = () => 1.13 * stallSpeedKts(b738, FLAPS_10);

  it('the published speeds agree with each other once scaled to 65 t (√m, within ±3 kt)', () => {
    for (const p of PUBLISHED_TAKEOFF) {
      expect(Math.abs(at65t(p.vr, p.t) - VR_65T)).toBeLessThanOrEqual(3);
      expect(Math.abs(at65t(p.v2, p.t) - V2_65T)).toBeLessThanOrEqual(3);
      expect(p.v2 - p.vr).toBeGreaterThanOrEqual(3);
      expect(p.v2 - p.vr).toBeLessThanOrEqual(4);
    }
  });

  // A model bound, not the source's: every published pair has V2 3–4 kt above VR (the
  // known-gap card below); 0062 brought the model from 8.4 kt (Vr 132, V2 140.4) to 6.8, and
  // this keeps it from sliding back.
  it('V2 sits at most 7 kt above Vr (model bound; was 8.4 before 0062)', () => {
    const gap = v2() - b738.vrKts;
    expect(gap).toBeGreaterThanOrEqual(1);
    expect(gap).toBeLessThanOrEqual(7);
  });

  // AAIB 6/2019 quotes the 737 FCTM: rotating at VR towards 15° at 2–3°/s, "liftoff attitude
  // is achieved in approximately 3 to 4 seconds depending on airplane weight and thrust
  // setting". At full thrust the model gains ~5 kt a second, so it lifts off ~17 kt above Vr
  // (Vr + 13 measured at 75% thrust); the ticket's uncited "Vr + 5–10" is not used. This
  // card held before 0062 too (3.5 s): it guards the rotation, not the refit.
  it('lifts off 3–4 s after Vr at full thrust (737 FCTM, quoted in AAIB Bulletin 6/2019)', () => {
    const { seconds } = takeoff(FLAPS_10).liftoff;
    expect(seconds).toBeGreaterThanOrEqual(3);
    expect(seconds).toBeLessThanOrEqual(4);
  });

  it.fails('KNOWN GAP (0070): V2 is 3–4 kt above Vr, as in every published case', () => {
    const gap = v2() - b738.vrKts;
    expect(gap).toBeGreaterThanOrEqual(3);
    expect(gap).toBeLessThanOrEqual(4);
  });

  it.fails('KNOWN GAP (0070): Vr at 65 t is within 5 kt of the published 145 kt (flap not stated; likely 1 or 5)', () => {
    expect(Math.abs(b738.vrKts - VR_65T)).toBeLessThanOrEqual(5);
  });

  it.fails('KNOWN GAP (0070): V2 (1.13 Vs) at 65 t is within 5 kt of the published 148 kt (flap not stated; likely 1 or 5)', () => {
    expect(Math.abs(v2() - V2_65T)).toBeLessThanOrEqual(5);
  });
});

// 143,300 lb is 65,000 kg: the weight the cards above read the charts at.
it('the charts are read at the model mass (65,000 kg = 143,300 lb)', () => {
  expect(Math.abs(b738.massKg * LB_PER_KG - 143300)).toBeLessThan(100);
});

// Go-around (ticket 0083). 14 CFR 25.119 (landing climb): with all engines operating, in the
// landing configuration, at the thrust available 8 s after the levers leave minimum flight
// idle, and at VREF, the steady gradient of climb must be at least 3.2%. 14 CFR 33.73
// (engine power response): from minimum flight idle to 95% of takeoff thrust within 5 s.
// https://www.ecfr.gov/current/title-14/chapter-I/subchapter-C/part-25/subpart-B/subject-group-ECFR14f0e2fcc647a42/section-25.119
// https://www.ecfr.gov/current/title-14/chapter-I/subchapter-C/part-33/subpart-E/section-33.73
// The model has no separate go-around thrust rating: the lever goes to full (takeoff) thrust.
describe('Boeing 737-800 go-around (14 CFR 25.119 and 33.73)', () => {
  const air = airAt(300);
  const vref = b738.vrefKts;

  // Pilot: wings level, pitch holds VREF with gains stiff enough to stay within a few
  // knots through the surge of thrust (the harness speedHoldPilot lets it balloon +10 kt).
  const holdVref = () => {
    let last = null, trend = 0;
    return (b, dt) => {
      const { pitchDeg, bankRightDeg } = attitude(b);
      if (last !== null) trend += ((b.iasKts - last) / dt - trend) * Math.min(1, dt * 4);
      last = b.iasKts;
      const err = b.iasKts - vref;
      b.pitchTrim = (b.pitchTrim ?? b.pitchCmd) + err * 0.15 * dt;
      b.pitchCmd = Math.max(-15, Math.min(25, b.pitchTrim + err * 3 + trend * 8));
      b.elevInput = elevatorForPitch(b.pitchCmd, pitchDeg, b.angVel.x);
      b.aileronInput = aileronForBank(0, bankRightDeg, -b.angVel.z);
    };
  };

  it('climbs at VREF, gear down, flaps 30, at least 3.2% from 8 s after the levers move (25.119)', () => {
    const thr = trimThrottle(b738, vref * KTS_TO_MPS, FLAPS_30, -3, true, air);
    const b = makeBody(b738, { kts: vref, altM: 300, flaps: FLAPS_30, throttle: thr });
    const pilot = holdVref();
    fly(b, b738, 20, (x, dt) => { x.throttle = thr; pilot(x, dt); }); // stabilised 3° final
    fly(b, b738, 8, (x, dt) => { x.throttle = 1; pilot(x, dt); });
    let sum = 0, n = 0, dev = 0;
    fly(b, b738, 12, (x, dt) => {
      x.throttle = 1; pilot(x, dt);
      sum += x.vel.y / Math.hypot(x.vel.x, x.vel.z); n++;
      dev = Math.max(dev, Math.abs(x.iasKts - vref));
    });
    const gradient = sum / n;
    expect(vsFpm(b)).toBeGreaterThan(0);
    expect(dev).toBeLessThanOrEqual(4); // held VREF ± 4 kt (± 2 would need a stiffer pilot than a crew flies)
    expect(gradient).toBeGreaterThanOrEqual(0.032);
  });

  it('spools from minimum flight idle to 95% of takeoff thrust within 5 s (33.73)', () => {
    const b = makeBody(b738, { kts: vref, altM: 300, flaps: FLAPS_30, throttle: 0 });
    b.engineN = 0;
    const pilot = holdVref();
    const full = engineThrust(b738, 1, vref * KTS_TO_MPS, air, 0.23, 0);
    let t95 = null;
    fly(b, b738, 10, (x, dt) => { x.throttle = 1; pilot(x, dt); },
      (x) => { if (t95 === null && engineThrust(b738, x.engineN, vref * KTS_TO_MPS, air, 0.23, 0) >= 0.95 * full) t95 = x.t; return t95 !== null; });
    expect(t95).not.toBeNull();
    expect(t95).toBeLessThanOrEqual(5);
  });
});

// Cruise and ceiling (ticket 0113), 65 t, ISA, clean (gear up, flaps 0):
//  - EUROCONTROL Aircraft Performance Database, B738, "Cruise": MACH 0.79, ceiling FL 410
//    (learningzone.eurocontrol.int/ilp/customs/ATCPFDB/details.aspx?ICAO=B738)
//  - EASA TCDS IM.A.120 (Boeing 737), Issue 30, 28 Oct 2026, Section 4.1 (737-800), III.11,
//    p. 28: "Maximum Operating Altitude: 12,497 m (41,000 ft) pressure altitude". Its airspeed
//    limits (III.10) say only "See Airplane Flight Manual", so no card reads an MMO.
//    (easa.europa.eu/en/downloads/7297/en; the FAA TCDS A16WE copy the ticket named refused
//    the sandbox.)
// The 737 has a Mach drag rise (0120) but no buffet boundary.
const CRUISE_MACH = 0.79;
const easAtMach = (ft, mach) => { const air = airAt(ft / M_TO_FT); return mach * air.speedOfSoundMps * Math.sqrt(air.sigma); };

// Holds `mach` with pitch (its EAS at the height flown, so a climb doesn't drift the Mach up)
// at a fixed throttle; returns the mean climb rate (fpm), the altitude change (ft) and the
// Mach over the last 30 s, after 60 s to settle.
function cruise(ft, mach, throttle) {
  const kts = easAtMach(ft, mach) / KTS_TO_MPS;
  const b = makeBody(b738, { kts, altM: ft / M_TO_FT, gearDown: false, throttle });
  const hold = speedHoldPilot((x) => easAtMach(x.pos.y * M_TO_FT, mach) / KTS_TO_MPS);
  fly(b, b738, 60, (x, dt) => { x.throttle = throttle; hold(x, dt); });
  const y0 = b.pos.y;
  let sum = 0, n = 0;
  fly(b, b738, 30, (x, dt) => { x.throttle = throttle; hold(x, dt); sum += vsFpm(x); n++; });
  return { fpm: sum / n, dFt: (b.pos.y - y0) * M_TO_FT, mach: b.mach };
}

describe('Boeing 737-800 cruise and ceiling (EUROCONTROL APD, EASA TCDS IM.A.120; 0113)', () => {
  // Measured: drag 39.9 kN (0.7 of it the drag rise, 0120) against 52.9 kN of full thrust (75%; 70.1 kN, 56%, before 0116's
  // CFM fit) at FL350, Mach 0.79 (455 KTAS, 253 KEAS), L/D 16.0 (16.3 without it).
  it('at FL350, Mach 0.79 (EUROCONTROL APD cruise), 65 t, level flight needs less thrust than the engines have', () => {
    const air = airAt(35000 / M_TO_FT);
    const eas = easAtMach(35000, CRUISE_MACH);
    const tas = CRUISE_MACH * air.speedOfSoundMps;
    const q = 0.5 * 1.225 * eas * eas;
    const cl = liftCoefficient(b738, trimAoaDeg(b738, eas, 0) * DEG_TO_RAD, 0);
    const drag = dragCoefficient(b738, cl, false, 0, 1, CRUISE_MACH) * q * b738.wingAreaM2;
    const full = engineThrust(b738, 1, tas, air, CRUISE_MACH, q);
    expect(drag / full).toBeLessThan(1);
    const thr = trimThrottle(b738, eas, 0, 0, false, air);
    expect(thr).toBeGreaterThan(0.3); // a cruise setting, not near idle
    expect(thr).toBeLessThan(1);
  });

  // The same, flown: the trim throttle holds Mach 0.79 at FL350 within a few hundred fpm.
  it('flown at FL350 on the trim throttle, holding Mach 0.79 with pitch, it stays level (±300 fpm, ±0.01 M)', () => {
    const eas = easAtMach(35000, CRUISE_MACH);
    const thr = trimThrottle(b738, eas, 0, 0, false, airAt(35000 / M_TO_FT));
    const { fpm, mach } = cruise(35000, CRUISE_MACH, thr);
    expect(Math.abs(fpm)).toBeLessThanOrEqual(300);
    expect(Math.abs(mach - CRUISE_MACH)).toBeLessThanOrEqual(0.01);
  });

  // Compressibility drag rise (0120, aero.js waveDragCd: Mason's Korn equation + Lock's fourth power,
  // with the 737's 25° sweep and 12.89% t/c from Jenkinson's data file, κA 0.95). Boeing and Airbus
  // define MDD as the Mach where wave drag reaches 20 counts (ΔCD 0.002) and set it at MMO (Scholz &
  // Ciornei, "Mach number, relative thickness, sweep and lift coefficient of the wing", DGLR-2005-122,
  // HAW Hamburg); the 737-800's MMO is 0.82. Measured at FL350, 65 t: 5.5 counts at the Mach 0.79
  // cruise, 18.2 at Mach 0.82. A cross-check of the cited parameters, none of them fitted to it.
  it('at FL350, 65 t, wave drag is ~20 counts at MMO 0.82 (Boeing\'s MDD) and under 10 at the Mach 0.79 cruise', () => {
    const counts = (mach) => {
      const eas = easAtMach(35000, mach);
      const cl = liftCoefficient(b738, trimAoaDeg(b738, eas, 0) * DEG_TO_RAD, 0);
      return (dragCoefficient(b738, cl, false, 0, 1, mach) - dragCoefficient(b738, cl, false, 0, 1)) * 1e4;
    };
    expect(counts(0.82)).toBeGreaterThanOrEqual(15);
    expect(counts(0.82)).toBeLessThanOrEqual(25);
    expect(counts(0.79)).toBeGreaterThan(0);
    expect(counts(0.79)).toBeLessThan(10);
    expect(counts(0.65)).toBe(0); // below Mcrit at cruise lift: no drag rise
  });

  // Snecma CFM56-7B fact sheet (Direction de la Communication, June 2006), "Poussée max. en
  // montée, 35 000 ft – Mach 0,8 – ISA, moteur avionné": 26.50 kN for every rating, -7B18 to
  // -7B27. Full throttle in the sim is that max climb thrust up there (0116; σ^0.7 gave 35 kN).
  it('full thrust at 35,000 ft, Mach 0.8, ISA is CFM\'s max climb thrust, 26.5 kN per installed engine (±5%)', () => {
    const air = airAt(35000 / M_TO_FT);
    within(engineThrust(b738, 1, 0.8 * air.speedOfSoundMps, air, 0.8, 0) / 2, 26500, 0.05);
  });

  // EUROCONTROL APD ceiling FL 410 = the TCDS maximum operating altitude. Both are caps, not a
  // published thrust or buffet ceiling, and neither gives a mass (65 t is mid weight: the TCDS,
  // p. 28, gives 79,015 kg take-off and 66,360 kg / 146,300 lb landing masses). The card asks
  // the model to run out of performance near the cert limit: no level flight on full thrust
  // 1,000 ft above it. A light 737 may really be cert-limited there; the stronger evidence
  // is how far above it the model holds level. Tighten to a cited maximum-altitude-vs-weight
  // figure (FCOM/AFM) when one is found. KNOWN GAP (0127): with CFM's thrust (0116) and the Korn
  // drag rise (0120, the card below: +19 counts here) the model still climbs at ~+67 fpm (was +172
  // before 0120, ~+1,200 before 0116) and holds Mach 0.79 level to ~FL428 (was ~FL438; ~FL520).
  // At MMO 0.82 it only just holds FL410 on full thrust (+8 fpm; it fails by ~FL415). What is left: no buffet boundary, and one σ exponent for
  // the thrust above FL350 (Mattingly lapses ~10% faster by FL420), both uncited so far.
  it.fails('KNOWN GAP (0127): with full thrust at 42,000 ft, Mach 0.79, 65 t, it cannot hold level flight (ceiling FL410)', () => {
    const { fpm, mach } = cruise(42000, CRUISE_MACH, 1);
    expect(Math.abs(mach - CRUISE_MACH)).toBeLessThanOrEqual(0.01);
    expect(fpm).toBeLessThanOrEqual(0);
  });
});

// Descent (ticket 0119), 65 t, ISA, clean, idle (throttle 0). EUROCONTROL Aircraft Performance
// Database, B738, read 2026-10-31 (learningzone.eurocontrol.int/ilp/customs/ATCPFDB/details.aspx?ICAO=B738):
//   Initial descent (to FL 240): Mach 0.78, ROD 800 ft/min
//   Descent (to FL 100):         IAS 280 kt, ROD 3,500 ft/min
//   Approach:                    IAS 250 kt, ROD 1,500 ft/min
// The APD gives nominal rates for the speed schedule, not "at idle": the Mach 0.78 rate is a
// shallow, thrust-managed descent, so idle must be at least as steep (a floor, not a match).
// The 280 kt rate is the one a flight-planning table also treats as the descent rate. The
// harness holds EAS (≈ CAS within a few kt at these levels) with pitch.
function idleDescent(ft, kts, mach = null) {
  const target = (x) => (mach ? easAtMach(x.pos.y * M_TO_FT, mach) / KTS_TO_MPS : kts);
  const b = makeBody(b738, { kts: mach ? easAtMach(ft, mach) / KTS_TO_MPS : kts, altM: ft / M_TO_FT, gearDown: false, throttle: 0 });
  const hold = speedHoldPilot(target);
  fly(b, b738, 40, (x, dt) => { x.throttle = 0; hold(x, dt); });
  let sum = 0, n = 0;
  fly(b, b738, 30, (x, dt) => { x.throttle = 0; hold(x, dt); sum += vsFpm(x); n++; });
  return { fpm: -sum / n, mach: b.mach };
}

describe('Boeing 737-800 descent (EUROCONTROL APD; 0119)', () => {
  // Measured 2,908 fpm at idle, Mach 0.78, FL350 (APD's 800 fpm is the schedule's rate).
  it('at idle on the APD Mach 0.78 initial descent it sinks at least the published 800 ft/min and holds the Mach', () => {
    const { fpm, mach } = idleDescent(35000, null, 0.78);
    expect(fpm).toBeGreaterThanOrEqual(800);
    expect(Math.abs(mach - 0.78)).toBeLessThanOrEqual(0.01);
    expect(mach).toBeLessThan(0.82); // below the published MMO-class limit while descending
  });

  // KNOWN GAP (0126): idle at 280 kt, FL170 (the middle of APD's FL240-FL100 descent) sinks
  // ~1,800-1,900 ft/min, about half of APD's 3,500 (±20% = 2,800-4,200). Either the clean
  // airframe's idle drag is low or the idle thrust (4% of static, not Mach-lapsed) is too high.
  it.fails('KNOWN GAP (0126): idle at 280 kt, FL170, 65 t sinks at the APD descent rate, 3,500 ft/min (±20%)', () => {
    within(idleDescent(17000, 280).fpm, 3500, 0.2);
  });
});
