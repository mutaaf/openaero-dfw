// Hot-day takeoff lesson (ticket 0226): the Cessna 172S (1,150 kg, the tables' 2,550 lb) at Addison (633 ft), 29.92, calm,
// on a 38 °C scenario day against a 15 °C one, flown headless on both flight models and graded by shortTakeoff.js (hot).
// References: POH Fig. 5-5 sheet 1 (p. 5-14, the 38 °C column interpolated: roll 1,202 ft, 2,037 ft to 50 ft; 15 °C 1,017 /
// 1,729: x 1.18) and Fig. 5-6 (p. 5-17, flaps up, full throttle: 625 fpm at 38 °C, 701 at 15 °C: x 0.89). Pilots:
//  - 'poh': short field's checklist (shortTakeoff.test.js's), then flaps up above 60 KIAS (POH p. 4-16 step 8) and Vy 74.
//  - 'coolPoint': nose up hard (14°) where a cool day lifts off (Fig. 5-5's 15 °C roll), whatever the speed.
//  - a part-power roll on a short strip, and a full-power one, both pulled to idle at 35 KIAS: the reject's call.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Euler } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { M_TO_FT, FT_TO_M, RAD_TO_DEG } from '../../src/constants.js';
import { isaDeviationC } from '../../src/atmosphere.js';
import { elevatorForPitch } from '../../src/autopilot.js';
import {
  createShortTakeoff, shortTakeoffStep, shortTakeoffTarget, gradeShortTakeoff, pohTakeoff, pohClimbFpm,
  FLAPS, ROTATE_KTS, PITCH_DEG, OBSTACLE_KTS, VY_KTS, FLAPS_UP_KTS, POH_BAND, HOT_C, COOL_C, REJECT_SCORE, FAIL_CAP,
} from '../../src/shortTakeoff.js';
import { makeBody, fly, attitude, speedHoldPilot, useFdm } from './harness.js';
import { nodeJsbsim } from './jsbsimNode.js';

const c172 = AIRCRAFT_DATABASE.c172;
const _e = new Euler();
const END = { hdgT: 0, elevFt: 633, airport: 'KADS' };
const HOT = pohTakeoff(END.elevFt, 29.92, HOT_C), COOL = pohTakeoff(END.elevFt, 29.92, COOL_C);

// tech: 'poh' | 'coolPoint' | 'reject'; throttle: the power held; runwayFt: the strip; rejectKts: idle and brakes there.
// ramp: the reject's throttle comes down at the keyboard's 0.4/s (main.js) with the brakes on at once (physics panel).
export function flyHot(tech, { tempC = HOT_C, throttle = 1, runwayFt = 7203, rejectKts = null, coolRollFt = COOL.rollFt, ramp = false } = {}) {
  const b = makeBody(c172, { throttle, flaps: FLAPS });
  b.mslOffsetM = END.elevFt * FT_TO_M;
  b.isaDevC = isaDeviationC(tempC, END.elevFt * FT_TO_M); // main.js refreshWeather's
  b.brakesOn = true;
  const st = createShortTakeoff(END, true);
  const poh = pohTakeoff(END.elevFt, 29.92, tempC);
  const obst = speedHoldPilot(() => OBSTACLE_KTS), vy = speedHoldPilot(() => VY_KTS);
  const prompts = [];
  let ended = false, mode = null, maxPitch = 0, rejected = false;
  fly(b, c172, 240, (x, dt) => {
    _e.setFromQuaternion(x.quat, 'YXZ');
    x.rudderInput = Math.max(-1, Math.min(1, _e.y * RAD_TO_DEG * 0.3 + x.angVel.y * RAD_TO_DEG * 0.15));
    const { pitchDeg } = attitude(x);
    maxPitch = Math.max(maxPitch, pitchDeg);
    if (x.brakesOn && x.t > 3 && !rejected) x.brakesOn = false;
    const wheelFt = x.onGround ? 0 : (x.pos.y - c172.gearHeight) * M_TO_FT;
    const s = {
      brakes: x.brakesOn, throttle: x.throttle, flapsIndex: x.flapsIndex, onGround: x.onGround, wheelFt, iasKts: x.iasKts ?? 0,
      gsKts: Math.hypot(x.vel.x, x.vel.z) * 1.943844, alongM: -x.pos.z, leftM: runwayFt * FT_TO_M + x.pos.z, crossM: x.pos.x, halfWidthM: 15,
      pitchDeg, pitchRateDeg: x.angVel.x * RAD_TO_DEG, tailOn: (x.wheelLoads?.[3] ?? 0) > 0, poh, kid: false,
    };
    const p = shortTakeoffTarget(st, s);
    if (p && p !== prompts.at(-1)) prompts.push(p);
    if (shortTakeoffStep(st, s, dt) === 'done') ended = true;
    if (rejectKts !== null && s.iasKts >= rejectKts) rejected = true;
    if (rejected) { x.throttle = ramp ? Math.max(0, x.throttle - 0.4 * dt) : 0; x.brakesOn = true; x.elevInput = 0; return; }
    if (st.phase === 'hold' || st.phase === 'roll' || x.onGround) {
      const go = tech === 'coolPoint' ? s.alongM * M_TO_FT >= coolRollFt : s.iasKts >= ROTATE_KTS;
      x.elevInput = go ? elevatorForPitch(tech === 'coolPoint' ? 14 : PITCH_DEG, pitchDeg, x.angVel.x) : 0;
      return;
    }
    if (prompts.at(-1) === 'htoFlapsUp' && x.flapsIndex > 0) x.flapsIndex = 0; // on the coach's "flaps up"
    const want = st.obstM !== null ? 'vy' : 'obst';
    if (want !== mode) { mode = want; x.pitchCmd = pitchDeg; x.pitchTrim = undefined; }
    (want === 'vy' ? vy : obst)(x, dt);
  }, () => ended);
  return {
    st, prompts, maxPitch, poh, result: ended ? gradeShortTakeoff(st) : null,
    rollFt: st.rollM === null ? null : st.rollM * M_TO_FT, obstFt: st.obstM === null ? null : st.obstM * M_TO_FT,
  };
}

