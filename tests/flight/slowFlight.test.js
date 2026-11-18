// Slow flight (ticket 0164) flown headless: the C172 through flightModel.js at the mission's 95 KIAS
// and ~5,000 ft MSL (4,500 ft over Grapevine Lake), slowed to the drill's band (the stall warning + 5 kt,
// +10/-0: FAA-S-ACS-6C Area VII Task A, S5) and held there for 45 s. A test pilot sets the speed with the
// nose and the height with the power (near the bottom of the model's power curve, ~70 KIAS, the nose is the quicker lever on speed) and
// the ball with the rudder. The card checks the drill against the airplane: a pilot who flies the
// standard grades A or better without the horn, one who flies at the horn is capped at C, Kid flies it
// hands off, and Learner, whose angle-of-attack protection (assists.js, stall α − 4°) bottoms out under the
// band, can reach the horn: the drill adds no floor of its own.
import { describe, it, expect } from 'vitest';
import { Vector3, Quaternion } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { FT_TO_M, GRAVITY, KTS_TO_MPS, DEG_TO_RAD } from '../../src/constants.js';
import { elevatorForPitch, aileronForBank, autothrottleCommand } from '../../src/autopilot.js';
import { stallAoaDeg, stallWarningKts } from '../../src/aero.js';
import { createSlowFlight, slowSimStep, gradeSlowFlight, kidGuide, slowKidKts, SLOW_TARGET_OVER_WARN_KTS, SLOW_KTS_OVER, SLOW_GUST_SHARE, SLOW_IAS_TAU_S, slowGustAoaDeg } from '../../src/slowFlight.js';
import { trimThrottle, dihedralAileron, rollHoldScale } from '../../src/flightModel.js';
import { airAt } from '../../src/atmosphere.js';
import { assistConfig, createAssistState, shapeControls, slewRudder } from '../../src/assists.js';
import { gustFactor } from '../../src/weather.js';
import { makeBody, fly, attitude, turbulentAir } from './harness.js';

const c172 = AIRCRAFT_DATABASE.c172;
const KTS = 95;
const ALT_FT = 5000;
const WARN = stallWarningKts(c172, 0);
const TARGET = WARN + SLOW_TARGET_OVER_WARN_KTS;

