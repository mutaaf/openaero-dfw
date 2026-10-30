// Microburst windshear cards (ticket 0112): the 737-800 on the drill's 3 NM final to DFW 35C
// (flaps 30, gear down, Vref + 5, in trim on the 3° path, as main.js loadScenario spawns it)
// meets windshear.js's microburst at 600 ft: +15 kt of headwind, then 35 kt of it lost in 15 s
// to a 20 kt tailwind, with a 1,500 fpm downdraft in the core. The drill's state machine
// watches each flight as the game does and grades it.
//
//  - FAA-Boeing Windshear Training Aid (1987) and FAA AC 00-54 (Pilot Windshear Guide, 1988):
//    the escape is maximum thrust and a pull-up to ~15° nose up, held (less at the stick shaker),
//    without pitching down to chase the lost airspeed. NTSB AAR-86/05 (Delta 191, DFW 17L,
//    2 August 1985): flown on into a microburst at approach power, a widebody struck the ground
//    over a mile short of the runway.
//  - What the cards pin, all relative (no published height-loss figure exists for this
//    shear): flown on at approach power and attitude, the 737 sinks into the ground well
//    short of the threshold; full power with no pull-up loses three times the escape's height
//    (the training aid's point: thrust alone does not stop the sink, pitch does); a 1 s escape climbs out without a stall or a
//    shaker, losing less than 250 ft; diving for speed at full power loses more and grades
//    worse; a late escape (6 s) still makes it, lower and graded lower.
import { describe, it, expect } from 'vitest';
import { Euler } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { M_TO_FT, KTS_TO_MPS, DEG_TO_RAD } from '../../src/constants.js';
import { trimThrottle } from '../../src/flightModel.js';
import { airAt, tasFromIas } from '../../src/atmosphere.js';
import { stallAoaDeg } from '../../src/aero.js';
import { elevatorForPitch, aileronForBank, trimAoaDeg } from '../../src/autopilot.js';
import { approachGeometry, approachSpawn } from '../../src/airports.js';
import { missionByKey } from '../../src/missions.js';
import { createShear, stepShear, gradeShear, addShearWind, SHEAR_KEY, SHEAR_END } from '../../src/windshear.js';
import { makeBody, fly, attitude, speedHoldPilot } from './harness.js';

const b738 = AIRCRAFT_DATABASE.b738;
const FLAPS_30 = 2;
const _e = new Euler(0, 0, 0, 'YXZ');

// The drill's final, flown by `mode` from the warning + reactS:
//  'none'    approach power and attitude held throughout (no reaction)
//  'thrust'  full power, the approach attitude held (no pull-up)
//  'escape'  full power and a pull-up at 2.5°/s to 15°, held, eased 2° under the stall angle
//  'chase'   full power, the pitch flown to hold the approach speed (diving for it)
function flyShear(mode, reactS = 1) {
  const m = missionByKey(SHEAR_KEY);
  const end = { ...SHEAR_END, thrY: 0 };
  const kts = b738.vrefKts + 5, vApp = kts * KTS_TO_MPS;
  const sp = approachSpawn(end, m.distNm, tasFromIas(vApp, airAt(0).sigma));
  const b = makeBody(b738, { kts, altM: sp.pos.y, flaps: FLAPS_30 });
  b.pos.set(sp.pos.x, sp.pos.y, sp.pos.z);
  b.vel.set(sp.vel.x, sp.vel.y, sp.vel.z);
  const p0 = trimAoaDeg(b738, vApp, FLAPS_30) - 3;
  b.quat.setFromEuler(_e.set(p0 * DEG_TO_RAD, sp.yawRad, 0));
  b.throttle = b.engineN = trimThrottle(b738, vApp, FLAPS_30, -3, true, airAt(0));
  b.apMaster = false;
  b.simTime = 0; b.groundY = 0; b.spec = b738; b.gearDown = true;
  const st = createShear(Math.sin(end.hdgT * DEG_TO_RAD), -Math.cos(end.hdgT * DEG_TO_RAD));
  const chase = speedHoldPilot(() => kts);
  const s = { t: 0, dt: 0, aglFt: 0, vsFpm: 0, pitchDeg: 0, bankDeg: 0, throttle: 0, aoaDeg: 0, stallAoaDeg: 0, onGround: false, config: 0 };
  let cmd = p0, maxAoa = -90, touchM = null;
  const metar = b.windVec.clone();
  fly(b, b738, 200, (x, dt) => {
    // main.js updateWind: the METAR's air (calm here), then the microburst's on top.
    x.simTime = x.t;
    x.windVec.copy(metar);
    addShearWind(st, x);
    const { pitchDeg, bankRightDeg } = attitude(x);
    const esc = st.phase !== 'final' && st.phase !== 'shear' && mode !== 'none' && x.t - st.warnT >= reactS;
    if (esc) x.throttle = 1;
    if (esc && mode === 'chase') { chase(x, dt); return; }
    if (esc && mode === 'escape') {
      const lim = stallAoaDeg(b738, x.flapsIndex) - 2;
      const tgt = (x.aoaDeg ?? 0) > lim ? pitchDeg - ((x.aoaDeg ?? 0) - lim) : 15;
      cmd = Math.min(tgt, cmd + 2.5 * dt);
    }
    x.elevInput = elevatorForPitch(cmd, pitchDeg, x.angVel.x);
    x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z);
    if (st.phase !== 'final') maxAoa = Math.max(maxAoa, x.aoaDeg ?? 0);
  }, (x) => {
    const { pitchDeg, bankRightDeg } = attitude(x);
    Object.assign(s, {
      t: x.t, dt: 1 / 120, aglFt: (x.pos.y - b738.gearHeight) * M_TO_FT, vsFpm: x.vel.y * M_TO_FT * 60, pitchDeg, bankDeg: bankRightDeg,
      throttle: x.throttle, aoaDeg: x.aoaDeg ?? 0, stallAoaDeg: stallAoaDeg(b738, x.flapsIndex), onGround: !!x.onGround,
      config: x.flapsIndex * 2 + (x.gearDown ? 1 : 0),
    });
    const ev = stepShear(st, s);
    if (ev === 'failed' && st.ground) touchM = approachGeometry(end, x.pos).distM; // + short of the threshold
    return ev === 'clear' || ev === 'failed';
  });
  return { st, grade: gradeShear(st), lostFt: st.startFt - st.lowFt, maxAoa, touchM, stallAoa: stallAoaDeg(b738, FLAPS_30) };
}

