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
import { M_TO_FT, KTS_TO_MPS } from '../../src/constants.js';
import { trimThrottle } from '../../src/flightModel.js';
import { airAt } from '../../src/atmosphere.js';
import { stallAoaDeg, stallWarningKts } from '../../src/aero.js';
import { elevatorForPitch, aileronForBank, trimAoaDeg } from '../../src/autopilot.js';
import { createStallDrill, stallDrillState, gradeStallRecovery, stallResultInput } from '../../src/stallDrill.js';
import { DT, makeBody, noseWheelOn, fly, speedHoldPilot, settle, vsFpm, shortFieldTakeoff, shortFieldLanding, stallInTurn, crosswindTakeoff, crosswindLanding, attitude, useFdm } from './harness.js';
import { nodeJsbsim } from './jsbsimNode.js';
import { missionByKey } from '../../src/missions.js';
import { runwayEnd, approachGeometry } from '../../src/airports.js';
import { DEADSTICK_KEY, createDeadStick, deadStickPrompt, kidGuide } from '../../src/deadStick.js';
import { trimStep, trimSpeedKts } from '../../src/trim.js';

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
// touchdown) were within about 2% of flightModel.js, but every airborne spawn started its engine at
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
  it('an airborne spawn at idle makes no power (under 2%) from its first 0.1 s (Fig. 5-11: power off)', () => {
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
  // Both models climb ~279 here (−11%) since 0099's friction lapse: the POH's curve bends down
  // above 10,000 ft more than any single power lapse does, so this card and the ceiling share it.
  it('climbs about 315 fpm at 10,000 ft, ISA (POH, ±15%)', () => {
    within(rocFpm(3048), 315, 0.15);
  });

  // The POH's Section 1 specifications give a service ceiling of 14,000 ft, the altitude where
  // the climb falls to 100 fpm. flightModel.js climbed ~183 fpm there until 0099 took the
  // engine's friction power out of the δ/√θ lapse (engine.js): ~116 fpm now, JSBSim ~115.
  card('ceiling')('climbs about 100 fpm at the 14,000 ft service ceiling, ISA (POH Section 1 specifications, ±35%)', () => {
    within(rocFpm(14000 / 3.28084), 100, 0.35);
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

// Wind down the runway (ticket 0103). The airplane lifts off and touches down at an airspeed,
// so a headwind takes groundspeed off both ends of the roll and a tailwind adds it. The wind is
// body.windVec, where main.js puts the METAR's. Two references:
//  - FAA Pilot's Handbook (FAA-H-8083-25C) ch. 11, p. 11-14 and Fig. 11-19: "A headwind that is
//    10 percent of the takeoff airspeed reduces the takeoff distance approximately 19 percent
//    ... a tailwind that is 10 percent of the takeoff airspeed increases the takeoff distance
//    approximately 21 percent", and "the effect of wind on landing distance is identical". The
//    same page's "headwind speed is 50 percent of the takeoff speed ... approximately 25 percent
//    of the zero wind takeoff distance" is the square law, (1 - 0.5)². That is the physics; the
//    model must reproduce it (±4 points).
//  - C172S POH Fig. 5-5 note 3 and Fig. 5-11 note 2: "Decrease distances 10% for each 9 knots
//    headwind. For operation with tail winds up to 10 knots, increase distances by 10% for each
//    2 knots." These are planning corrections, and by the handbook's square law they are
//    conservative: a 9 kt headwind at a 55 kt lift-off saves ~30%, not 10%, and both models
//    (flightModel.js and JSBSim's C172) agree within a point. So the POH card is one-sided: flown in the note's
//    wind, the roll is never longer than the note plans for, and the tailwind still costs at
//    least 10%. With the wind zeroed every card here fails (ratio 1).
for (const model of ['flightModel', 'jsbsim']) describe(`Cessna 172S headwind and tailwind roll (${model}, ticket 0103)`, () => {
  beforeAll(async () => useFdm(model === 'jsbsim' ? await nodeJsbsim() : null));
  afterAll(() => useFdm(null));
  const takeoff = (w) => shortFieldTakeoff(c172, 0, 0, { windKts: w });
  const landing = (w) => shortFieldLanding(c172, { windKts: w });
  const show = (what, calm, head, tail, hw, tw) => console.log(`[c172 ${model}] ${what} roll calm ${calm.toFixed(0)} ft, `
    + `${hw.toFixed(1)} kt headwind ${head.toFixed(0)} ft (${((head / calm) * 100).toFixed(1)}%), `
    + `${tw.toFixed(1)} kt tailwind ${tail.toFixed(0)} ft (${((tail / calm) * 100).toFixed(1)}%)`);

  it('takeoff: a wind 10% of the lift-off speed takes 19% off the roll, a tailwind adds 21% (FAA-H-8083-25C Fig. 11-19, ±4 points)', () => {
    const calm = takeoff(0);
    const w = calm.liftoffKts * 0.1;
    const head = takeoff(w), tail = takeoff(-w);
    show('takeoff', calm.rollFt, head.rollFt, tail.rollFt, w, w);
    // IAS is not groundspeed: it lifts off at the same airspeed whatever the wind.
    expect(Math.abs(head.liftoffKts - calm.liftoffKts)).toBeLessThan(1);
    expect(Math.abs(tail.liftoffKts - calm.liftoffKts)).toBeLessThan(1);
    expect(Math.abs(head.rollFt / calm.rollFt - 0.81)).toBeLessThanOrEqual(0.04);
    expect(Math.abs(tail.rollFt / calm.rollFt - 1.21)).toBeLessThanOrEqual(0.04);
  });

  it('landing: a wind 10% of the touchdown speed takes 19% off the roll, a tailwind adds 21% (FAA-H-8083-25C Fig. 11-19, ±4 points)', () => {
    const calm = landing(0);
    const w = calm.tdKts * 0.1;
    const head = landing(w), tail = landing(-w);
    show('landing', calm.rollFt, head.rollFt, tail.rollFt, w, w);
    for (const r of [head, tail]) {
      expect(r.stopped).toBe(true);
      expect(r.bounceS).toBe(0);
      expect(Math.abs(r.tdKts - calm.tdKts)).toBeLessThan(1);
    }
    expect(Math.abs(head.rollFt / calm.rollFt - 0.81)).toBeLessThanOrEqual(0.04);
    expect(Math.abs(tail.rollFt / calm.rollFt - 1.21)).toBeLessThanOrEqual(0.04);
  });

  it('takeoff in a 9 kt headwind or a 6 kt tailwind never needs more roll than POH Fig. 5-5 note 3 plans (90% / 130%), and the tailwind costs at least 10%', () => {
    const calm = takeoff(0).rollFt, head = takeoff(9).rollFt, tail = takeoff(-6).rollFt;
    show('takeoff', calm, head, tail, 9, 6);
    expect(head / calm).toBeLessThanOrEqual(0.90);
    expect(tail / calm).toBeLessThanOrEqual(1.30);
    expect(tail / calm).toBeGreaterThanOrEqual(1.10);
  });

  it('landing in a 9 kt headwind or a 6 kt tailwind never needs more roll than POH Fig. 5-11 note 2 plans (90% / 130%), and the tailwind costs at least 10%', () => {
    const calm = landing(0).rollFt, head = landing(9).rollFt, tail = landing(-6).rollFt;
    show('landing', calm, head, tail, 9, 6);
    expect(head / calm).toBeLessThanOrEqual(0.90);
    expect(tail / calm).toBeLessThanOrEqual(1.30);
    expect(tail / calm).toBeGreaterThanOrEqual(1.10);
  });
});

// The game's wind on the runway (ticket 0106). main.js used to fade the METAR's wind to zero
// on the wheels, so the 0103 cards' headwind never reached the player's takeoff roll. Now it is
// the METAR's 10 m wind thinned by the log law to the CG's height (weather.js
// surfaceWindFactor, ~70% at the C172's 1.65 m): a 10 kt METAR headwind is ~7 kt at the wing,
// ~13% of the 51 kt lift-off, so the handbook's square law (FAA-H-8083-25C Fig. 11-19) puts the
// roll near (1 - 0.13)^2 = 76% of calm. With the old fade the ratio is 1.
describe('Cessna 172S takeoff in the METAR wind the game flies (ticket 0106)', () => {
  it('a 10 kt METAR headwind shortens the takeoff roll by at least 20%; a 5 kt METAR tailwind lengthens it', () => {
    const calm = shortFieldTakeoff(c172, 0, 0, { metarKts: 0 });
    const head = shortFieldTakeoff(c172, 0, 0, { metarKts: 10 });
    const tail = shortFieldTakeoff(c172, 0, 0, { metarKts: -5 });
    console.log(`[c172 game wind] takeoff roll calm ${calm.rollFt.toFixed(0)} ft, 10 kt METAR headwind ${head.rollFt.toFixed(0)} ft `
      + `(${((head.rollFt / calm.rollFt) * 100).toFixed(1)}%), 5 kt tailwind ${tail.rollFt.toFixed(0)} ft (${((tail.rollFt / calm.rollFt) * 100).toFixed(1)}%)`);
    expect(Math.abs(head.liftoffKts - calm.liftoffKts)).toBeLessThan(1);
    expect(head.rollFt / calm.rollFt).toBeLessThanOrEqual(0.80);
    // Not the whole 10 kt either: the wing is below the anemometer (the full 10 kt is ~67%).
    expect(head.rollFt / calm.rollFt).toBeGreaterThan(0.70);
    expect(tail.rollFt / calm.rollFt).toBeGreaterThan(1.08);
  });

  // The landing roll the same way: the METAR wind is all there at 50 ft and ~70% on the runway.
  it('a 10 kt METAR headwind shortens the landing roll by at least 15%; a 5 kt METAR tailwind lengthens it', () => {
    const calm = shortFieldLanding(c172, { metarKts: 0 });
    const head = shortFieldLanding(c172, { metarKts: 10 });
    const tail = shortFieldLanding(c172, { metarKts: -5 });
    console.log(`[c172 game wind] landing roll calm ${calm.rollFt.toFixed(0)} ft (${calm.tdKts.toFixed(1)} KIAS), 10 kt METAR headwind ${head.rollFt.toFixed(0)} ft `
      + `(${((head.rollFt / calm.rollFt) * 100).toFixed(1)}%), 5 kt tailwind ${tail.rollFt.toFixed(0)} ft (${((tail.rollFt / calm.rollFt) * 100).toFixed(1)}%)`);
    for (const r of [head, tail]) {
      expect(r.stopped).toBe(true);
      expect(r.bounceS).toBe(0);
      // The wind thins through the flare, so it arrives a little slower in a headwind.
      expect(Math.abs(r.tdKts - calm.tdKts)).toBeLessThan(2.5);
    }
    // ~7 kt at the wing on the runway, ~13% of the touchdown speed: the square law gives ~75%.
    expect(head.rollFt / calm.rollFt).toBeLessThanOrEqual(0.85);
    expect(head.rollFt / calm.rollFt).toBeGreaterThan(0.62);
    expect(tail.rollFt / calm.rollFt).toBeGreaterThan(1.08);
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

// Ticket 0087: the stall recovery drill (src/stallDrill.js) flown headless on both models.
// Entry: clean, idle, wings level, 1 kt/s deceleration from 80 KIAS at 4,500 ft until the
// wing passes its stall angle. Recovery (FAA-H-8083-3C ch. 5): nose down until the angle of
// attack is 4° below the stall, full power, wings level, then a Vy (74 KIAS) climb. Reference:
// POH Fig. 5-3 note 1, "Altitude loss during a stall recovery may be as much as 230 feet".
// The second card holds the stick full back at idle through the stall: never above a D.
const STALL_ALT_M = 4500 * 0.3048;
function stallDrill(recover) {
  const b = Object.assign(makeBody(c172, { kts: 80, altM: STALL_ALT_M, throttle: 0 }), { autoTrim: false });
  const st = createStallDrill();
  const entry = speedHoldPilot((x) => Math.max(20, 80 - x.t));
  const climb = speedHoldPilot(() => 74);
  const sa = stallAoaDeg(c172, 0);
  let noseDown = true, endBank = 0;
  const s = { t: 0, dt: DT, altFt: 0, aglFt: 0, aoaDeg: 0, stallAoaDeg: sa, vsFpm: 0, bankDeg: 0, pullIn: 0, throttle: 0 };
  fly(b, c172, 90, (x, dt) => {
    const { pitchDeg, bankRightDeg } = attitude(x);
    if (st.phase === 'armed') entry(x, dt);
    else if (recover) {
      x.throttle = 1;
      if (noseDown && x.aoaDeg > sa - 4) {
        x.elevInput = elevatorForPitch(pitchDeg - 6, pitchDeg, x.angVel.x);
        x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z);
      } else { noseDown = false; climb(x, dt); }
    } else {
      x.throttle = 0; x.elevInput = -1;
      x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z);
    }
    endBank = bankRightDeg;
  }, (x) => {
    Object.assign(s, { t: x.t, altFt: x.pos.y * M_TO_FT, aglFt: x.pos.y * M_TO_FT, aoaDeg: x.aoaDeg, vsFpm: vsFpm(x), bankDeg: attitude(x).bankRightDeg,
      pullIn: Math.max(0, -x.elevInput), throttle: x.throttle, iasKts: x.iasKts, warnKts: stallWarningKts(c172, 0) });
    stallDrillState(st, s);
    return st.phase === 'complete' || st.phase === 'failed';
  });
  // ...and on up at Vy for 10 s more: it ends level and climbing, not on the edge again.
  if (recover && st.phase === 'complete') fly(b, c172, 10, (x, dt) => { climb(x, dt); endBank = attitude(x).bankRightDeg; });
  return { st, result: gradeStallRecovery(stallResultInput(st)), vsFpm: vsFpm(b), bankDeg: endBank };
}

// Static pitch stability (ticket 0090, was a known gap): before it, flightModel.js's pitch rate
// was the elevator against damping, so with the stick released at the stall the nose stayed
// where it was (10.5°) and the wing sank deeper (α 26° after 7 s); JSBSim, flying our C172
// with Roskam's Cmα −0.89, drops the nose and flies again in ~1 s. Both models now do.
const STALL_GAPS = { flightModel: new Set(), jsbsim: new Set() };

// Released at the stall: idle, stick neutral, wings level. Seconds until the wing flies again.
function releasedAtStall() {
  // Trimmed at 80 kt and pulled to the stall without retrimming, as the POH's stall entry is flown.
  const b = Object.assign(makeBody(c172, { kts: 80, altM: STALL_ALT_M, throttle: 0 }), { autoTrim: false });
  const entry = speedHoldPilot((x) => Math.max(20, 80 - x.t));
  const sa = stallAoaDeg(c172, 0);
  let stallT = null, flyingS = null;
  fly(b, c172, 60, (x, dt) => {
    if (stallT === null) { entry(x, dt); if (x.aoaDeg > sa) stallT = x.t; return; }
    x.elevInput = 0;
    x.aileronInput = aileronForBank(0, attitude(x).bankRightDeg, -x.angVel.z);
  }, (x) => {
    if (stallT !== null && x.aoaDeg < sa - 3) flyingS = x.t - stallT;
    return flyingS !== null || (stallT !== null && x.t - stallT > 10);
  });
  return flyingS;
}

for (const model of ['flightModel', 'jsbsim']) describe(`Cessna 172S stall recovery drill (${model}, ticket 0087)`, () => {
  beforeAll(async () => useFdm(model === 'jsbsim' ? await nodeJsbsim() : null));
  afterAll(() => useFdm(null));
  const card = (id) => (STALL_GAPS[model].has(id) ? it.fails : it);

  card('release')('released at the stall, the nose drops by itself and the wing flies again within 2 s (static stability, Roskam Cmα)', () => {
    const s = releasedAtStall();
    expect(s).not.toBeNull();
    expect(s).toBeLessThanOrEqual(2);
  });

  it('nose down, full power, wings level: recovers level and climbing inside the POH\'s 230 ft, graded A or S', () => {
    const { st, result, vsFpm: vs, bankDeg } = stallDrill(true);
    console.log(`[c172 ${model}] stall recovery: lost ${(st.stallFt - st.lowFt).toFixed(0)} ft, flying again in ${st.recoverS?.toFixed(2)} s, `
      + `${result.grade} ${result.score}, climbing ${vs.toFixed(0)} fpm`);
    expect(st.phase).toBe('complete');
    expect(st.stallFt - st.lowFt).toBeLessThanOrEqual(230);
    expect(vs).toBeGreaterThan(300);
    expect(Math.abs(bankDeg)).toBeLessThan(5);
    expect(st.secondary).toBe(false);
    expect(['S', 'A']).toContain(result.grade);
  });

  it('holding the stick full back through the stall never grades above D', () => {
    const { st, result } = stallDrill(false);
    console.log(`[c172 ${model}] stick held back: ${st.phase}, ${st.stalledS.toFixed(1)} s stalled, lost ${(st.stallFt - st.lowFt).toFixed(0)} ft, ${result.grade} ${result.score}`);
    expect(['complete', 'failed']).toContain(st.phase);
    expect(result.grade).toBe('D');
  });
});

// Full back stick after the stall (ticket 0094): idle, wings level, the stick held full back
// from the stall for 30 s. Before 0090 flightModel.js locked at α 90°; after it, it cycled
// between α ~13° and ~69° (a falling leaf); with 0102's stiffer pitch it settles. Both models
// settle near α 40°: full stick is spec.elevatorAlphaDeg (36.7°) of α past the trim, on Roskam's
// linear Cmα and Cmδe, which our JSBSim C172 shares, so JSBSim is not an independent check of the
// depth. A real 172's post-stall pitch break would hold it shallower; that needs a cited
// post-stall Cm (ticket 0109). Pinned here: no falling leaf, and the two models agree.
function fullBackAfterStall() {
  const b = Object.assign(makeBody(c172, { kts: 80, altM: STALL_ALT_M, throttle: 0 }), { autoTrim: false });
  const entry = speedHoldPilot((x) => Math.max(20, 80 - x.t));
  const sa = stallAoaDeg(c172, 0);
  let stallT = null;
  const late = [];
  fly(b, c172, 60, (x, dt) => {
    if (stallT === null) { entry(x, dt); if (x.aoaDeg > sa) stallT = x.t; return; }
    x.throttle = 0; x.elevInput = -1;
    x.aileronInput = aileronForBank(0, attitude(x).bankRightDeg, -x.angVel.z);
  }, (x) => {
    if (stallT !== null && x.t - stallT > 20) late.push(x.aoaDeg);
    return stallT !== null && x.t - stallT > 30;
  });
  return { minA: Math.min(...late), maxA: Math.max(...late), meanA: late.reduce((a, v) => a + v, 0) / late.length };
}

describe('Cessna 172S full back stick after the stall (both models, ticket 0094)', () => {
  afterAll(() => useFdm(null));
  it('no falling leaf: α settles (swings under 5° in the last 10 s, under 45°) and flightModel.js is within 3° of JSBSim', async () => {
    useFdm(null);
    const fm = fullBackAfterStall();
    useFdm(await nodeJsbsim());
    const jsb = fullBackAfterStall();
    useFdm(null);
    for (const [name, r] of [['flightModel', fm], ['jsbsim', jsb]]) {
      console.log(`[c172 ${name}] full back after the stall: α ${r.minA.toFixed(1)}-${r.maxA.toFixed(1)}° in the last 10 s (mean ${r.meanA.toFixed(1)}°)`);
      expect(r.maxA - r.minA).toBeLessThan(5);
      expect(r.maxA).toBeLessThan(45);
    }
    expect(Math.abs(fm.meanA - jsb.meanA)).toBeLessThan(3);
  }, 30000);
  it.fails('KNOWN GAP (0109): flightModel.js settles at α ≤ 40° (a cited post-stall pitch break; measured 39.7-41.9°)', () => {
    useFdm(null);
    expect(fullBackAfterStall().maxA).toBeLessThanOrEqual(40);
  });
});

// Hands off, trimmed (ticket 0090): bumped 10 kt fast and let go, a stable airplane trades the
// speed for height and back in a damped phugoid and settles on the speed it is trimmed for,
// not on an attitude. Stick neutral throughout, wings held level, trim and power left alone.
function handsOffUpset(kts) {
  const altM = 1500;
  const throttle = trimThrottle(c172, kts * KTS_TO_MPS, 0, 0, true, airAt(altM));
  const b = Object.assign(makeBody(c172, { kts, altM, throttle }), { autoTrim: false });
  fly(b, c172, 1, (x) => { x.elevInput = 0; });
  const pitch0 = attitude(b).pitchDeg;
  b.vel.multiplyScalar((kts + 10) / kts);
  let maxPitch = -90;
  fly(b, c172, 180, (x) => {
    x.elevInput = 0;
    x.aileronInput = aileronForBank(0, attitude(x).bankRightDeg, -x.angVel.z);
    maxPitch = Math.max(maxPitch, attitude(x).pitchDeg);
  });
  return { iasKts: b.iasKts, noseUpDeg: maxPitch - pitch0 };
}

// flightModel.js only: the upset is written into the body's velocity, which JSBSim (with its
// own Cmα, out of the ticket's scope) keeps in its own state and would not see.
const model = 'flightModel';
describe('Cessna 172S hands off in trim (flightModel, ticket 0090)', () => {
  for (const kts of [70, 90, 110]) it(`trimmed at ${kts} KIAS, 10 kt fast and let go: the nose comes up and the speed is back within 2 kt in 3 min`, () => {
    const { iasKts, noseUpDeg } = handsOffUpset(kts);
    console.log(`[c172 ${model}] hands off at ${kts} kt: ${iasKts.toFixed(1)} kt after 3 min, nose up ${noseUpDeg.toFixed(1)}°`);
    expect(noseUpDeg).toBeGreaterThan(2);
    expect(Math.abs(iasKts - kts)).toBeLessThan(2);
  });
});

// Pitch trim (ticket 0094): trimmed level at one speed, the pilot rolls the trim (trim.js
// trimStep at its rate, the stick never touched) until it reads the new speed, sets the power
// for level flight there and lets go. A stable airplane settles on the trimmed speed (0090).
function retrim(fromKts, toKts) {
  const altM = 1500;
  const b = Object.assign(makeBody(c172, { kts: fromKts, altM, throttle: trimThrottle(c172, fromKts * KTS_TO_MPS, 0, 0, true, airAt(altM)) }),
    { autoTrim: false, trimAlphaDeg: trimAoaDeg(c172, fromKts * KTS_TO_MPS, 0) });
  const dir = toKts < fromKts ? 1 : -1; // slower = nose-up trim
  const reads = () => trimSpeedKts(c172, b.trimAlphaDeg, 0);
  let trimS = 0;
  const handsOff = (x) => { x.elevInput = 0; x.aileronInput = aileronForBank(0, attitude(x).bankRightDeg, -x.angVel.z); };
  fly(b, c172, 1, handsOff);
  b.throttle = trimThrottle(c172, toKts * KTS_TO_MPS, 0, 0, true, airAt(altM));
  fly(b, c172, 10, (x, dt) => {
    handsOff(x);
    if (dir > 0 ? reads() > toKts : reads() < toKts) { x.trimAlphaDeg = trimStep(x.trimAlphaDeg, dir, dt, c172, 0); trimS += dt; }
  });
  fly(b, c172, 180, handsOff);
  return { trimS, readsKts: reads(), iasKts: b.iasKts };
}

describe('Cessna 172S pitch trim (flightModel, ticket 0094)', () => {
  for (const [from, to] of [[90, 70], [70, 90]]) it(`trimmed at ${from} KIAS, rolled to read ${to} and let go: within 2 kt of ${to} after 3 min, the trim run under 3 s`, () => {
    const r = retrim(from, to);
    console.log(`[c172 flightModel] trim ${from} → ${to}: ${r.trimS.toFixed(1)} s of trim, reads ${r.readsKts.toFixed(1)}, ${r.iasKts.toFixed(1)} kt after 3 min hands off`);
    expect(r.trimS).toBeLessThan(3);
    expect(Math.abs(r.readsKts - to)).toBeLessThan(0.5);
    expect(Math.abs(r.iasKts - to)).toBeLessThan(2);
  });
});

// Phugoid period (validator, ticket 0102). Lanchester's constant-energy approximation, T = pi*sqrt(2)*V/g
// (Lanchester 1908; Etkin & Reid, Dynamics of Flight, the phugoid approximation), is the period of a
// drag-free exchange of speed and height. Drag lengthens a real phugoid, but at a Cessna's L/D it only
// stretches it by tens of percent, so a stick-fixed C172 sits between 1x and about 1.6x of it. Measured
// on the 0090 upset (10 kt fast, stick neutral, trim and power left alone) as the mean spacing of the
// airspeed's maxima. The reference is a bound from the approximation, not a C172 flight-test number
// (the POH publishes none): the card pins the physics, not a handbook figure.
function phugoidPeriodS(kts) {
  const altM = 1500;
  const throttle = trimThrottle(c172, kts * KTS_TO_MPS, 0, 0, true, airAt(altM));
  const b = Object.assign(makeBody(c172, { kts, altM, throttle }), { autoTrim: false });
  fly(b, c172, 1, (x) => { x.elevInput = 0; });
  b.vel.multiplyScalar((kts + 10) / kts);
  const ias = [];
  for (let i = 0; i < 240; i++) {
    fly(b, c172, 0.5, (x) => { x.elevInput = 0; x.aileronInput = aileronForBank(0, attitude(x).bankRightDeg, -x.angVel.z); });
    ias.push(b.iasKts);
  }
  const peaks = [];
  for (let i = 1; i < ias.length - 1; i++) if (ias[i] > ias[i - 1] && ias[i] >= ias[i + 1] && ias[i] > kts + 0.5) peaks.push(i * 0.5);
  return peaks.length > 1 ? (peaks[peaks.length - 1] - peaks[0]) / (peaks.length - 1) : null;
}

describe('Cessna 172S phugoid period (flightModel, ticket 0102)', () => {
  const lanchester = (kts) => Math.PI * Math.SQRT2 * kts * KTS_TO_MPS / 9.80665;
  // Closed by 0102: 33 / 42 / 56 s (1.9-2.2x) with the C172's soft pitch stiffness, 23 / 29 / 37 s
  // (1.3-1.4x) with it four times stiffer (aircraft.js pitchAuthority).
  for (const kts of [75, 90, 110]) it(`at ${kts} KIAS the period is 1.0-1.6x Lanchester's pi*sqrt(2)*V/g`, () => {
    const T = phugoidPeriodS(kts);
    const ref = lanchester(kts);
    console.log(`[c172 flightModel] phugoid at ${kts} kt: ${T?.toFixed(1)} s vs Lanchester ${ref.toFixed(1)} s (${(T / ref).toFixed(2)}x)`);
    expect(T).not.toBeNull();
    expect(T).toBeGreaterThanOrEqual(ref);
    expect(T).toBeLessThanOrEqual(1.6 * ref);
  });
});

// Stick-fixed takeoff (0090), the trim set as main.js's takeoff spawn sets it (1.2 Vr, flaps
// 1): full power and a neutral stick never rotate the Cessna by themselves before 1.4 Vr, and
// with the stick held back the nose comes up near Vr as before.
function stickFixedNoseLiftKts(elev) {
  const b = Object.assign(makeBody(c172, { flaps: 1, throttle: 1 }), { autoTrim: false, trimAlphaDeg: trimAoaDeg(c172, c172.vrKts * 1.2 * KTS_TO_MPS, 1) });
  let liftKts = null;
  fly(b, c172, 60, (x) => { x.elevInput = x.iasKts >= c172.vrKts ? elev : 0; x.brakesOn = false; },
    (x) => { if (x.t > 1 && !noseWheelOn(x)) liftKts = x.iasKts; return liftKts !== null; });
  return liftKts;
}

describe('Cessna 172S stick-fixed takeoff (flightModel, ticket 0090)', () => {
  it('takeoff trim, neutral stick: the nose wheel stays down until 1.4 Vr; full back stick at Vr lifts it within 8 kt', () => {
    const hands = stickFixedNoseLiftKts(0);
    const pulled = stickFixedNoseLiftKts(-1);
    console.log(`[c172 flightModel] stick-fixed nose lift: neutral ${hands?.toFixed(0)} kt, pulled at Vr ${pulled?.toFixed(0)} kt`);
    expect(hands === null || hands > 1.4 * c172.vrKts).toBe(true);
    expect(pulled).not.toBeNull();
    expect(pulled).toBeLessThan(c172.vrKts + 8);
  });
});

// Dead-stick challenge (ticket 0036). POH Section 3, engine failure during flight: "Airspeed 68
// KIAS (best glide)"; Fig. 3-1 Maximum Glide: 1.5 NM per 1,000 ft (~9:1), flaps up, prop
// windmilling, zero wind. The failed engine makes no power whatever the throttle says.
for (const model of ['flightModel', 'jsbsim']) describe(`Cessna 172S engine failure (${model}, ticket 0036)`, () => {
  beforeAll(async () => useFdm(model === 'jsbsim' ? await nodeJsbsim() : null));
  afterAll(() => useFdm(null));

  it('engine failed, throttle full forward: no power, and it glides 8:1 to 11:1 at 68 KIAS (POH Fig. 3-1)', () => {
    const g = Object.assign(makeBody(c172, { kts: 68, altM: 1067, throttle: 1 }), { engineFailed: true });
    const pilot = speedHoldPilot(() => c172.vGlideKts);
    fly(g, c172, 60, pilot);
    const h0 = g.pos.y, d0 = g.distM;
    fly(g, c172, 30, pilot);
    const ratio = (g.distM - d0) / (h0 - g.pos.y);
    console.log(`[c172 ${model}] engine out, throttle 1: glide ${ratio.toFixed(1)}:1, ${vsFpm(g).toFixed(0)} fpm at ${g.iasKts.toFixed(0)} KIAS`);
    expect(g.throttle).toBe(1);
    expect(ratio).toBeGreaterThanOrEqual(8);
    expect(ratio).toBeLessThanOrEqual(11);
  });
});

// The challenge as spawned (missions.js): 3,500 ft above the ground, 2 NM abeam the middle of
// Addison's runway on a left downwind for 16 at 75 KIAS, engine dead. A tight pattern at 68
// KIAS (downwind to 0.5 NM before the threshold, base, a 1 NM final) gets there ~950 ft high:
// the height is the puzzle. Flown the way the coach (deadStick.js) says, gliding on until it
// says turn, then to the runway line (Kid's hands-off guide steers exactly this), and landing
// flaps when it says "high" on final, it crosses the threshold at a normal height. Flat ground.
function deadStickPattern(mode) {
  const m = missionByKey(DEADSTICK_KEY);
  const end = runwayEnd('KADS', '16');
  const b = Object.assign(makeBody(c172, { kts: m.kias, altM: m.aglFt * 0.3048 }), { engineFailed: true });
  const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -m.hdg * Math.PI / 180);
  b.quat.premultiply(yaw);
  b.vel.applyQuaternion(yaw);
  b.pos.x = m.pos[0]; b.pos.z = m.pos[1];
  const d = { x: Math.sin(end.hdgT * Math.PI / 180), z: -Math.cos(end.hdgT * Math.PI / 180) };
  const at = (beforeM, rightM) => ({ x: end.thrX - d.x * beforeM - d.z * rightM, z: end.thrZ - d.z * beforeM + d.x * rightM });
  const wps = [at(926, -3704), at(1852, 0), at(-300, 0)];
  let wp = 0;
  const hold = speedHoldPilot(() => c172.vGlideKts);
  const st = createDeadStick(0), guide = {};
  const prompts = [];
  let overFt = null, maxDistNm = 0, lined = false;
  fly(b, c172, 600, (x, dt) => {
    hold(x, dt);
    const track = Math.atan2(x.vel.x, -x.vel.z) * 180 / Math.PI;
    const sim = { simTime: x.t, iasKts: x.iasKts, aglFt: x.pos.y * M_TO_FT, pos: x.pos, vel: x.vel, flapsIndex: x.flapsIndex, gsKts: x.gsKts, tasKts: x.tasKts, assist: 'pilot' };
    const p = deadStickPrompt(st, sim);
    if (p && p !== prompts[prompts.length - 1]) prompts.push(p);
    let bank;
    if (mode === 'tight') {
      if (wp < 2 && Math.hypot(wps[wp].x - x.pos.x, wps[wp].z - x.pos.z) < 250) wp++;
      const brg = Math.atan2(wps[wp].x - x.pos.x, -(wps[wp].z - x.pos.z)) * 180 / Math.PI;
      bank = Math.max(-25, Math.min(25, (((brg - track) % 360 + 540) % 360 - 180) * 1.5));
    } else {
      bank = kidGuide(st, sim, guide).guideBankDeg;
      if (p === 'dsHigh') x.flapsIndex = 3;
    }
    x.aileronInput = aileronForBank(bank, attitude(x).bankRightDeg, -x.angVel.z);
    x.rudderInput = Math.max(-1, Math.min(1, (x.betaDeg ?? 0) * 0.1));
    maxDistNm = Math.max(maxDistNm, Math.hypot(x.pos.x - end.thrX, x.pos.z - end.thrZ) / 1852);
    lined ||= p === 'dsFinal' || p === 'dsHigh';
  }, (x) => {
    const g = approachGeometry(end, x.pos);
    if ((mode === 'tight' ? wp === 2 : lined) && g.distM <= 0) { overFt = (x.pos.y - c172.gearHeight) * M_TO_FT; return true; }
    return x.pos.y < c172.gearHeight;
  });
  return { overFt, prompts, flaps: b.flapsIndex, maxDistNm, t: b.t };
}

describe('Cessna 172S dead-stick challenge at Addison (flightModel, ticket 0036)', () => {
  it('a tight pattern at best glide reaches Addison 16 high: makeable, and the coach calls it high', () => {
    const { overFt, prompts } = deadStickPattern('tight');
    console.log(`[c172 flightModel] dead-stick tight pattern: ${overFt?.toFixed(0)} ft over the threshold; coach ${prompts.join(' > ')}`);
    expect(overFt).toBeGreaterThan(300);
    expect(prompts[0]).toBe('dsFail');
    expect(prompts).toContain('dsHigh');
    expect(prompts).not.toContain('dsLow');
  });

  it('flown as the coach says (glide on, turn when told, flaps when high): over the threshold at 20 to 250 ft', () => {
    const { overFt, prompts, flaps, maxDistNm, t } = deadStickPattern('coach');
    console.log(`[c172 flightModel] dead-stick as coached: ${overFt?.toFixed(0)} ft over the threshold, flaps ${flaps}, out to ${maxDistNm.toFixed(1)} NM, ${t.toFixed(0)} s; coach ${prompts.join(' > ')}`);
    expect(overFt).toBeGreaterThan(20);
    expect(overFt).toBeLessThan(250);
    expect(maxDistNm).toBeLessThan(4);
    const turn = prompts.indexOf('dsTurnL');
    expect(prompts.indexOf('dsLeft')).toBeGreaterThan(0);
    expect(turn).toBeGreaterThan(prompts.indexOf('dsLeft'));
    expect(prompts.indexOf('dsFinal') > turn || prompts.indexOf('dsHigh') > turn).toBe(true);
    expect(prompts).not.toContain('dsLow');
    expect(prompts).not.toContain('dsTurnR');
  });
});
