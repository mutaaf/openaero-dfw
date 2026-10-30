// Flight test cards for the F-16C (ticket 0053). The flight manual (T.O. 1F-16CM-1) is not
// open data, so every card reads an open source, and nothing comes from a game wiki or forum:
//  - USAF: the Air Force's F-16 fact sheet, General Characteristics (F-16C/D),
//    https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104505/f-16-fighting-falcon/
//    (af.mil refuses scripted fetches; read from the verbatim copy linked to it at
//    https://wingsoverhouston.com/wp-content/uploads/2016/08/F16-Fact-Sheet.pdf)
//  - LM: Lockheed Martin, F-16 Block 70/72 product card (Jan 2025),
//    https://lockheedmartin.com/content/dam/lockheed-martin/aero/documents/F-16/25-00470_F-16%20Block70_72_Product%20Card_Jan%202025.pdf
//  - TP-1538: Nguyen et al., NASA Technical Paper 1538 (1979), Simulator Study of
//    Stall/Post-Stall Characteristics of a Fighter Airplane With Relaxed Longitudinal Static
//    Stability (the F-16's wind-tunnel data), https://ntrs.nasa.gov/citations/19800005879
//
// What the open data does not cover, so there is no card for it (gaps, not guesses):
//  - climb rate, turn rate, roll rate, takeoff and landing distances, approach speeds: all in
//    the restricted T.O.; the game's vrKts 155 and vrefKts 148 are uncited.
//  - top speed: USAF gives "Mach 2 at altitude", but the model has no transonic wave drag, so
//    its supersonic acceleration is not a performance claim (the zoom card is a capability
//    bound only).
//  - thrust lapse: TP-1538 Table VI tabulates the 1979 F100-PW-100, not the F110/F100-229
//    class engine the spec models, so its lapse is not this engine's. (For the record, at
//    max thrust the model has little of the table's ram rise with Mach: Tmax at sea level is
//    28,886 lbf at M 1.0 vs 21,420 at M 0.2 there, 1.35 ×; 1.05 × in the model.)
//  - the flight-control system (g and AoA limiters): out of scope for 0053; the 25° AoA
//    limit below sets the AoA at which the 1-g speed card is computed, and 0118's full-pull
//    cards measure that the model has neither limiter yet (0121).
//  - induced drag: aspectRatio 3.2 is the bare 31 ft wing (9.449² / 27.87); the span card
//    checks the USAF span, which (we infer) includes the wingtip missile rails.
//
// A card the model does not yet meet is a KNOWN GAP: `it.fails` with its ticket, never a
// looser tolerance. The fixing PR promotes it to `it`.
import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { M_TO_FT, DEG_TO_RAD } from '../../src/constants.js';
import { liftCoefficient, stallAoaDeg, stallSpeedKts } from '../../src/aero.js';
import { elevatorForPitch, aileronForBank } from '../../src/autopilot.js';
import { makeBody, fly, attitude, vsFpm, loadFactorMeter } from './harness.js';

const f16 = AIRCRAFT_DATABASE.f16;
const within = (measured, ref, tol) => expect(Math.abs(measured - ref) / ref).toBeLessThanOrEqual(tol);
const G = 9.80665;
const LB_TO_KG = 0.45359237;
const LBF_TO_N = 4.4482216;

// USAF: weight 19,700 lb without fuel (8,936 kg); 7,000 lb internal fuel (3,175 kg);
// F-16C/D thrust 27,000 lb; wingspan 32 ft 8 in (the sheet rounds it to 9.8 m; 9.96 m
// exactly). LM gives 31 ft / 9.449 m; that the difference is the wingtip missile rails is
// our inference, not either source's. LM: engine thrust class 29,000 lb (LM names no
// engine; the F110-GE-129 is aircraft.js's own label).
const EMPTY_KG = 19700 * LB_TO_KG;
const INTERNAL_FUEL_KG = 7000 * LB_TO_KG;
const SPAN_M = (32 + 8 / 12) * 0.3048;
const THRUST_CLASS_N = 29000 * LBF_TO_N;

