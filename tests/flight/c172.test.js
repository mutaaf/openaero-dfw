// Flight test cards: the Cessna 172S flown headless (harness.js) against the Pilot's
// Operating Handbook (Cessna 172S POH, Section 5, 2550 lb, sea level ISA unless noted;
// Fig. 5-3 stall speeds, 5-5 short field takeoff (p. 5-14), 5-6 maximum rate of climb, 3-1 maximum
// glide). The model has no instrument error, so stall speeds compare with KCAS.
//
// A card the model does not yet meet is a KNOWN GAP: `it.fails` keeps the gate green
// while the gap exists and turns it red the day the model is fixed, so the fixing PR
// must promote the card to `it` (and the gap can never silently come back).
//
// Every card flies twice: flightModel.js (the game's default) and JSBSim (src/fdm/jsbsim.js
// flying our public/jsbsim/ C172, ?fdm=jsbsim in the game). Gaps are per model.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { M_TO_FT } from '../../src/constants.js';
import { stallAoaDeg } from '../../src/aero.js';
import { elevatorForPitch, aileronForBank } from '../../src/autopilot.js';
import { makeBody, fly, speedHoldPilot, settle, vsFpm, shortFieldTakeoff, stallInTurn, attitude, useFdm } from './harness.js';
import { nodeJsbsim } from './jsbsimNode.js';

const c172 = AIRCRAFT_DATABASE.c172;
const within = (measured, ref, tol) => expect(Math.abs(measured - ref) / ref).toBeLessThanOrEqual(tol);

// 1 kt/s deceleration at idle, wings level, until the wing passes its stall angle.
function stallKts(flaps) {
  const b = makeBody(c172, { kts: 70, altM: 1500, flaps });
  let kts = null;
  fly(b, c172, 60, speedHoldPilot((x) => Math.max(20, 70 - x.t)), (x) => {
    if (x.aoaDeg > stallAoaDeg(c172, flaps)) { kts = x.iasKts; return true; }
    return false;
  });
  return kts;
}

const rocFpm = (altM) => settle(makeBody(c172, { kts: 74, altM, throttle: 1 }), c172, 10, speedHoldPilot(() => 74), vsFpm, 60);

// JSBSim's known gaps (measured, PR #48):
//  - lift-off 55.2 kt (band edge 55.08, so a small fix promotes the card): the 11° hold sags to 10.2° on JSBSim's real tail (elevatorForPitch is
//    proportional only), so the wing reaches lift-off speed later.
//  - brakes 138 m: main-wheel brakes only, load moves to the nose wheel, 0.36 g. The 0.45 μ
//    reference is flightModel.js's assumption, not the POH; the POH landing-roll card that
//    should replace it is ticket 0051.
const GAPS = { flightModel: new Set(), jsbsim: new Set(['takeoff', 'brakes']) };

