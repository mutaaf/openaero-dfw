// Flight test cards: the Cessna 172S flown headless (harness.js) against the Pilot's
// Operating Handbook (Cessna 172S POH, Section 5, 2550 lb, sea level ISA unless noted;
// Fig. 5-3 stall speeds, 5-5 short field takeoff (p. 5-14), 5-6 maximum rate of climb, 5-11 short
// field landing (p. 5-23), 3-1 maximum glide). The model has no instrument error, so stall speeds compare with KCAS.
//
// A card the model does not yet meet is a KNOWN GAP: `it.fails` keeps the gate green
// while the gap exists and turns it red the day the model is fixed, so the fixing PR
// must promote the card to `it` (and the gap can never silently come back).
//
// Every card flies twice: flightModel.js (the game's default) and JSBSim (src/fdm/jsbsim.js
// flying our public/jsbsim/ C172, ?fdm=jsbsim in the game). Gaps are per model.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Vector3, Quaternion } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { M_TO_FT } from '../../src/constants.js';
import { stallAoaDeg } from '../../src/aero.js';
import { elevatorForPitch, aileronForBank } from '../../src/autopilot.js';
import { makeBody, fly, speedHoldPilot, settle, vsFpm, shortFieldTakeoff, shortFieldLanding, stallInTurn, crosswindTakeoff, crosswindLanding, attitude, useFdm } from './harness.js';
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
//
// Short-field landing, both models (ticket 0082): the C172's mains at their POH arm, the
// tyres' friction below the CG (gear.js) and the brakes on the mains, torque-limited (fitted
// to Fig. 5-11: flightModel.js μ 0.39, JSBSim's brake command 0.42). flightModel.js rolls
// ~578 ft and its air segment is 754 ft (POH 1335 - 575 = 760). JSBSim floated ~943 ft
// (+24%) until 0085: its glide (7.2:1 at 61 KIAS, flaps 30, idle) and flare (20 ft to
// touchdown) were within 2% of flightModel.js, but every airborne spawn started its engine at
// 2,283 rpm and ~135 hp whatever the throttle, so the first ~3 s were powered. Now ~751 ft.
const GAPS = {
  flightModel: new Set(),
  jsbsim: new Set(['takeoff']),
};

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

  // POH Fig. 5-11 (p. 5-23), 2550 lb, flaps 30°, power off, maximum braking, paved level dry
  // runway, zero wind, 61 KIAS at 50 ft, short-field technique (Section 4). Sea level,
  // interpolated to ISA 15 °C: ground roll (565 + 585) / 2 = 575 ft, total over a 50 ft
  // obstacle (1320 + 1350) / 2 = 1335 ft. This replaces a card that braked from 58 kt against
  // flightModel.js's own μ 0.45 (not a published figure). The pilot must land like the book:
  // one touchdown, on the mains, gently, near the stall (KCAS 48 flaps 30, Fig. 5-3).
  // The pilot is checked on its own (never an it.fails), so a gap card can't hide a bad landing.
  it('short-field landing pilot: one touchdown on the mains, gently, near the stall, to a stop', () => {
    const r = shortFieldLanding(c172);
    console.log(`[c172 ${model}] landing roll ${r.rollFt.toFixed(0)} ft, ${r.totalFt.toFixed(0)} ft from 50 ft; `
      + `touchdown ${r.tdKts.toFixed(1)} KCAS at ${r.tdSinkFpm} fpm, airborne again ${r.bounceS.toFixed(2)} s`);
    expect(r.stopped).toBe(true);
    expect(r.bounceS).toBe(0);
    expect(r.tdSinkFpm).toBeLessThan(300);
    expect(r.tdKts).toBeGreaterThan(48);
    expect(r.tdKts).toBeLessThan(48 * 1.15);
    // "Hold the control wheel full back" (Section 4): the brakes keep the nose wheel down.
    expect(r.noseDownS).not.toBeNull();
    expect(r.noseOffS).toBe(0);
    expect(r.rollPitchMaxDeg).toBeLessThanOrEqual(1);
  });

  // The POH's short-field approach is power off at 50 ft: an airborne spawn with the throttle
  // closed must not carry power the pilot never set (JSBSim's engine start did, 0085).
  it('an airborne spawn at idle makes no power from the first step (Fig. 5-11: power off)', () => {
    const b = makeBody(c172, { kts: 61, altM: 100, flaps: 3, throttle: 0 });
    fly(b, c172, 0.1, null);
    expect(b.engineN).toBeLessThan(0.02);
  });

  card('landRoll')('short-field landing: ground roll near 575 ft (POH Fig. 5-11, ±15%)', () => {
    within(shortFieldLanding(c172).rollFt, 575, 0.15);
  });

  card('landAir')('short-field landing: 760 ft from the 50 ft obstacle to touchdown (POH Fig. 5-11 total - roll, ±15%)', () => {
    within(shortFieldLanding(c172).airFt, 1335 - 575, 0.15);
  });

  card('landTotal')('short-field landing: 1335 ft from a 50 ft obstacle to a stop (POH Fig. 5-11, ±15%)', () => {
    within(shortFieldLanding(c172).totalFt, 1335, 0.15);
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
    let heading0 = null, t0 = null, tasSum = 0, tanSum = 0, ballSum = 0, n = 0, rudInt = 0;
    const prevVel = b.vel.clone(), f = new Vector3(), inv = new Quaternion();
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
      // Coordinated, as the handbook's turn is: rudder centres the ball, i.e. no sideways
      // specific force (the formula assumes none; sideslip and the rudder each push the fin).
      // Ball = (dv/dt + g up) across the airframe, in g, + = pushed right.
      f.subVectors(x.vel, prevVel).divideScalar(dt);
      f.y += 9.80665;
      prevVel.copy(x.vel);
      const ball = f.applyQuaternion(inv.copy(x.quat).invert()).x / 9.80665;
      rudInt = Math.max(-1, Math.min(1, rudInt - ball * 4 * dt));
      x.rudderInput = Math.max(-1, Math.min(1, rudInt - ball * 2));
      x.throttle = Math.max(0.2, Math.min(1, x.throttle + (kts - (x.iasKts ?? kts)) * 0.02 * dt));
      const h = headingDeg(x);
      let d = h - last; if (d > 180) d -= 360; if (d < -180) d += 360;
      unwrapped += d; last = h;
      if (x.t > 25 && heading0 === null) { heading0 = unwrapped; t0 = x.t; }
      if (x.t > 25) { tasSum += x.tasKts; tanSum += Math.tan((attitude(x).bankRightDeg * Math.PI) / 180); ballSum += ball; n++; }
    });
    return { rateDegS: (unwrapped - heading0) / (b.t - t0), altErrM: b.pos.y - alt0, tasKts: tasSum / n, tanBank: tanSum / n, ballG: ballSum / n };
  }
  for (const bank of [30, 45]) {
    // V is true airspeed and bank the one actually flown (the harness pilot rolls in and
    // holds ~${bank}°), so this checks the model's turn dynamics, not the pilot's accuracy.
    it(`turns at 1091·tan(bank)/TAS °/s at ~${bank}° bank, 90 KIAS, 5,000 ft, ball centred (FAA-H-8083-25B, ±5%)`, () => {
      const { rateDegS, altErrM, tasKts, tanBank, ballG } = levelTurn(bank, 90);
      const book = (1091 * Math.abs(tanBank)) / tasKts;
      console.log(`[c172 ${model}] ${bank}° turn: ${Math.abs(rateDegS).toFixed(2)}°/s vs ${book.toFixed(2)}°/s (${((Math.abs(rateDegS) / book - 1) * 100).toFixed(1)}%), ball ${ballG.toFixed(3)} g`);
      expect(Math.abs(altErrM)).toBeLessThan(60);
      expect(Math.abs(ballG)).toBeLessThan(0.01); // it flew the coordinated turn
      within(Math.abs(rateDegS), book, 0.05);
    });
  }

  // Accelerated stall (ticket 0067). POH Fig. 5-3 (power off, flaps up, aft CG): 57 KIAS /
  // 63 KCAS at 45° of bank, 68 KIAS / 75 KCAS at 60°. That is the 53 KCAS wings-level stall
  // times √(load factor) = √(1/cos(bank)), the FAA-H-8083-25B ch. 5 "Load Factors and
  // Stalling Speeds" rule. The harness pilot holds the turn level and coordinated and
  // bleeds ~1 kt/s on the throttle; the card checks it flew that turn (bank, sideslip,
  // true load factor, altitude, bleed rate), then checks the break two ways: against the
  // POH (±10%) and, tighter, against √n times the same pilot's wings-level break (±3%), so
  // a lift model that scaled like n^0.4 could not pass. A level 60° turn needs full power,
  // where the POH's figures are power off: power-on stalls come a little lower in the real
  // airplane too.
  const levelBreak = {};
  for (const bank of [45, 60]) {
    const poh = { 45: [57, 63], 60: [68, 75] }[bank];
    it(`stalls near ${poh[1]} KCAS in a level ${bank}° turn, flaps up (POH: ${poh[0]} KIAS / ${poh[1]} KCAS, ±10%)`, () => {
      levelBreak[model] ??= stallInTurn(c172, 0, stallAoaDeg(c172, 0));
      const r0 = levelBreak[model];
      const r = stallInTurn(c172, bank, stallAoaDeg(c172, 0));
      const sqrtLaw = r0.kts * Math.sqrt(r.n / r0.n);
      console.log(`[c172 ${model}] ${bank}° turn: break ${r.kts.toFixed(1)} KCAS (POH ${poh[1]}, √n law ${sqrtLaw.toFixed(1)}), `
        + `${r.n.toFixed(2)} g, bank ${r.bankDeg.toFixed(1)}°, β ${r.betaDeg.toFixed(2)}°, alt ${r.altErrM.toFixed(1)} m, bleed ${r.bleedKtsS.toFixed(2)} kt/s`);
      expect(Math.abs(r.bankDeg - bank)).toBeLessThan(2);
      expect(Math.abs(r.betaDeg)).toBeLessThan(1);
      within(r.n, 1 / Math.cos((bank * Math.PI) / 180), 0.05);
      expect(Math.abs(r.altErrM)).toBeLessThan(30);
      expect(r.bleedKtsS).toBeGreaterThan(0.5);
      expect(r.bleedKtsS).toBeLessThan(1.5);
      within(r.kts, sqrtLaw, 0.03);
      within(r.kts, poh[1], 0.10);
    });
  }
});