// TP-1538 Table III, β = 0, δh = 0: body-axis force coefficients of the whole airplane, the
// leading-edge flap at its 25° limit (the base tables; App. B adds an increment as the flap
// retracts). TP-1538 p. 34 schedules it as δlef = 1.38α − 9.05 q̄/ps + 1.45 (deg), capped at
// 25°: at low speed and AoA ≥ 20° it is fully down, so these rows apply as they are.
// CL = −CZ·cos α + CX·sin α (X forward, Z down). δh = 0 is untrimmed: the trimmed lift at
// 20–25° differs by the stabilator's own contribution, which these cards ignore.
const TP1538 = { 20: { cx: 0.12830, cz: -1.41800 }, 25: { cx: 0.13000, cz: -1.65800 } };
const nasaCl = (aoaDeg) => {
  const { cx, cz } = TP1538[aoaDeg], a = aoaDeg * DEG_TO_RAD;
  return -cz * Math.cos(a) + cx * Math.sin(a);
};
// TP-1538 p. 12: the AoA limiter holds α "at or below 25°". Our own sum, not a NASA figure:
// the power-off 1-g speed at that limit, the spec's mass, sea level (KEAS), with the
// stabilator at 0° (untrimmed) is where CL(25°) carries the weight: about 129 kt. Thrust
// lifts too (afterburner × sin 25° is ~47% of the weight), so this is not a minimum speed
// with power.
const vAtAoaLimitKts = () => Math.sqrt(2 * f16.massKg * G / (1.225 * f16.wingAreaM2 * nasaCl(25))) / 0.514444;

describe('F-16C vs the USAF fact sheet and Lockheed Martin', () => {
  it('wingspan is the fact sheet\'s 32 ft 8 in (9.96 m), ±1%', () => {
    within(f16.wingSpanM, SPAN_M, 0.01);
  });

  it('wing area is 300 ft² (27.87 m², TP-1538 Table I), ±0.5%', () => {
    within(f16.wingAreaM2, 27.87, 0.005);
  });

  it('mass is between empty and empty + full internal fuel (8,936–12,111 kg, USAF)', () => {
    expect(f16.massKg).toBeGreaterThan(EMPTY_KG);
    expect(f16.massKg).toBeLessThanOrEqual(EMPTY_KG + INTERNAL_FUEL_KG);
  });

  it('max static thrust is the 29,000 lbf class (LM, ±3%) and not below USAF\'s 27,000 lbf', () => {
    within(f16.engine.staticThrustN, THRUST_CLASS_N, 0.03);
    expect(f16.engine.staticThrustN).toBeGreaterThanOrEqual(27000 * LBF_TO_N);
  });

  // A consistency check of the two cards above (both spec inputs). Empty + internal fuel
  // leaves out the pilot, gun ammunition, oil and LOX (~600 lb).
  it('static thrust-to-weight is 29,000 lbf over empty + internal fuel (26,700 lb): 1.09, ±3%', () => {
    within(f16.engine.staticThrustN / (f16.massKg * G), THRUST_CLASS_N / ((EMPTY_KG + INTERNAL_FUEL_KG) * G), 0.03);
  });
});

describe('F-16C vs NASA TP-1538 wind-tunnel data', () => {
  it('lift coefficient at 20° AoA is NASA\'s 1.38, ±5%', () => {
    within(liftCoefficient(f16, 20 * DEG_TO_RAD, 0), nasaCl(20), 0.05);
  });

  // The model's lift is a straight line to a 28° stall (CL 1.91); NASA's curve bends over
  // above 20° (1.56 at 25°), recovers (1.82 at 30°) and peaks near 35° (CX 0.16050, CZ
  // −2.20000: ~1.89). Not a smooth bend: the fix (0066) has to match 30° too.
  it.fails('KNOWN GAP (0066): lift coefficient at 25° AoA is NASA\'s 1.56, ±5% (model: 1.72)', () => {
    within(liftCoefficient(f16, 25 * DEG_TO_RAD, 0), nasaCl(25), 0.05);
  });

  // The model stalls at 28° on its steeper line, so its power-off 1-g stall comes ~12 kt
  // below that speed (and its stall warning, stall + 5 kt, ~7 kt below).
  it.fails('KNOWN GAP (0066): power-off 1-g stall at 12 t is the ~129 KEAS that TP-1538\'s CL gives at the 25° AoA limit, ±5% (model: 117)', () => {
    within(stallSpeedKts(f16, 0), vAtAoaLimitKts(), 0.05);
  });
});

