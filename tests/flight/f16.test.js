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
//  - climb rate, turn rate, takeoff and landing distances, approach speeds: all in the
//    restricted T.O.; the game's vrKts 155 and vrefKts 148 are uncited. (Roll rate is the
//    exception: TP-1538 App. A gives the roll-rate command's 308°/s limit, carded below, 0153.)
//  - top speed: USAF gives "Mach 2 at altitude". The model has supersonic wave drag (0133), but
//    its afterburner thrust keeps growing with Mach, so the Mach 2 card below is a KNOWN GAP
//    (0143) and the zoom card is a capability bound only.
//  - thrust lapse: TP-1538 Table VI tabulates the 1979 F100-PW-100, not the F110/F100-229
//    class engine the spec models, so its lapse is not this engine's. (For the record, at
//    max thrust the model has little of the table's ram rise with Mach: Tmax at sea level is
//    28,886 lbf at M 1.0 vs 21,420 at M 0.2 there, 1.35 ×; 1.05 × in the model.)
//  - the flight-control system: TP-1538 App. A's g and AoA limiter (Fig. 63) is modelled (0121) and
//    carded with 0118's full pulls below, and its negative g limit (Fig. 62(b)) with the pushes
//    (0138); its gains and filters are not (only the limits' shape). It has no negative-AoA limit.
//  - induced drag: aspectRatio 3.2 is the bare 31 ft wing (9.449² / 27.87); the span card
//    checks the USAF span, which (we infer) includes the wingtip missile rails.
//
// A card the model does not yet meet is a KNOWN GAP: `it.fails` with its ticket, never a
// looser tolerance. The fixing PR promotes it to `it`.
import { describe, it, expect } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { M_TO_FT, DEG_TO_RAD, RAD_TO_DEG, KTS_TO_MPS } from '../../src/constants.js';
import { fbwPushLimit } from '../../src/fbw.js';
import { liftCoefficient, stallAoaDeg, stallSpeedKts } from '../../src/aero.js';
import { elevatorForPitch, aileronForBank } from '../../src/autopilot.js';
import { makeBody, fly, attitude, vsFpm, loadFactorMeter, steadyRoll } from './harness.js';
import { checkLevelTurn } from './turnCard.js';
import { checkStallInTurn } from './stallTurnCard.js';

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
  // above its own stall speed. How fast it gets there says nothing (the engine's supersonic
  // thrust is the 0143 gap).
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