// holdKts: the speed the pilot slows to and holds (the band's middle unless asked otherwise).
// tail: a METAR wind from behind (kts, gust kts), the air the game's updateWind adds (weather.js gustFactor).
// wx: a METAR from behind (windKts, gustKts) flown as the game flies it: weather.js's gust cycle and turbulence.js's
// Dryden gusts (harness.js turbulentAir, the pilot's full share), seeded. holdKts then defaults to the drill's own band's middle.
// The start is the game's: 95 kt along the heading over the ground (main.js spawns in-air missions without the wind), so a
// tailwind starts it slower through the air.
function slowFlight({ holdKts = null, tail = null, wx = null, seed = 1 } = {}) {
  const midBand = holdKts === null && wx !== null;
  holdKts ??= TARGET + (tail ? SLOW_GUST_SHARE * (tail[1] - tail[0]) : 0) + SLOW_KTS_OVER / 2;
  const b = makeBody(c172, { kts: KTS, altM: ALT_FT * FT_TO_M, throttle: 0 });
  b.spec = c172;
  if (tail) b.wx = { windKts: tail[0], gustKts: tail[1] };
  const air = wx && turbulentAir(c172, b.wx = { windDirDeg: 180, ...wx }, { seed });
  b.throttle = b.engineN = trimThrottle(c172, KTS * KTS_TO_MPS, 0, 0, true, airAt(b.pos.y));
  const st = createSlowFlight();
  const alt0 = b.pos.y;
  const prevVel = b.vel.clone(), f = new Vector3(), inv = new Quaternion();
  let iasR = KTS, rudInt = 0, thrInt = b.throttle, ev = '', maxAoa = 0, minIas = Infinity, target = null, lastIas = null, trend = 0;
  const pilot = (x, dt) => {
    if (tail) x.windVec.set(0, 0, -gustFactor(x.t, tail[0], tail[1]) * KTS_TO_MPS); // heading north, the air blowing north
    if (air) air(x, dt);
    if (midBand && st.targetKts > 0) holdKts = st.targetKts + SLOW_KTS_OVER / 2;
    const { pitchDeg, bankRightDeg } = attitude(x);
    // The speed with the nose: back from 95 at 1 kt/s to the hold speed, damped by the speed trend.
    if (target === null) target = Math.min(KTS, x.iasKts); // from the speed it starts at (a tailwind spawn is slower through the air)
    target = Math.max(holdKts, target - dt);
    // In turbulence the pilot reads the airspeed through the eddies (AFH FAA-H-8083-3C ch. 4: hold the attitude, let the
    // airspeed wander), as the drill's own SLOW_IAS_TAU_S filter does; chasing each gust's IAS pumped the elevator to 20°/s.
    iasR = air ? iasR + (x.iasKts - iasR) * Math.min(1, dt / SLOW_IAS_TAU_S) : x.iasKts;
    if (lastIas !== null) trend += ((iasR - lastIas) / dt - trend) * Math.min(1, dt * 4);
    lastIas = iasR;
    const err = iasR - target;
    x.pitchTrim = (x.pitchTrim ?? x.pitchCmd) + err * 0.08 * dt;
    x.pitchCmd = Math.max(-10, Math.min(20, x.pitchTrim + err * 0.6 + trend * 2.5));
    x.elevInput = elevatorForPitch(x.pitchCmd, pitchDeg, x.angVel.x);
    // Wings level, holding the right aileron the prop's torque takes at this power (0194): on the heading.
    x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z) + (x.propAil ?? 0);
    // The height with the power.
    const altErr = (alt0 - x.pos.y), vs = x.vel.y;
    thrInt = Math.max(0, Math.min(1, thrInt + (altErr * 0.004 - vs * 0.01) * dt));
    x.throttle = Math.max(0, Math.min(1, thrInt + altErr * 0.01 - vs * 0.08));
    // The ball with the rudder (the slow airplane's P-factor at high power).
    f.subVectors(x.vel, prevVel).divideScalar(dt); f.y += GRAVITY; prevVel.copy(x.vel);
    const ball = f.applyQuaternion(inv.copy(x.quat).invert()).x / GRAVITY;
    rudInt = Math.max(-1, Math.min(1, rudInt - ball * 4 * dt));
    x.rudderInput = Math.max(-1, Math.min(1, rudInt - ball * 2));
  };
  fly(b, c172, 240, pilot, (x) => {
    maxAoa = Math.max(maxAoa, x.aoaDeg); minIas = Math.min(minIas, x.iasKts);
    ev = slowSimStep(st, x, 1 / 120, true);
    return ev === 'complete' || ev === 'failed';
  });
  return { st, grade: gradeSlowFlight(st), maxAoa, minIas, t: b.t, throttle: b.throttle };
}

const line = (tag, r) => console.log(`[c172 slow ${tag}] ${r.st.phase} in ${r.t.toFixed(0)} s: target ${r.st.targetKts.toFixed(1)} kt, alt ±${r.st.maxAltDevFt.toFixed(0)} ft, `
  + `hdg ±${r.st.maxHdgDev.toFixed(1)}°, in band ${(100 * r.st.inBandS / Math.max(1e-9, r.st.holdS)).toFixed(0)}% of ${r.st.holdS.toFixed(0)} s, horn ${r.st.warnS.toFixed(1)} s, `
  + `IAS min ${r.minIas.toFixed(1)}, α max ${r.maxAoa.toFixed(1)}°, throttle ${r.throttle.toFixed(2)} → ${r.grade.grade} ${r.grade.score}${r.grade.reason ? ` (${r.grade.reason})` : ''}`);