describe('F-16C capability bound (not a performance claim)', () => {
  // USAF: "Mach 2 at altitude", ceiling "above 50,000 feet". The thresholds are ticket
  // 0053's, well inside those: a clean, full-afterburner run at 30,000 ft must pass Mach 1.2
  // and zoom past 40,000 ft with the numbers finite, below the model's own stall AoA and
  // above its own stall speed. The model has no wave drag, so how fast it gets there says
  // nothing.
  it('accelerates past Mach 1.2 at 30,000 ft and zooms past 40,000 ft without NaN or stall', () => {
    const alt0 = 30000 / M_TO_FT;
    const b = makeBody(f16, { kts: 325, altM: alt0, throttle: 1, gearDown: false });
    let zoom = false, maxMach = 0, maxAoa = 0, minIas = Infinity, finite = true;
    fly(b, f16, 300, (x) => {
      const { pitchDeg, bankRightDeg } = attitude(x);
      if (!zoom) x.pitchCmd = Math.max(-5, Math.min(15, (alt0 - x.pos.y) * 0.01 - vsFpm(x) * 0.0005 + 2));
      else x.pitchCmd = 30;
      x.elevInput = elevatorForPitch(x.pitchCmd, pitchDeg, x.angVel.x);
      x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z);
      if (x.t > 0) {
        finite &&= [x.pos.y, x.vel.x, x.vel.y, x.vel.z, x.quat.w, x.mach, x.aoaDeg].every(Number.isFinite);
        maxMach = Math.max(maxMach, x.mach);
        maxAoa = Math.max(maxAoa, Math.abs(x.aoaDeg));
        minIas = Math.min(minIas, x.iasKts);
      }
      if (x.mach >= 1.2) zoom = true;
    }, (x) => zoom && x.pos.y * M_TO_FT >= 40000);
    expect(finite).toBe(true);
    expect(maxMach).toBeGreaterThanOrEqual(1.2);
    expect(b.pos.y * M_TO_FT).toBeGreaterThanOrEqual(40000);
    expect(maxAoa).toBeLessThan(stallAoaDeg(f16, 0));
    expect(minIas).toBeGreaterThan(stallSpeedKts(f16, 0));
  });
});

// Ticket 0118: what a full pull does. USAF fact sheet (the copy above): "With a full load of
// internal fuel, the F-16 can withstand up to nine G's" (the spec's 12 t is empty + internal
// fuel, the card above), and the fly-by-wire flight control system holds the airplane to it;
// TP-1538 p. 12: the AoA limiter holds α "at or below 25°". So stick full back, wings level, at
// 15,000 ft: fast, the pull is a hard 9 g and no more (7.5-9.5 g: ~9 g held, a transient to
// 9.5); slow, the wing runs out first and the AoA limit holds α at 25° (well under 9 g). The
// seat's load factor is loadFactorMeter's (harness.js). The model's indicated speed is EAS:
// the ticket's 450 KCAS is 434 KEAS at 15,000 ft, ISA (Mach 0.87).
const fullPull = (kts) => {
  const b = makeBody(f16, { kts, altM: 15000 / M_TO_FT, throttle: 1, gearDown: false });
  const meter = loadFactorMeter();
  meter(b);
  let peakG = 0, maxAoa = 0;
  fly(b, f16, 5, (x) => {
    x.elevInput = -1; // elevator + = nose down: full back stick
    x.aileronInput = aileronForBank(0, attitude(x).bankRightDeg, -x.angVel.z);
  }, (x) => {
    peakG = Math.max(peakG, meter(x));
    maxAoa = Math.max(maxAoa, x.aoaDeg);
    return false;
  });
  return { peakG, maxAoa };
};

describe('F-16C full pull vs the 9 g limit (USAF) and the 25° AoA limit (TP-1538)', () => {
  it('the load factor meter reads 1 g in trimmed level flight (450 kt, 15,000 ft), ±2%', () => {
    const b = makeBody(f16, { kts: 450, altM: 15000 / M_TO_FT, throttle: 0.5, gearDown: false });
    const meter = loadFactorMeter();
    meter(b);
    let sum = 0, n = 0;
    fly(b, f16, 0.5, null, (x) => { sum += meter(x); n++; return false; });
    within(sum / n, 1, 0.02);
  });

  it('a full pull at 450 KCAS (434 KEAS), 15,000 ft is a hard pull: at least 7.5 g within 5 s', () => {
    expect(fullPull(434).peakG).toBeGreaterThanOrEqual(7.5);
  });

  // The model has no g limiter: full back stick is full stabilator whatever the speed, so the
  // pull overshoots to ~13 g by 1 s and α then runs through the stall until it pegs at 90° (the
  // nose goes over the top). Part of the overshoot is the wing (0066: CL above TP-1538's at 25°,
  // no Mach term); the fix is a load-factor and AoA command law on spec.pitchFbw (0121).
  it.fails('KNOWN GAP (0121): the same pull stays at or under 9.5 g (the 9 g limit and a transient; model: ~13 g)', () => {
    expect(fullPull(434).peakG).toBeLessThanOrEqual(9.5);
  });

  // Slow, the same pull should stop at the AoA limit: α ≤ 25° (a 1° transient allowed), and the
  // load factor stays well under 9 g. The model does stay under 9 g (~1.7 g; at 150 kt the dynamic
  // pressure allows no more), but α runs past the 28° stall and pegs at 90° (0121).
  it.fails('KNOWN GAP (0121): a full pull at 150 kt, 15,000 ft is AoA-limited: α ≤ 26° and under 9 g (model: α 90°)', () => {
    const { peakG, maxAoa } = fullPull(150);
    expect(maxAoa).toBeLessThanOrEqual(26);
    expect(peakG).toBeLessThan(9);
  });
});