describe('Boeing 737-800 microburst escape (FAA-Boeing Windshear Training Aid; AC 00-54)', () => {
  it('flown on at approach power and attitude, it sinks into the ground well short of the runway', () => {
    const r = flyShear('none');
    expect(r.st.phase).toBe('failed');
    expect(r.st.ground).toBe(true);
    expect(r.st.lowFt).toBeLessThan(100);
    expect(r.touchM).toBeGreaterThan(1000); // short of the threshold, in the approach lights' field
    expect(r.grade.grade).toBe('CRASH');
  });

  it('full power without the pull-up loses three times the escape\'s height, and is graded for the low nose', () => {
    const r = flyShear('thrust'), esc = flyShear('escape');
    expect(r.st.ground).toBe(false);
    expect(r.lostFt).toBeGreaterThan(3 * esc.lostFt);
    expect(r.st.lowFt).toBeLessThan(200);
    expect(r.grade.score).toBeLessThanOrEqual(69);
    expect(r.grade.reason).toMatch(/nose low/);
  });

  it('the escape (full power, 15° nose up, 1 s) climbs out with no stall or stick shaker, an A or better', () => {
    const r = flyShear('escape');
    expect(r.st.phase).toBe('clear');
    expect(r.st.stalled).toBe(false);
    expect(r.maxAoa).toBeLessThan(r.stallAoa);
    expect(r.st.shakerS).toBeLessThan(1);
    expect(r.lostFt).toBeGreaterThan(50); // the shear costs height even flown well (the downdraft fades below 400 ft)
    expect(r.lostFt).toBeLessThan(250);
    expect(r.st.minPitchDeg).toBeGreaterThan(12);
    expect(['S', 'A']).toContain(r.grade.grade);
  });

  it('diving for the lost speed at full power loses more height and grades worse than the escape', () => {
    const esc = flyShear('escape', 3), chase = flyShear('chase', 3);
    expect(chase.st.phase).toBe('clear'); // the 737's thrust gets it out, low
    expect(chase.lostFt).toBeGreaterThan(esc.lostFt + 100);
    expect(chase.st.diveDeg).toBeGreaterThan(2); // the nose went down after the power came in
    expect(esc.st.diveDeg).toBeLessThan(1);
    expect(chase.grade.score).toBeLessThan(esc.grade.score);
    expect(chase.grade.score).toBeLessThanOrEqual(69);
    expect(chase.grade.reason).toMatch(/chase the airspeed/);
  });

  it('a late escape (6 s) still makes it, lower and graded lower than a prompt one', () => {
    const late = flyShear('escape', 6), prompt = flyShear('escape', 1);
    expect(late.st.phase).toBe('clear');
    expect(late.lostFt).toBeGreaterThan(prompt.lostFt + 100);
    expect(late.grade.score).toBeLessThan(prompt.grade.score);
    expect(late.grade.reason).not.toMatch(/chase/); // late, not a dive: the reaction is what cost it
  });
});