// Ticket 0133: the USAF fact sheet lists "Mach 2 at altitude". Clean, full afterburner, held
// level at 40,000 ft from 250 KEAS (Mach 0.88, so it must push through the drag peak near Mach
// 1.1), the speed it settles to should be the Mach 2 class (1.8-2.1; open data gives no tighter
// band), and settle means settle: under 0.02 Mach gained over the last 30 s of 300. 0133 gave the
// jet its wave drag (supersonic.js, Raymer's Sears-Haack correlation): with none it ran away
// (Mach 5.7 at 240 s from 400 KEAS); now it is ~2.27 at 300 s, still gaining ~0.003 Mach/s, and
// settles only near Mach 3.2 after ~30 min. Still a KNOWN GAP, now for the engine: its afterburner
// thrust grows with M² (engine.js, machLapse 0.3/0.3, uncited past Mach 1, see the header), so
// thrust over q·S is ~0.046 at Mach 2 against a total CD of ~0.037. A real F110 or F100 runs out of thrust there (compressor inlet temperature, inlet
// recovery): ticket 0143, whose PR promotes this card to `it`.
const levelAt40k = (seconds, onStep) => {
  const alt0 = 40000 / M_TO_FT;
  const b = makeBody(f16, { kts: 250, altM: alt0, throttle: 1, gearDown: false });
  fly(b, f16, seconds, (x) => {
    const { pitchDeg, bankRightDeg } = attitude(x);
    const cmd = Math.max(-5, Math.min(10, (alt0 - x.pos.y) * 0.01 - vsFpm(x) * 0.0005 + 2));
    x.elevInput = elevatorForPitch(cmd, pitchDeg, x.angVel.x);
    x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z);
  }, (x) => { onStep(x, alt0); return false; });
  return b;
};
describe('F-16C top speed vs the USAF fact sheet ("Mach 2 at altitude")', () => {
  it.fails('KNOWN GAP (0143): full afterburner, level at 40,000 ft settles at Mach 1.8-2.1 (model: ~2.27 at 300 s and still gaining ~0.1 Mach per 30 s)', () => {
    let mach270 = null, maxDevFt = 0;
    const b = levelAt40k(300, (x, alt0) => {
      if (mach270 == null && x.t >= 270) mach270 = x.mach;
      if (x.t > 60) maxDevFt = Math.max(maxDevFt, Math.abs(x.pos.y - alt0) * M_TO_FT);
    });
    expect(maxDevFt).toBeLessThan(2000); // level: the hold sits ~1,000 ft high, inside this
    expect(b.mach - mach270).toBeLessThan(0.02);
    expect(b.mach).toBeGreaterThanOrEqual(1.8);
    expect(b.mach).toBeLessThanOrEqual(2.1);
  });

  // What 0133 does pass, a regression guard (not a performance claim; the band above is the
  // claim): the same run crosses Mach 1.8 and stays under Mach 2.5 at 300 s, finite throughout
  // (with no wave drag it ran away: Mach 5.7 by 240 s from 400 KEAS).
  it('the same run passes Mach 1.8 and stays under Mach 2.5 at 300 s (the wave drag slows it)', () => {
    let finite = true, maxDevFt = 0;
    const b = levelAt40k(300, (x, alt0) => {
      finite &&= [x.pos.y, x.vel.x, x.vel.y, x.vel.z, x.quat.w, x.mach, x.aoaDeg].every(Number.isFinite);
      if (x.t > 60) maxDevFt = Math.max(maxDevFt, Math.abs(x.pos.y - alt0) * M_TO_FT);
    });
    expect(finite).toBe(true);
    expect(maxDevFt).toBeLessThan(2000);
    expect(b.mach).toBeGreaterThan(1.8);
    expect(b.mach).toBeLessThan(2.5);
  });

  // Held for half an hour it does not run away (the panel's catch: Raymer's factor alone falls on
  // with Mach, and the run went past Mach 45 by 40 min; the 0.8 floor holds it). It settles near
  // Mach 3.2: under 0.02 Mach gained over the last 300 s of 1800, and under Mach 3.4.
  it('held 30 min it settles (near Mach 3.2, the 0143 gap) instead of running away', () => {
    let mach1500 = null, maxDevFt = 0;
    const b = levelAt40k(1800, (x, alt0) => {
      if (mach1500 == null && x.t >= 1500) mach1500 = x.mach;
      if (x.t > 60) maxDevFt = Math.max(maxDevFt, Math.abs(x.pos.y - alt0) * M_TO_FT);
    });
    expect(Number.isFinite(b.mach)).toBe(true);
    expect(maxDevFt).toBeLessThan(2000);
    expect(b.mach - mach1500).toBeLessThan(0.02);
    expect(b.mach).toBeLessThan(3.4);
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
const fullPull = (kts, seconds = 5, throttle = 1) => {
  const b = makeBody(f16, { kts, altM: 15000 / M_TO_FT, throttle, gearDown: false });
  const meter = loadFactorMeter();
  meter(b);
  let peakG = 0, maxAoa = 0;
  fly(b, f16, seconds, (x) => {
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

  // The g and AoA limiter (0121, NASA TP-1538 App. A and Fig. 63: full back stick commands 9 g,
  // less as α passes 15°, 1 g at ~25°; src/fbw.js fbwLoadLimit). Before it, full stabilator
  // pulled ~13 g by 1 s and α pegged at 90°.
  it('the same pull stays at or under 9.5 g (the 9 g limit and a transient)', () => {
    expect(fullPull(434).peakG).toBeLessThanOrEqual(9.5);
  });

  // Slow, the same pull stops at the AoA limit: α ≤ 25° (a 1° transient allowed), and the load
  // factor stays well under 9 g (~1.7 g: at 150 kt the dynamic pressure allows no more).
  // Held 25 s, as the jet slows (the first 5 s alone missed a climb to α ~38° on the final: the
  // limiter's path rate read gravity on the body axis, cos θ, not across the path, cos γ).
  it('a full pull at 150 kt, 15,000 ft is AoA-limited: α ≤ 26° and under 9 g, held 25 s', () => {
    const { peakG, maxAoa } = fullPull(150, 25);
    expect(maxAoa).toBeLessThanOrEqual(26);
    expect(peakG).toBeLessThan(9);
  });

  // Slow and with little power the limit is Fig. 63's 1-g end (~25°) with a transient: α ≤ 27°,
  // below the model's 28° stall, held 25 s at throttle 0.3 (before: 28.7°; at idle 32.8°).
  it('a full pull at 150 kt, 15,000 ft, throttle 0.3, held 25 s stays under the stall: α ≤ 27°', () => {
    expect(fullPull(150, 25, 0.3).maxAoa).toBeLessThanOrEqual(27);
  });

  // Held, fast enough that the wing is not what stops it (500 KEAS, 15,000 ft: 9 g at α ~13°, under
  // Fig. 63's 15° knee), full back stick settles near the 9 g command (8-9.5 g from 2 to 4 s), not
  // only peaks there.
  it('a held full pull at 500 KEAS, 15,000 ft settles at 8-9.5 g', () => {
    const b = makeBody(f16, { kts: 500, altM: 15000 / M_TO_FT, throttle: 1, gearDown: false });
    const meter = loadFactorMeter();
    meter(b);
    let lo = Infinity, hi = 0;
    fly(b, f16, 4, (x) => {
      x.elevInput = -1;
      x.aileronInput = aileronForBank(0, attitude(x).bankRightDeg, -x.angVel.z);
    }, (x) => {
      const n = meter(x);
      if (x.t >= 2) { lo = Math.min(lo, n); hi = Math.max(hi, n); }
      return false;
    });
    expect(lo).toBeGreaterThanOrEqual(8);
    expect(hi).toBeLessThanOrEqual(9.5);
  });

  // The stick commands load factor (TP-1538 App. A), so half back stick is a moderate pull, not
  // the limit. The gradient is the game's (1 g + 8 g × the pull, 5 g at half stick; TP-1538 gives
  // none), so the card asks only for a moderate pull: 4-5.5 g.
  it('half back stick at 500 KEAS, 15,000 ft is a moderate pull: 4-5.5 g held, well under the limit', () => {
    const b = makeBody(f16, { kts: 500, altM: 15000 / M_TO_FT, throttle: 1, gearDown: false });
    const meter = loadFactorMeter();
    meter(b);
    let sum = 0, n = 0;
    fly(b, f16, 4, (x) => {
      x.elevInput = -0.5;
      x.aileronInput = aileronForBank(0, attitude(x).bankRightDeg, -x.angVel.z);
    }, (x) => {
      const g = meter(x);
      if (x.t >= 2) { sum += g; n++; }
      return false;
    });
    expect(sum / n).toBeGreaterThanOrEqual(4);
    expect(sum / n).toBeLessThanOrEqual(5.5);
  });

  // Let go from a 5 g pull: the fly-by-wire trims itself (0090: a released stick holds the nose
  // where it is), so the pull unloads and the seat returns towards 1 g within 6 s (≤ 1.3 g).
  it('a stick released from a 5 g pull at 450 KEAS returns towards 1 g (≤ 1.3 g within 6 s)', () => {
    const b = makeBody(f16, { kts: 450, altM: 15000 / M_TO_FT, throttle: 1, gearDown: false });
    const meter = loadFactorMeter();
    meter(b);
    let released = null, last = 0;
    fly(b, f16, 10, (x) => {
      x.elevInput = released === null ? -0.6 : 0;
      x.aileronInput = aileronForBank(0, attitude(x).bankRightDeg, -x.angVel.z);
    }, (x) => {
      last = meter(x);
      if (released === null && last >= 5) released = x.t;
      return released !== null && x.t >= released + 6;
    });
    expect(released).not.toBeNull();
    expect(last).toBeLessThanOrEqual(1.3);
    expect(last).toBeGreaterThan(0.7);
  });
});

// Ticket 0138: what a push does. TP-1538 Fig. 62(b) (App. A's pitch CAS): the commanded increment
// on 1 g has a lower limit scheduled with dynamic pressure, −1 g up to ~1.55 kN/m² and −4 g from
// ~8.75 kN/m², so full forward stick is 0 g slow and −3 g at combat speeds (src/fbw.js fbwPushLimit).
// TP-1538 has no negative-AoA limit (its α signal is clipped at −5°, but nothing holds α there), so
// the AoA bounds below are not a source's: they say the nose does not go over (before the floor,
// full forward stick at 434 KEAS pulled −11.5 g and α ran to −90°, the airplane tumbling; at
// 150 kt, upright or inverted, the same). The floor is checked at every sample's own q̄: a slow
// push dives, gains speed, and the floor falls with it (150 → ~225 KEAS in 6 s). `stick` is
// elevInput (+ = nose down); `inverted` starts rolled 180° and holds no aileron.
const fullPush = (kts, { seconds = 5, stick = 1, inverted = false } = {}) => {
  const b = makeBody(f16, { kts, altM: 15000 / M_TO_FT, throttle: 1, gearDown: false });
  if (inverted) b.quat.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI));
  const meter = loadFactorMeter();
  meter(b);
  let minG = Infinity, minAoa = Infinity, margin = Infinity, lateLo = Infinity, lateHi = -Infinity;
  fly(b, f16, seconds, (x) => {
    x.elevInput = stick;
    x.aileronInput = inverted ? 0 : aileronForBank(0, attitude(x).bankRightDeg, -x.angVel.z);
  }, (x) => {
    const n = meter(x);
    const qDyn = 0.5 * 1.225 * (x.iasKts * KTS_TO_MPS) ** 2; // the model's indicated speed is EAS
    minG = Math.min(minG, n);
    minAoa = Math.min(minAoa, x.aoaDeg);
    margin = Math.min(margin, n - fbwPushLimit(qDyn));
    if (x.t >= 2) { lateLo = Math.min(lateLo, n); lateHi = Math.max(lateHi, n); }
    return false;
  });
  return { minG, minAoa, margin, lateLo, lateHi };
};

describe('F-16C full push vs the negative g limit (TP-1538 Fig. 62(b); 0138)', () => {
  it('full forward stick at 434 KEAS, 15,000 ft is a hard push: below −2.5 g within 5 s', () => {
    expect(fullPush(434).minG).toBeLessThanOrEqual(-2.5);
  });

  it('the same push stays at or above −3.3 g (the −3 g limit and a transient), held at −2.7 to −3.3 g from 2 s', () => {
    const { minG, lateLo, lateHi } = fullPush(434);
    expect(minG).toBeGreaterThanOrEqual(-3.3);
    expect(lateLo).toBeGreaterThanOrEqual(-3.3);
    expect(lateHi).toBeLessThanOrEqual(-2.7);
  });

  // −3 g at ~30 kN/m² needs α ~9° below the trim α by the spec's lift slope (4 g / (3.6 per rad ×
  // q̄S/W)): the nose stops there, a 2° transient allowed, not at −90°.
  it('the same push keeps α above −11°: the nose does not go over', () => {
    expect(fullPush(434).minAoa).toBeGreaterThanOrEqual(-11);
  });

  // Half forward stick is half the way to the floor (1 g + (−3 − 1) × 0.5 = −1 g; the gradient is the
  // game's, as for the pull: TP-1538 Fig. 62(e) is a force gradient the side-stick's travel lacks).
  it('half forward stick at 434 KEAS is a moderate push: −0.7 to −1.3 g held', () => {
    const { lateLo, lateHi } = fullPush(434, { stick: 0.5 });
    expect(lateLo).toBeGreaterThanOrEqual(-1.3);
    expect(lateHi).toBeLessThanOrEqual(-0.7);
  });

  for (const inverted of [false, true]) {
    const how = inverted ? 'inverted' : 'upright';
    it(`a full push at 150 kt, 15,000 ft, ${how}, held 6 s: never more than 0.3 g past the floor at its q̄, α above −30°`, () => {
      const { margin, minAoa } = fullPush(150, { seconds: 6, inverted });
      expect(margin).toBeGreaterThanOrEqual(-0.3);
      expect(minAoa).toBeGreaterThanOrEqual(-30);
    });
  }

  // The sloped part of Fig. 62(b), read off the figure (not fbwPushLimit, so a moved breakpoint turns it
  // red; physics panel): 200 KEAS at 15,000 ft is q̄ ≈ 6.5 kN/m², where the line reads ≈ −3.05 g
  // incremental, −2.05 g. Full forward stick reaches it within 2 s, before the dive builds speed: the
  // lowest load factor by then is −2.05 ± 0.3 g.
  it('full forward stick at 200 KEAS, 15,000 ft (q̄ ≈ 6.5 kN/m², the sloped part) bottoms at −2.05 ± 0.3 g within 2 s', () => {
    expect(fullPush(200, { seconds: 2 }).minG).toBeGreaterThanOrEqual(-2.35);
    expect(fullPush(200, { seconds: 2 }).minG).toBeLessThanOrEqual(-1.75);
  });

  // A stick a hair forward of centre is a hair of push, not a pull (device panel: the push gradient
  // started at +1 g, so inverted at ~−0.9 g, elevInput 0.005 pulled the jet to +1 g towards the ground;
  // main.js eases the stick back to centre, so it sits there after every push). Inverted at 350 kt,
  // 15,000 ft, 3 s: 0.005 and 0.02 of push end within 0.2 g of the released stick, and not above it.
  it('inverted at 350 kt, a stick just forward of centre flies like a released one (within 0.2 g, no pull)', () => {
    const endG = (stick) => {
      const b = makeBody(f16, { kts: 350, altM: 15000 / M_TO_FT, throttle: 0.7, gearDown: false });
      b.quat.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI));
      const meter = loadFactorMeter();
      meter(b);
      let n = 0;
      fly(b, f16, 3, (x) => { x.elevInput = stick; x.aileronInput = 0; }, (x) => { n = meter(x); return false; });
      return n;
    };
    const released = endG(0);
    for (const stick of [0.005, 0.02]) {
      const n = endG(stick);
      expect(Math.abs(n - released)).toBeLessThan(0.2);
      expect(n).toBeLessThanOrEqual(released + 0.05);
    }
  });

  // Let go from a push: like a released pull (0090), the nose holds where it is and the seat
  // returns towards 1 g within 6 s.
  it('a stick released from a −2 g push at 450 KEAS returns towards 1 g (0.7-1.3 g within 6 s)', () => {
    const b = makeBody(f16, { kts: 450, altM: 15000 / M_TO_FT, throttle: 1, gearDown: false });
    const meter = loadFactorMeter();
    meter(b);
    let released = null, last = 0;
    fly(b, f16, 10, (x) => {
      x.elevInput = released === null ? 0.8 : 0;
      x.aileronInput = aileronForBank(0, attitude(x).bankRightDeg, -x.angVel.z);
    }, (x) => {
      last = meter(x);
      if (released === null && last <= -2) released = x.t;
      return released !== null && x.t >= released + 6;
    });
    expect(released).not.toBeNull();
    expect(last).toBeLessThanOrEqual(1.3);
    expect(last).toBeGreaterThan(0.7);
  });
});

// Level turns (ticket 0152): FAA-H-8083-25B ch. 5, rate = 1091·tan(bank)/V[kt TAS] °/s and load
// factor 1/cos(bank) in a level coordinated turn. Kinematics, so it needs none of the restricted
// T.O.'s turn data (which is why the header lists no turn-performance card: this is not one, it
// checks the model obeys the turn's physics, not how hard the jet can turn). Flown by harness.js
// levelTurn (pitch for altitude, throttle for speed, rudder for the ball) through the fly-by-wire
// (pitchFbw, the 0121 limiter); flightModel.js only, JSBSim has no F-16. Bands are the ticket's.
describe('F-16C level turns vs the FAA handbook (FAA-H-8083-25B ch. 5; 0152)', () => {
  for (const bank of [30, 45]) {
    it(`350 KIAS, 10,000 ft, ${bank}° bank: turns at 1091·tan(bank)/TAS °/s (±8%) and reads 1/cos(bank) g (±3%)`, () => {
      checkLevelTurn('f16', f16, bank, 350, { altM: 10000 / M_TO_FT });
    });
  }
});

// Accelerated stall (ticket 0159): stall speed × √(load factor), FAA-H-8083-3C ch. 5 "Load Factor
// and Stalling Speed" (stallTurnCard.js says what each check catches). The F-16 has no stall a
// pilot can reach: the limiter (0121, TP-1538 Fig. 63) holds α near 25°, under the model's 28°
// stall, and in a turn it binds earlier (2 g at ~24.4°, less with its α-rate lead: flown to 24°,
// the 60° turn sagged to 1.67 g and broke 9% under the book). So the card measures the same law
// where the limiter lets the wing work: the speed at which a level turn needs 20° of α, just under
// Fig. 63's 20.4° knee, where the limiter allows 7.4 g (and where TP-1538's CL card above sits).
// Clean, 15,000 ft. The afterburner lifts too (T·sin α); the lift-line check takes it out. The
// book check (1/cos of the body bank) reads ~2% low at 60°: FAA's bank is the lift vector's, and
// at α 20° a 60° body bank is a ~58.5° wind-axis bank (stallTurnCard.js); the √n check is exact.
describe('F-16C accelerated stall vs the FAA handbook (FAA-H-8083-3C ch. 5; 0159)', () => {
  for (const bank of [45, 60]) {
    it(`clean, 15,000 ft: reaches 20° α in a level ${bank}° turn at the 1-g speed × √(1/cos ${bank}°) (±8%; √n law ±3%, lift line ±1%)`, () => {
      checkStallInTurn('f16 clean', f16, bank, 20, { altM: 15000 / M_TO_FT });
    });
  }
});

// Roll rate (ticket 0153). TP-1538 App. A (p. 34, Lateral; also p. 18): "The system incorporated a
// roll-rate command feature whereby the pilot commanded roll rates up to a maximum 308°/sec through
// the force-sensing control stick" (ailerons ±21.5° with the differential tail at 4:1, below α 29°;
// control system B's q reduction acts only below 10,500 N/m², ~250 KIAS). That is the flight control
// system NASA modelled for the 1979 study, not a measured rate of the jet. The bare airframe can make
// it at this card's 350 KIAS / 10,000 ft (σ 0.738; ~407 KTAS by tasFromIas, ~1.4% less with
// compressibility; Mach ~0.63, just past the low-speed data's 0.6; trim α ~1°): TP-1538 Table III's
// roll damping Clp −0.43 near there and its aileron increment ΔCl,δa=20° 0.051, as transcribed and
// normalised per 20° of aileron in Stevens & Lewis, Aircraft Control and Simulation, App. A (the
// PDF's table scans don't OCR; JSBSim f16.xml carries the same table but applies it per radian),
// scaled to the 21.5° limit (0.055), give p = ΔCl/(−Clp)·2V/b = 0.055 / 0.43 × 2 × 207 / 9.144
// (Table I's 30 ft span) ≈ 5.7 rad/s, ~330°/s, with the aileron alone. So full lateral stick is the
// command's 308°/s. The card (harness.js steadyRoll) enters at 350 KIAS from 170° of left bank so a
// roll-rate command's realistic 0.3-0.5 s roll-in has settled by the ±30° window (the physics panel:
// from 75° a τ 0.4 s roll that settles at 308 reads 227); flightModel.js only (JSBSim has no F-16 here).
describe('F-16C full-stick roll rate vs NASA TP-1538 (tickets 0153, 0156)', () => {
  const KTS = 350, ALT_M = 10000 / M_TO_FT;
  // ±40° of window: at 308°/s that is ~0.26 s, over 30 samples at the harness's 1/120 s.
  const roll = () => steadyRoll(f16, KTS, ALT_M, { fromDeg: 170, windowDeg: 40 });

  it(`the roll card's pilot flies the F-16's roll: settled through level, ball centred (|β| < 3°)`, () => {
    const r = roll();
    console.log(`[f16] full stick entered at ${KTS} KIAS, 10,000 ft: ${r.rateDegS.toFixed(1)}°/s (in ${r.pEntry.toFixed(1)}, out ${r.pExit.toFixed(1)}) at ${r.iasKts.toFixed(0)} KIAS (TP-1538's command 308°/s), β ≤ ${r.betaMaxDeg.toFixed(1)}°, ${r.samples} samples`);
    expect(r.samples).toBeGreaterThan(30);
    expect(r.betaMaxDeg).toBeLessThan(3);
    expect(Math.abs(r.pExit - r.pEntry) / r.rateDegS).toBeLessThan(0.03);
  });

  // Closed by 0156 (was a KNOWN GAP: 30.9°/s, a tenth of the command). aircraft.js f16.rollCmdRad is
  // the command's 308°/s; the airframe (rollPerTas, TP-1538's derivatives) could make ~330°/s here, so
  // the command is what flies. One-sided around its ceiling: never above it (+2% for the averaging),
  // and a realistic roll-in still reads within ~15%.
  it(`full lateral stick entered at ${KTS} KIAS, 10,000 ft rolls at TP-1538's 308°/s command (260-315°/s)`, () => {
    const r = roll().rateDegS;
    expect(r).toBeGreaterThanOrEqual(260);
    expect(r).toBeLessThanOrEqual(315);
  });

  // On approach (150 KIAS, sea level, gear down) the airframe can't make the command: TP-1538's roll
  // power p·b/2V 0.128 (aircraft.js) on the 9.144 m reference span gives ~2·0.128·V/b. The card checks
  // the rate is that, within ±25%, at the window's TAS (the roll dives it a little faster), and
  // markedly lower than the cruise card's: under 60% of the command. A ±30° window: rolling at
  // ~130°/s at α 6-10° the card's pilot runs out of rudder by the far edge (no aileron-rudder
  // interconnect is modelled), and β passes 3° near +40°.
  it('full lateral stick on approach (150 KIAS, gear down) rolls at the airframe\'s TP-1538 roll power, well under the command', () => {
    const r = steadyRoll(f16, 150, 300, { fromDeg: 170, windowDeg: 30, gearDown: true });
    const ref = 0.055 / 0.43 * 2 * r.tasKts * KTS_TO_MPS / 9.144 * RAD_TO_DEG;
    console.log(`[f16] full stick entered at 150 KIAS, gear down: ${r.rateDegS.toFixed(1)}°/s at ${r.tasKts.toFixed(0)} KTAS (TP-1538 airframe ${ref.toFixed(0)}°/s), β ≤ ${r.betaWindowDeg.toFixed(1)}° in the window`);
    expect(r.samples).toBeGreaterThan(30);
    expect(r.betaWindowDeg).toBeLessThan(3);
    within(r.rateDegS, ref, 0.25);
    expect(r.rateDegS).toBeLessThan(0.6 * 308);
  });
});