// Crosswind (ticket 0069). C172S POH Section 4, Airspeeds for Normal Operation: "Maximum
// Demonstrated Crosswind Velocity, Takeoff or Landing: 15 KNOTS". A test pilot took off and
// landed with a 15 kt crosswind component and kept it on the runway; the model's rudder,
// nose-wheel steering and ailerons must let our harness pilot do the same, here with the
// whole 15 kt at 90° from the right. Technique (harness.js crosswindTakeoff and
// crosswindLanding): the POH's crosswind advice (Section 4 amplified procedures: minimum
// flaps, ailerons into the wind, lift off cleanly; flaps up and the nose wheel lifted at
// 55 KIAS for the takeoff, flaps 10 at 70 KIAS for the approach) and FAA-H-8083-3C ch. 9's
// wing-low landing: touch down on the upwind main with no side drift and the nose along the
// centreline (also the Private Pilot ACS standard). Runway: 150 ft wide (KDFW 35C/17C), so
// the edges are 75 ft either side of the centreline. Each card flies controls in the same
// test: in calm air the same pilot needs no pedal, and in the wind a pilot who does nothing
// about it (feet flat) leaves the runway on the takeoff and arrives crabbed and skating
// sideways on the landing, so a wind the model ignored could not pass.
for (const model of ['flightModel', 'jsbsim']) describe(`Cessna 172S 15 kt crosswind vs POH (${model})`, () => {
  beforeAll(async () => useFdm(model === 'jsbsim' ? await nodeJsbsim() : null));
  afterAll(() => useFdm(null));

  it('takes off in a 15 kt direct crosswind within 30 ft of the centreline, with pedal to spare (POH max demonstrated 15 kt)', () => {
    const calm = crosswindTakeoff(c172, 0);
    const r = crosswindTakeoff(c172, 15);
    const feetFlat = crosswindTakeoff(c172, 15, { pedals: false });
    console.log(`[c172 ${model}] 15 kt crosswind takeoff: ±${r.maxOffFt.toFixed(1)} ft, heading ±${r.maxHeadingDevDeg.toFixed(1)}°, `
      + `rudder mean ${r.meanRudder.toFixed(2)} steady ${r.steadyRudder.toFixed(2)} peak ${r.maxRudder.toFixed(2)}, aileron mean ${r.meanAileron.toFixed(2)}, `
      + `bank on the wheels ±${r.maxBankDeg.toFixed(1)}°, lift-off ${r.liftoffKts?.toFixed(1)} KIAS in ${r.rollFt.toFixed(0)} ft; `
      + `calm rudder mean ${calm.meanRudder.toFixed(3)}; feet flat: ${feetFlat.maxOffFt.toFixed(0)} ft off, heading ${feetFlat.maxHeadingDevDeg.toFixed(0)}°`);
    // Control: no wind, no pedal needed and nowhere to drift.
    expect(Math.abs(calm.meanRudder)).toBeLessThan(0.05);
    expect(calm.maxOffFt).toBeLessThan(5);
    // The wind is felt: it takes steady left pedal (wind from the right weathervanes the nose
    // right), and with the feet flat the airplane leaves the runway.
    expect(r.meanRudder).toBeLessThan(-0.1);
    expect(feetFlat.maxOffFt).toBeGreaterThan(75);
    // The card: it lifts off on the centreline, pointing down the runway, wings level on the
    // wheels; 15 kt is demonstrated, not limiting, so the steady pedal leaves a margin.
    expect(r.liftoffKts).not.toBeNull();
    expect(r.maxOffFt).toBeLessThan(30);
    expect(r.maxHeadingDevDeg).toBeLessThan(5);
    expect(r.maxBankDeg).toBeLessThan(5);
    expect(Math.abs(r.steadyRudder)).toBeLessThan(0.6);
  }, 20000);

  it('lands wing-low in a 15 kt direct crosswind on the centreline with no drift and stops on the runway (POH, FAA-H-8083-3C)', () => {
    const calm = crosswindLanding(c172, 0);
    const r = crosswindLanding(c172, 15);
    const noSlip = crosswindLanding(c172, 15, { wingLow: false });
    const t = r.td;
    console.log(`[c172 ${model}] 15 kt crosswind landing: slip on short final rudder ${r.finalRudder.toFixed(2)}, bank ${r.finalBankDeg.toFixed(1)}° right, `
      + `β ${r.finalBetaDeg.toFixed(1)}°; touchdown ${t.offFt.toFixed(1)} ft off the centreline, drift ${t.driftKts.toFixed(1)} kt, heading ${t.headingDeg.toFixed(1)}°, `
      + `bank ${t.bankRightDeg.toFixed(1)}°, ${t.sinkFpm} fpm, ${t.iasKts.toFixed(0)} KIAS, ${t.distFt.toFixed(0)} ft past the threshold; `
      + `rollout ±${r.maxRollOffFt.toFixed(1)} ft; feet flat: skating ${noSlip.td.driftKts.toFixed(1)} kt, crab ${noSlip.td.headingDeg.toFixed(1)}°`);
    // Control: in calm air the same pilot touches down on the centreline without a slip.
    expect(Math.abs(calm.finalRudder)).toBeLessThan(0.05);
    expect(Math.abs(calm.td.offFt)).toBeLessThan(10);
    // The wind is felt: with the feet flat the airplane arrives crabbed into the wind and
    // skating sideways across its nose (the side load the slip exists to avoid).
    expect(Math.abs(noSlip.td.driftKts)).toBeGreaterThan(10);
    expect(Math.abs(noSlip.td.headingDeg)).toBeGreaterThan(10);
    // The slip: opposite (left) rudder holding the nose straight, the upwind (right) wing down
    // (how far down: the sideslip card below), the upwind main touching first.
    expect(r.finalRudder).toBeLessThan(-0.1);
    expect(r.finalBankDeg).toBeGreaterThan(0.5);
    expect(t.bankRightDeg).toBeGreaterThan(0);
    // The card: on the centreline, no side drift, nose aligned, not a hard landing, and the
    // rollout stays between the edges to a stop.
    expect(Math.abs(t.offFt)).toBeLessThan(25);
    expect(Math.abs(t.driftKts)).toBeLessThan(2);
    expect(Math.abs(t.headingDeg)).toBeLessThan(3);
    expect(t.sinkFpm).toBeLessThan(360);
    expect(r.stopped).toBe(true);
    expect(r.maxRollOffFt).toBeLessThan(75);
  }, 20000);
});