describe('C172 slow flight (0164, FAA-S-ACS-6C Area VII Task A)', () => {
  it('the band is the airplane\'s own: the clean C172\'s stall warning (58 KIAS) + 5 kt, +10/-0', () => {
    expect(WARN).toBeCloseTo(58, 0);
    expect(TARGET).toBeCloseTo(63, 0);
  });
  it('a pilot who flies the standard (in the band, ±100 ft, on the heading) grades A or better, without the horn', () => {
    const r = slowFlight();
    line('standard', r);
    expect(r.st.phase).toBe('complete');
    expect(r.st.okS).toBeGreaterThanOrEqual(45);
    expect(r.st.maxAltDevFt).toBeLessThanOrEqual(100);
    expect(r.st.maxHdgDev).toBeLessThanOrEqual(10);
    expect(r.st.warned).toBe(false);
    expect(r.minIas).toBeGreaterThan(WARN);
    expect(['S', 'A']).toContain(r.grade.grade);
    // Level at ~68 KIAS the wing sits well clear of its stall angle, and the power is well above a cruise idle.
    expect(r.maxAoa).toBeLessThan(stallAoaDeg(c172, 0) - 2);
  });
  it('a pilot who flies at the horn (1 kt under the warning) is capped at C', () => {
    const r = slowFlight({ holdKts: WARN - 1 });
    line('horn', r);
    expect(r.st.phase).toBe('complete');
    expect(r.st.warned).toBe(true);
    expect(['C', 'D']).toContain(r.grade.grade);
  });
  it('a gusty tailwind (15G25 from behind, DFW\'s southerly on the mission\'s heading): the band rises by half the gust; flown there, no stall', () => {
    const r = slowFlight({ tail: [15, 25] });
    line('tail 15G25', r);
    expect(r.st.targetKts).toBeCloseTo(TARGET + 5, 5);
    expect(r.st.phase).toBe('complete');
    expect(r.maxAoa).toBeLessThan(stallAoaDeg(c172, 0));
  });
  it('the same gusts flown at the calm-air band\'s middle: the wing\'s warning (α at the horn\'s 1 g angle) comes first, or a stall', () => {
    const r = slowFlight({ tail: [15, 25], holdKts: TARGET + SLOW_KTS_OVER / 2 });
    line('tail 15G25 low', r);
    // Each gust from behind drops the IAS and lifts α: the drill counts the wing's warning as the horn and the coach says it.
    expect(r.st.warnS).toBeGreaterThan(0);
    expect(['C', 'D']).toContain(r.grade.grade);
  });
});

// Kid and Learner through main.js applyAssists as it runs in the mission: assists.js shapeControls with
// slowFlight.js's guide, Kid's autothrottle on slowKidKts (main.js autoThrottle). pitchIn: Learner's stick.
function assisted(level, { pitchIn = () => 0, throttle = null, seconds = 240, wx = null, seed = 1 } = {}) {
  const b = makeBody(c172, { kts: KTS, altM: ALT_FT * FT_TO_M, throttle: 0 });
  b.spec = c172;
  // wx: the METAR from behind, flown at the level's share of the turbulence (main.js updateWind, 0199: no smooth-air exemption).
  const air = wx && turbulentAir(c172, b.wx = { windDirDeg: 180, ...wx }, { seed, level });
  b.throttle = b.engineN = trimThrottle(c172, KTS * KTS_TO_MPS, 0, 0, true, airAt(b.pos.y));
  b.apMaster = false;
  const cfg = assistConfig(level), ast = createAssistState(), st = createSlowFlight(), s = {}, out = {}, at = { trim: 0 };
  let prevIas = null, iasRate = 0, ev = '', maxAoa = 0, minIas = Infinity;
  fly(b, c172, seconds, (x, dt) => {
    if (air) air(x, dt);
    const { pitchDeg, bankRightDeg } = attitude(x);
    s.guideBankDeg = 0; s.guideGammaDeg = 0;
    kidGuide(st, s);
    Object.assign(s, {
      pitchIn: pitchIn(x), rollIn: 0, yawIn: 0, pitchDeg, bankRightDeg, pitchRateUp: x.angVel.x, rollRateRight: -x.angVel.z,
      rollScale: rollHoldScale(c172, (x.tasKts ?? 0) * KTS_TO_MPS), yawRateRight: -x.angVel.y, driftDeg: 0,
      aoaDeg: x.aoaDeg ?? 0, betaDeg: x.betaDeg ?? 0, dihedralAil: dihedralAileron(c172, (x.betaDeg ?? 0) * DEG_TO_RAD), propAil: x.propAil ?? 0,
      stallAoaDeg: stallAoaDeg(c172, 0) - (level === 'pilot' ? 0 : slowGustAoaDeg(x, 0.5)), tailstrikeDeg: 15, // main.js applyAssists (0199) onGround: false, noseWheelDown: false, wheelHeightM: 1400,
      airspeedMps: (x.tasKts ?? 0) * KTS_TO_MPS, vsMps: x.vel.y, bankMaxDeg: 0,
    });
    shapeControls(cfg, ast, s, dt, out);
    x.elevInput = out.elev; x.aileronInput = out.ail; x.rudderInput = slewRudder(x.rudderInput, out.rud, dt);
    if (cfg.autoThrottle) {
      if (prevIas !== null) iasRate += ((x.iasKts - prevIas) / dt - iasRate) * Math.min(1, dt / 0.5);
      prevIas = x.iasKts;
      const gamma = Math.atan2(x.vel.y, Math.max(20, Math.hypot(x.vel.x, x.vel.z))) * 180 / Math.PI;
      const tgt = slowKidKts(st) || KTS;
      x.throttle = autothrottleCommand(trimThrottle(c172, tgt * KTS_TO_MPS, 0, gamma, true, airAt(x.pos.y)), at, x.iasKts, tgt, iasRate, dt);
    } else if (throttle !== null) x.throttle = throttle;
  }, (x) => {
    maxAoa = Math.max(maxAoa, x.aoaDeg); minIas = Math.min(minIas, x.iasKts);
    ev = slowSimStep(st, x, 1 / 120, true);
    if (ev === 'holding') at.trim = 0; // main.js checkSlowFlight: the slow-down's integral is not the hold's
    return ev === 'complete' || ev === 'failed';
  });
  return { st, grade: gradeSlowFlight(st, level === 'kid'), maxAoa, minIas, t: b.t, throttle: b.throttle };
}