for (const model of ['flightModel', 'jsbsim']) describe(`Cessna 172S vs POH (${model})`, () => {
  beforeAll(async () => useFdm(model === 'jsbsim' ? await nodeJsbsim() : null));
  afterAll(() => useFdm(null));
  const card = (id) => (GAPS[model].has(id) ? it.fails : it);

  it('stalls clean near 53 KCAS (POH: 48 KIAS / 53 KCAS, ±10%)', () => {
    within(stallKts(0), 53, 0.10);
  });

  it('stalls with flaps 10 near 50 KCAS (POH: 42 KIAS / 50 KCAS, ±10%)', () => {
    within(stallKts(1), 50, 0.10);
  });

  it('stalls with full flaps near 48 KCAS (POH: 40 KIAS / 48 KCAS, ±10%)', () => {
    within(stallKts(3), 48, 0.10);
  });

  // POH short-field technique: flaps 10, full power, rotate nose-high, lift off at 51 KIAS.
  card('takeoff')('short-field ground roll near 960 ft, lift-off near 51 kt (POH, ±15%)', () => {
    const { rollFt, liftoffKts } = shortFieldTakeoff(c172, 0);
    within(rollFt, 960, 0.15);
    within(liftoffKts, 51, 0.08);
  });

  // POH Fig. 5-5 sheet 1 (p. 5-14), 2550 lb, flaps 10°, full throttle before brake release,
  // paved level dry runway, zero wind, lift off 51 KIAS, 56 KIAS at 50 ft. Sea level,
  // interpolated to ISA 15 °C: ground roll (925 + 995) / 2 = 960 ft, total over a 50 ft
  // obstacle (1575 + 1690) / 2 = 1633 ft. The POH's takeoff tables are all short-field
  // (flaps 10°); there is no flaps-up one. Lift-off speed is the card above's job; this one
  // checks the distances and that the harness pilot stayed on the runway heading and climbed
  // near 56 KIAS. Rotating at 45 KIAS to 11° is the harness's convention (the POH says only
  // "slightly tail low"); its quick rotation is printed, not judged. The speed hold
  // overshoots to ~58 KIAS by 50 ft, which lengthens the total a little.
  it('short-field takeoff: roll near 960 ft, 1633 ft over a 50 ft obstacle (POH Fig. 5-5, ±15%)', () => {
    const r = shortFieldTakeoff(c172, 0, 50);
    console.log(`[c172 ${model}] roll ${r.rollFt.toFixed(0)} ft, 50 ft at ${r.totalFt.toFixed(0)} ft; `
      + `rotate ${r.rotateKts.toFixed(1)} KIAS, peak pitch rate ${r.maxPitchRateDegS.toFixed(1)}°/s, `
      + `lift-off ${r.liftoffKts.toFixed(1)} KIAS, ${r.clearKts.toFixed(1)} KIAS at 50 ft, heading ±${r.maxHeadingDevDeg.toFixed(2)}°`);
    expect(r.maxHeadingDevDeg).toBeLessThan(2);
    within(r.clearKts, 56, 0.05);
    within(r.rollFt, 960, 0.15);
    within(r.totalFt, 1633, 0.15);
  });

  card('brakes')('brakes stop the aircraft from 58 kt in about 100 m (μ 0.45 ≈ 0.43 g)', () => {
    const b = makeBody(c172);
    b.vel.set(0, 0, -30);
    b.brakesOn = true;
    fly(b, c172, 30, null, (x) => -x.vel.z < 0.5);
    within(b.distM, 30 * 30 / (2 * 0.45 * 9.80665), 0.25);
  });

  // POH Fig. 5-5 at sea level: 960 ft at 15 °C (interpolated), 1150 ft at 40 °C (+20%).
  it('a hot day lengthens the ground roll like the POH table (ISA +25 °C: +20%, ±8%)', () => {
    within(shortFieldTakeoff(c172, 25).rollFt / shortFieldTakeoff(c172, 0).rollFt, 1.198, 0.08);
  });

  // POH Fig. 5-6: 785 fpm at 0 °C, 710 at 20 °C → 729 fpm at 15 °C.
  it('climbs about 729 fpm at Vy 74 KIAS, full throttle, sea level (POH, ±10%)', () => {
    within(rocFpm(1), 729, 0.10);
  });

  // Thinner air for the wing (0038) and less power from the engine (0039, Gagg-Ferrar).
  // POH Fig. 5-6 at 10,000 ft: 360 fpm at −20 °C, 300 at 0 °C → 315 fpm at ISA (−4.8 °C).
  it('climbs about 315 fpm at 10,000 ft, ISA (POH, ±15%)', () => {
    within(rocFpm(3048), 315, 0.15);
  });

  // POH Fig. 4-3 / 5-8 (2550 lb, standard day): at 8,000 ft, 2700 rpm, 77% BHP, 124 KTAS
  // (Fig. 4-3 says 124 KTAS at 75% power, 8000 ft). Full throttle at 8,000 ft is the
  // nearest the model's power lever gets to that row. The pilot holds altitude with pitch
  // and lets the speed settle; level-flight TAS is what drag and the power lapse decide.
  it('cruises about 124 KTAS level at 8,000 ft, full throttle (POH Fig. 4-3 / 5-8, ±8%)', () => {
    const alt0 = 8000 / M_TO_FT;
    const b = makeBody(c172, { kts: 100, altM: alt0, throttle: 1 });
    const hold = (x, dt) => {
      const { pitchDeg, bankRightDeg } = attitude(x);
      const vsErr = vsFpm(x);
      x.pitchTrim = (x.pitchTrim ?? x.pitchCmd) + ((alt0 - x.pos.y) * 0.002 - vsErr * 0.00005) * dt * 20;
      x.pitchCmd = Math.max(-5, Math.min(20, x.pitchTrim + (alt0 - x.pos.y) * 0.02 - vsErr * 0.001));
      x.elevInput = elevatorForPitch(x.pitchCmd, pitchDeg, x.angVel.x);
      x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z);
    };
    fly(b, c172, 180, hold);
    const tas = [];
    fly(b, c172, 60, (x, dt) => { hold(x, dt); tas.push(x.tasKts); });
    // Settled: speed varies < 2 kt and the altitude stayed within 100 ft of 8,000.
    expect(Math.max(...tas) - Math.min(...tas)).toBeLessThan(2);
    expect(Math.abs(b.pos.y - alt0) * M_TO_FT).toBeLessThan(100);
    within(tas.reduce((a, c) => a + c, 0) / tas.length, 124, 0.08);
  });

  // Was 4.6:1 with lift in body axes (0037); the idle prop windmills (0039).
  it('glides about 9:1 at 68 KIAS, idle (POH: ~1.5 NM per 1000 ft, ±15%)', () => {
    const g = makeBody(c172, { kts: 68, altM: 1500 });
    const pilot = speedHoldPilot(() => 68);
    fly(g, c172, 60, pilot);
    const h0 = g.pos.y, d0 = g.distM;
    fly(g, c172, 30, pilot);
    within((g.distM - d0) / (h0 - g.pos.y), 9.1, 0.15);
  });
});