// Ticket 0081: a sideslip pushes the fuselage and fin sideways (Roskam CYβ −0.31, the
// slip's opposite rudder taking back part of it, CYδr 0.187) and rolls the windward wing up
// (dihedral effect, Roskam Clβ −0.089). Before 0081 flightModel.js had neither: the 15 kt
// wing-low slip above held with 1.2° of bank where JSBSim, flying our public/jsbsim/ C172
// built on those derivatives, needs 4.2°, and the slip needed no aileron into the wind.
// Reference: the JSBSim run of the same pilot in the same test (the same sideslip, ~12.5°).
// Still different on the crosswind takeoff roll: flightModel.js banks ±0.7° on the wheels
// with aileron 0.01, JSBSim ±4.3° with 0.07 (the gear: JSBSim's spring-steel mains give more
// than gear.js's struts). No published figure decides it, so it is printed, not carded.
describe('Cessna 172S sideslip: flightModel.js vs the Roskam derivatives (JSBSim)', () => {
  afterAll(() => useFdm(null));
  it('banks for a 15 kt wing-low slip within 30% of JSBSim, holding aileron into the wind (side force and dihedral, ticket 0081)', async () => {
    useFdm(await nodeJsbsim());
    const ref = crosswindLanding(c172, 15);
    useFdm(null);
    const r = crosswindLanding(c172, 15);
    const calm = crosswindLanding(c172, 0);
    console.log(`[c172] slip bank: flightModel ${r.finalBankDeg.toFixed(1)}° at β ${r.finalBetaDeg.toFixed(1)}° (aileron ${r.finalAileron.toFixed(3)}, calm ${calm.finalAileron.toFixed(3)}), `
      + `JSBSim ${ref.finalBankDeg.toFixed(1)}° at β ${ref.finalBetaDeg.toFixed(1)}° (aileron ${ref.finalAileron.toFixed(3)})`);
    within(ref.finalBetaDeg, r.finalBetaDeg, 0.15); // the same slip, so the banks compare
    within(r.finalBankDeg, ref.finalBankDeg, 0.30);
    // Dihedral: holding the upwind (right) wing down takes steady right aileron against the
    // slip's rolling moment; in calm air the same pilot holds none.
    expect(r.finalAileron).toBeGreaterThan(0.05);
    expect(Math.abs(calm.finalAileron)).toBeLessThan(0.02);
  }, 20000);
});