// 0199: the band's middle in the METAR's own turbulence (0195), several seeds: the pilot who flies the standard
// neither stalls nor holds the horn. Before 0199 the band rose for the gust spread only and the drill flew smooth air.
const GUSTY = [[15, 25], [25, 38], [25, 25]];
const SEEDS = [1, 2, 3, 4, 5, 6];
describe('C172 slow flight in turbulence (0199)', () => {
  for (const [windKts, gustKts] of GUSTY) {
    it(`${windKts}${gustKts > windKts ? `G${gustKts}` : ''} kt from behind with its Dryden gusts, ${SEEDS.length} seeds: the band's middle never stalls, the horn stays inside the drill's rules`, () => {
      for (const seed of SEEDS) {
        const r = slowFlight({ wx: { windKts, gustKts }, seed });
        line(`${windKts}G${gustKts} seed ${seed}`, r);
        expect(r.st.phase, `seed ${seed}`).toBe('complete');
        expect(r.maxAoa, `seed ${seed}`).toBeLessThan(stallAoaDeg(c172, 0));
        expect(r.st.warned, `seed ${seed}`).toBe(false);
      }
    });
  }
});

describe('C172 slow flight on the assists (0164: main.js applyAssists in the mission)', () => {
  it('Kid, hands off: the guide and the autothrottle fly the hold inside the test standard', () => {
    const r = assisted('kid');
    line('kid', r);
    expect(r.st.phase).toBe('complete');
    expect(r.st.maxAltDevFt).toBeLessThanOrEqual(100);
    expect(r.st.warned).toBe(false);
    expect(['S', 'A']).toContain(r.grade.grade);
    expect(r.grade.note).toMatch(/for you/);
  });
  it('Kid, hands off in the METAR\'s turbulence (0199: Kid\'s half share at 4,500 ft), 25G38 and a steady 25 kt, 6 seeds: no stall, no horn', () => {
    for (const [windKts, gustKts] of [[25, 38], [25, 25]]) for (const seed of SEEDS) {
      const r = assisted('kid', { wx: { windKts, gustKts }, seed });
      line(`kid ${windKts}G${gustKts} seed ${seed}`, r);
      expect(r.st.phase, `${windKts}G${gustKts} seed ${seed}`).toBe('complete');
      expect(r.maxAoa, `${windKts}G${gustKts} seed ${seed}`).toBeLessThan(stallAoaDeg(c172, 0));
      expect(r.st.warned, `${windKts}G${gustKts} seed ${seed}`).toBe(false);
    }
  });
  it('Learner, full back stick at idle in Learner\'s half of the turbulence (0199 panel), 10G30 to 25G38, 10 seeds: the horn, never the stall', () => {
    for (const [windKts, gustKts] of [[10, 30], [15, 30], [20, 40], [25, 38]]) for (let seed = 1; seed <= 10; seed++) {
      const r = assisted('learner', { pitchIn: () => -1, throttle: 0, seconds: 60, wx: { windKts, gustKts }, seed });
      // At idle for a minute it may sink out of the drill's 500 ft (graded D for height): not a stall.
      expect(r.maxAoa, `${windKts}G${gustKts} seed ${seed}`).toBeLessThan(stallAoaDeg(c172, 0));
      expect(r.st.why, `${windKts}G${gustKts} seed ${seed}`).not.toBe('stall');
    }
  });
  it('Learner, full back stick at idle: the assists let the Cessna reach the horn, not the stall (no floor above the band)', () => {
    const r = assisted('learner', { pitchIn: () => -1, throttle: 0, seconds: 60 });
    line('learner full aft', r);
    expect(r.minIas).toBeLessThan(WARN);
    expect(r.st.warnS).toBeGreaterThan(1);
    expect(r.maxAoa).toBeLessThan(stallAoaDeg(c172, 0));
    expect(r.st.phase).not.toBe('failed');
  });
});
