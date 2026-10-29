// Rejected takeoff cards (ticket 0107): the 737-800 rolls at full thrust from brake release,
// a failure comes before V1, and the stop is flown by a test pilot (thrust levers idle, brakes,
// nose wheel on the runway, wings level).
//
//  - Certification: 14 CFR 25.109 defines the accelerate-stop distance (accelerate to V1, the
//    pilot's first action there, then the stop, plus two seconds at V1; no reverse on a dry
//    runway). Boeing's FAR takeoff field length (737 ACAP D6-58325-7 Rev C §3.3.29: 5,100 ft
//    at 65 t, sea level, standard day, dry; b738.test.js) is the longest of the
//    accelerate-go and accelerate-stop distances, so the model's accelerate-stop must fit it.
//    V1 is the speed of the first action (recognition happens between the failure and V1), so
//    the levers close at V1. (A further second at full thrust past V1 needs ~5,370 ft: why V1
//    is a decision already made.)
//  - The drill (rto.js): the fire comes at 75-110 kt on DFW 35C (13,400 ft). The worst case,
//    110 kt, with a 1 s reaction stops with most of the runway left and grades A or better,
//    reverse or not; a 1 s autobrake MAX stop is the reference stop the grade measures against
//    (Kid's, idled by the game at the fire, is ~15% shorter); and a
//    pilot who does nothing never stops on the runway.
import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { elevatorForPitch, aileronForBank } from '../../src/autopilot.js';
import { M_TO_FT, KTS_TO_MPS } from '../../src/constants.js';
import { createRto, stepRto, gradeRto, rtoRefStopM, RTO_END } from '../../src/rto.js';
import { makeBody, fly, attitude } from './harness.js';

const b738 = AIRCRAFT_DATABASE.b738;
const FLAPS_10 = 1;
const V1_KTS = b738.vrKts - 3; // aero.js: V1 = Vr - 3
const ACAP_FIELD_FT = 5100;
const RWY_M = RTO_END.lengthM - 60; // 35C ahead of the takeoff spawn (airports.js takeoffSpawn)
const gsKts = (b) => Math.hypot(b.vel.x, b.vel.z) / KTS_TO_MPS;

// The roll: full thrust from brake release, the nose wheel held on, wings level. At failKts the
// failure; after reactS the reject (idle, and the pilot's choice of manual brakes, reverse or the
// autobrake MAX), or nothing at all (`none`). The drill's state machine watches it as the game does.
function roll({ failKts, reactS = 1, brakes = true, reverse = false, autobrake = false, none = false }) {
  const b = makeBody(b738, { throttle: 1, flaps: FLAPS_10 });
  b.autobrake = 0; b.reverseCmd = false;
  const st = createRto(() => 0);
  st.failKts = failKts;
  let fail = null, end = '';
  fly(b, b738, 180, (x) => {
    const { pitchDeg, bankRightDeg } = attitude(x);
    x.elevInput = elevatorForPitch(-0.5, pitchDeg, x.angVel.x);
    x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z);
    if (fail && !none && x.t - fail.t >= reactS) {
      x.throttle = 0;
      if (brakes) x.brakesOn = true;
      if (reverse) x.reverseCmd = true;
      if (autobrake && !x.autobrakeActive && !x.brakesOn) x.autobrake = 4;
      if (reverse && x.reverserPos >= 1 && gsKts(x) > 60) x.throttle = 1; // full reverse, stowed by 60 kt
      else if (reverse && gsKts(x) <= 60) { x.throttle = 0; x.reverseCmd = false; }
    }
  }, (x) => {
    const ev = stepRto(st, {
      t: x.t, onGround: x.onGround, wheelFt: x.onGround ? 0 : (x.pos.y - b738.gearHeight) * M_TO_FT,
      iasKts: x.iasKts, gsKts: gsKts(x), throttle: x.throttle, reverserPos: x.reverserPos ?? 0,
      braking: !!(x.brakesOn || x.autobrakeActive), leftM: RWY_M - x.distM, crossM: x.pos.x, halfWidthM: RTO_END.widthM / 2,
    });
    if (ev === 'fire') fail = { t: x.t, distM: x.distM, gsKts: gsKts(x) };
    if (ev && ev !== 'fire') end = ev;
    return !!end;
  });
  return { st, end, fail, stopFt: (b.distM - fail.distM) * M_TO_FT, totalFt: b.distM * M_TO_FT, b };
}