// FAA Airplane Flying Handbook (FAA-H-8083-3C) ch. 5 / Pilot's Handbook (FAA-H-8083-25B)
// ch. 5: in a level coordinated turn rate = g·tan(bank)/V (= 1091·tan(bank)/V[kt] °/s) and
// load factor = 1/cos(bank). The model must turn like that, whatever its own drag says.
for (const model of ['flightModel', 'jsbsim']) describe(`Cessna 172S level turns vs FAA handbook (${model})`, () => {
  beforeAll(async () => useFdm(model === 'jsbsim' ? await nodeJsbsim() : null));
  afterAll(() => useFdm(null));
  function levelTurn(bankDeg, kts) {
    const b = makeBody(c172, { kts, altM: 1500, throttle: 0.75 });
    const alt0 = b.pos.y;
    const hold = speedHoldPilot(() => kts);
    let heading0 = null, t0 = null, tasSum = 0, tanSum = 0, n = 0;
    const headingDeg = (x) => (Math.atan2(x.vel.x, -x.vel.z) * 180) / Math.PI;
    let unwrapped = 0, last = headingDeg(b);
    fly(b, c172, 45, (x, dt) => {
      // Altitude held with pitch, speed with throttle; bank commanded and rolled in.
      const bank = Math.min(bankDeg, x.t * 10);
      const { pitchDeg, bankRightDeg } = attitude(x);
      const vsErr = x.vel.y * 3.281 * 60;
      x.pitchTrim = (x.pitchTrim ?? x.pitchCmd) + ((alt0 - x.pos.y) * 0.002 - vsErr * 0.00005) * dt * 20;
      x.pitchCmd = Math.max(-5, Math.min(20, x.pitchTrim + (alt0 - x.pos.y) * 0.02 - vsErr * 0.001));
      x.elevInput = elevatorForPitch(x.pitchCmd, pitchDeg, x.angVel.x);
      x.aileronInput = aileronForBank(bank, bankRightDeg, -x.angVel.z);
      x.throttle = Math.max(0.2, Math.min(1, x.throttle + (kts - (x.iasKts ?? kts)) * 0.02 * dt));
      const h = headingDeg(x);
      let d = h - last; if (d > 180) d -= 360; if (d < -180) d += 360;
      unwrapped += d; last = h;
      if (x.t > 25 && heading0 === null) { heading0 = unwrapped; t0 = x.t; }
      if (x.t > 25) { tasSum += x.tasKts; tanSum += Math.tan((attitude(x).bankRightDeg * Math.PI) / 180); n++; }
    });
    return { rateDegS: (unwrapped - heading0) / (b.t - t0), altErrM: b.pos.y - alt0, tasKts: tasSum / n, tanBank: tanSum / n };
  }
  for (const bank of [30, 45]) {
    // V is true airspeed and bank the one actually flown (the harness pilot rolls in and
    // holds ~${bank}°), so this checks the model's turn dynamics, not the pilot's accuracy.
    it(`turns at 1091·tan(bank)/TAS °/s at ~${bank}° bank, 90 KIAS, 5,000 ft (FAA-H-8083-25B, ±10%)`, () => {
      const { rateDegS, altErrM, tasKts, tanBank } = levelTurn(bank, 90);
      expect(Math.abs(altErrM)).toBeLessThan(60);
      within(Math.abs(rateDegS), (1091 * Math.abs(tanBank)) / tasKts, 0.10);
    });
  }

  // Accelerated stall (ticket 0067). FAA-H-8083-25B ch. 5 "Load Factor and Stalling Speed"
  // (and its stall-speed-vs-bank chart) / FAA-H-8083-3C ch. 5: in a level turn the stall
  // speed rises with √(load factor) = √(1/cos(bank)): +19% at 45° (1.41 g), +41% at 60°
  // (2 g). From the POH's 53 KCAS clean stall (Fig. 5-3): 63 KCAS at 45°, 75 KCAS at 60°.
  // The harness pilot holds the turn level and bleeds ~1 kt/s on the throttle; the card
  // also checks it actually flew that turn (bank, load factor, altitude, bleed rate).
  // Holding 60° level needs full power, and the propeller's thrust·sin(α) then carries a
  // little of the weight, so the break comes a few percent under the power-off √n number.
  for (const bank of [45, 60]) {
    const ref = 53 * Math.sqrt(1 / Math.cos((bank * Math.PI) / 180));
    it(`stalls near ${ref.toFixed(0)} KCAS in a level ${bank}° turn, flaps up (53·√(1/cos ${bank}°), FAA-H-8083-25B ch. 5, ±10%)`, () => {
      const r = stallInTurn(c172, bank, stallAoaDeg(c172, 0));
      console.log(`[c172 ${model}] ${bank}° turn: break ${r.kts.toFixed(1)} KCAS (ref ${ref.toFixed(1)}), `
        + `${r.n.toFixed(2)} g, bank ${r.bankDeg.toFixed(1)}°, alt ${r.altErrM.toFixed(1)} m, bleed ${r.bleedKtsS.toFixed(2)} kt/s`);
      expect(Math.abs(r.bankDeg - bank)).toBeLessThan(2);
      within(r.n, 1 / Math.cos((bank * Math.PI) / 180), 0.05);
      expect(Math.abs(r.altErrM)).toBeLessThan(30);
      expect(r.bleedKtsS).toBeGreaterThan(0.5);
      expect(r.bleedKtsS).toBeLessThan(1.5);
      within(r.kts, ref, 0.10);
    });
  }
});