const log = (model, name, r) => console.log(`[hotTakeoff ${model}] ${name}: roll ${r.rollFt?.toFixed(0)} ft (POH ${r.poh.rollFt.toFixed(0)}), `
  + `lift-off ${r.st.liftKts?.toFixed(1)} KIAS, 50 ft at ${r.obstFt?.toFixed(0)} ft (POH ${r.poh.totalFt.toFixed(0)}), climb ${r.st.climbFpm?.toFixed(0)} fpm at `
  + `${r.st.climbKts?.toFixed?.(1)} KIAS, peak pitch ${r.maxPitch.toFixed(1)}°, settled ${r.st.settled}, reject ${JSON.stringify(r.st.reject)}: `
  + `${r.result?.grade} ${r.result?.score} (${r.result?.reason}); coach ${r.prompts.join(' > ')}`);

for (const model of ['flightModel', 'jsbsim']) describe(`Cessna 172S hot-day takeoff vs POH Fig. 5-5 and 5-6 (${model}, ticket 0226)`, () => {
  beforeAll(async () => useFdm(model === 'jsbsim' ? await nodeJsbsim() : null));
  afterAll(() => useFdm(null));
  const runs = {};
  const run = (key, tech, o) => (runs[key] ??= flyHot(tech, o));
  const hot = () => run('hot', 'poh'), cool = () => run('cool', 'poh', { tempC: COOL_C });

  it(`the ground roll grows like the POH's 38 °C column against its 15 °C (x ${(HOT.rollFt / COOL.rollFt).toFixed(2)}, ±8%)`, () => {
    const h = hot(), c = cool();
    log(model, '38 °C', h); log(model, '15 °C', c);
    expect((h.rollFt / c.rollFt) / (HOT.rollFt / COOL.rollFt)).toBeGreaterThan(0.92);
    expect((h.rollFt / c.rollFt) / (HOT.rollFt / COOL.rollFt)).toBeLessThan(1.08);
    expect((h.obstFt / c.obstFt) / (HOT.totalFt / COOL.totalFt)).toBeGreaterThan(0.92);
    expect((h.obstFt / c.obstFt) / (HOT.totalFt / COOL.totalFt)).toBeLessThan(1.08);
  });

  it('the same indicated speeds: the lift-off within 1 kt of the cool day\'s (the POH\'s speeds have no temperature column)', () => {
    expect(Math.abs(hot().st.liftKts - cool().st.liftKts)).toBeLessThan(1);
    expect(Math.abs(hot().st.obstKts - cool().st.obstKts)).toBeLessThan(2);
  });

  it("the POH's technique on the hot day: lifts off near 51, within the table's x 1.15, climbs near Fig. 5-6, grades A or better", () => {
    const r = hot();
    expect(r.st.why).toBeNull();
    expect(Math.abs(r.st.liftKts - 51)).toBeLessThanOrEqual(4);
    expect(r.rollFt / HOT.rollFt).toBeLessThanOrEqual(POH_BAND);
    expect(r.obstFt / HOT.totalFt).toBeLessThanOrEqual(POH_BAND);
    expect(Math.abs(r.st.climbKts - VY_KTS)).toBeLessThan(3);
    expect(Math.abs(r.st.climbFpm / pohClimbFpm(END.elevFt, 29.92, HOT_C) - 1)).toBeLessThan(0.15);
    expect(r.result.score).toBeGreaterThanOrEqual(85);
    expect(r.prompts[0]).toBe('htoRelease'); // flaps 10 and full power already: the roll's number and "let the brakes go"
    expect(r.prompts).toContain('stoRoll');
    expect(r.prompts).toContain('htoFlapsUp');
    expect(r.prompts.at(-1)).toBe('htoClimb');
  });

  // Fig. 5-6: 625 against 701 fpm (x 0.89). flightModel climbs x ~0.95 of its cool day, JSBSim x ~0.83 (printed). flightModel's
  // hot climb (~713) is 14% over the table and above the cool day's handbook 701: its climb is less sensitive to temperature
  // than the POH's (physics panel); the card prints both figures rather than hide it.
  it('the climb is weaker than the cool day\'s, by 3-20% (Fig. 5-6: 11%), and each within 15% of the table', () => {
    const h = hot().st.climbFpm, c = cool().st.climbFpm;
    expect(h / c).toBeLessThan(0.97);
    expect(h / c).toBeGreaterThan(0.8);
    expect(Math.abs(c / pohClimbFpm(END.elevFt, 29.92, COOL_C) - 1)).toBeLessThan(0.15);
  });

  // The ticket expected a settle-back: neither model does it. Hauled up where a cool day lifts off, the Cessna is ~3-4 kt short of
  // its lift-off speed there and flies away in ground effect at ~50 KIAS (printed), which the game's Cessna pays little for
  // (0225: premature lift-off's drag is barely modelled). The card shows the cost the physics has: a slower lift-off.
  // Where this airplane lifted off on the cool day (cool().rollFt, the roll a player who flew it saw): the hot day is 2+ kt
  // short of its lift-off speed there; hauled to 14° it lifts off no faster than the handbook pilot and does not settle back.
  it('the nose hauled up where the cool day lifted off: short of the speed there, flies away (no settle-back: printed)', () => {
    const h = hot(), r = run('coolPoint', 'coolPoint', { coolRollFt: cool().rollFt });
    log(model, 'cool-day point', r);
    expect(r.st.rotateM * M_TO_FT).toBeLessThan(h.rollFt);
    expect(r.st.rotateKts).toBeLessThan(h.st.liftKts - 1.5);
    expect(r.st.liftKts).toBeLessThan(h.st.liftKts + 0.5);
    expect(r.st.settled).toBe(false);
    expect(r.st.why).toBeNull();
  });

  // A 3,000 ft strip at 50% power (a roll of 3,250-4,500 ft, printed) pulled to idle at 35 KIAS: the game's estimate says it would
  // not have made it, the decision is an A. Full power on the same strip at the same speed would have: a needless stop, D.
  // It reads short (x 0.83-0.97, printed): the acceleration falls faster than the a = A - B v² fit at part power. REJECT_MARGIN
  // (0.75) covers it: a reject counts as the right call from three quarters of the runway left.
  it('the reject estimate at 35 KIAS against the roll flown, by power (printed; within 20%, never long by more than 5%)', () => {
    for (const thr of [1, 0.7, 0.55]) {
      const r = run(`est${thr}`, 'poh', { throttle: thr, runwayFt: 3e5, rejectKts: 35 }), f = run(`flown${thr}`, 'poh', { throttle: thr, runwayFt: 3e5 });
      const est = (r.st.reject.needM + r.st.reject.atM) * M_TO_FT;
      console.log(`[hotTakeoff ${model}] throttle ${thr}: estimate ${est.toFixed(0)} ft, flown ${f.rollFt.toFixed(0)} ft (x ${(est / f.rollFt).toFixed(2)})`);
      expect(est / f.rollFt).toBeGreaterThan(0.8);
      expect(est / f.rollFt).toBeLessThan(1.05);
    }
  });

  it('a reject at 35 KIAS: the right call on a half-power roll that would not make a 3,000 ft strip (A), needless at full power (D)', () => {
    const part = run('part', 'poh', { throttle: 0.5, runwayFt: 3000, rejectKts: 35 });
    const full = run('full', 'poh', { runwayFt: 3000, rejectKts: 35 });
    const partFlown = run('partFlown', 'poh', { throttle: 0.5, runwayFt: 1e5 });
    log(model, 'part-power reject', part); log(model, 'full-power reject', full); log(model, 'part power flown', partFlown);
    expect(partFlown.rollFt).toBeGreaterThan(3000); // it really would not have lifted off on the strip
    expect(part.st.reject.warranted).toBe(true);
    expect(part.result.score).toBe(REJECT_SCORE);
    expect(full.st.reject.warranted).toBe(false);
    expect(full.result.score).toBeLessThanOrEqual(FAIL_CAP);
    expect(part.result.title).toBe('Hot-day takeoff: rejected');
    expect(full.result.reason).toMatch(/^Stopped a takeoff that would have flown/);
    // The keyboard's throttle (0.4/s down) with the brakes on at once, on Addison's whole 7,203 ft: still needless, D.
    const ramp = run('ramp', 'poh', { rejectKts: 35, ramp: true });
    log(model, 'ramped reject', ramp);
    expect(ramp.st.reject.warranted).toBe(false);
    expect(ramp.result.score).toBeLessThanOrEqual(FAIL_CAP);
  });
});