describe('737-800 rejected takeoff (ticket 0107)', () => {
  it('accelerate-stop (idle and maximum braking at V1, no reverse, + 2 s at V1) fits Boeing\'s 5,100 ft field length, 65 t (ACAP §3.3.29, 14 CFR 25.109)', () => {
    const r = roll({ failKts: V1_KTS, reactS: 0 });
    const asdFt = r.totalFt + 2 * V1_KTS * KTS_TO_MPS * M_TO_FT;
    const decelG = (r.fail.gsKts * KTS_TO_MPS) ** 2 / (2 * r.stopFt / M_TO_FT) / 9.81;
    console.log(`[b738 rto] V1 ${V1_KTS} kt at ${(r.fail.distM * M_TO_FT).toFixed(0)} ft, stop ${r.stopFt.toFixed(0)} ft, accelerate-stop ${asdFt.toFixed(0)} ft (field length ${ACAP_FIELD_FT}), mean ${decelG.toFixed(2)} g from the failure`);
    expect(r.end).toBe('stopped');
    expect(asdFt).toBeLessThanOrEqual(ACAP_FIELD_FT);
    // A balanced field: the stop is close to the field length, not far inside it (brakes too good).
    expect(asdFt).toBeGreaterThanOrEqual(0.85 * ACAP_FIELD_FT);
  });

  it('the drill\'s worst case: fire at 110 kt, idle, full brakes and reverse in 1 s, stops on 35C with over half of it left and grades A or better (without reverse too)', () => {
    expect(['S', 'A']).toContain(gradeRto(roll({ failKts: 110 }).st).grade);
    const r = roll({ failKts: 110, reverse: true });
    const g = gradeRto(r.st);
    console.log(`[b738 rto 110] stop ${r.stopFt.toFixed(0)} ft (reference ${(rtoRefStopM(r.st.failGsKts) * M_TO_FT).toFixed(0)}), ${(r.st.leftM * M_TO_FT).toFixed(0)} ft left, ${g.grade} ${g.score}`);
    expect(r.end).toBe('stopped');
    expect(r.st.leftM).toBeGreaterThan(RTO_END.lengthM / 2);
    expect(r.st.idleS).toBeCloseTo(1, 1);
    expect(['S', 'A']).toContain(g.grade);
  });

  it('a 1 s autobrake MAX stop (idle, no pedals) is the reference stop the grade measures (within 10%)', () => {
    const r = roll({ failKts: 100, brakes: false, autobrake: true });
    const ref = rtoRefStopM(r.st.failGsKts) * M_TO_FT;
    console.log(`[b738 rto autobrake] stop ${r.stopFt.toFixed(0)} ft, reference ${ref.toFixed(0)} ft`);
    expect(r.end).toBe('stopped');
    expect(r.stopFt / ref).toBeGreaterThan(0.9);
    expect(r.stopFt / ref).toBeLessThan(1.1);
  });

  it('a 3 s late reject at 110 kt stops further (at least the extra 2 s of roll) and grades lower', () => {
    const quick = roll({ failKts: 110 });
    const late = roll({ failKts: 110, reactS: 3 });
    expect(late.end).toBe('stopped');
    expect(late.stopFt - quick.stopFt).toBeGreaterThan(2 * 110 * KTS_TO_MPS * M_TO_FT);
    expect(gradeRto(late.st).score).toBeLessThan(gradeRto(quick.st).score);
  });

  it('doing nothing at full thrust never stops on the runway: graded D with the reason', () => {
    const r = roll({ failKts: 90, none: true });
    const g = gradeRto(r.st);
    console.log(`[b738 rto none] ${r.end} at ${r.totalFt.toFixed(0)} ft, ${g.grade} ${g.score}: ${g.reason}`);
    expect(['overrun', 'rotated']).toContain(r.end);
    expect(g.grade).toBe('D');
    expect(g.reason).toBeTruthy();
  });
});
