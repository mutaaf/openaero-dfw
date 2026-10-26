// Dead-stick challenge (ticket 0036): the Cessna's engine quits 3,500 ft over North Dallas,
// abeam Addison. Pitch for best glide (68 KIAS), fly downwind, base and final to the runway
// with no power, land it. Cessna 172S POH Section 3 (Emergency Procedures, engine failure
// during flight: "Airspeed 68 KIAS (best glide)") and Fig. 3-1, Maximum Glide (1.5 NM per
// 1,000 ft above the ground, ~9:1, flaps up, prop windmilling, zero wind). The FAA Airplane
// Flying Handbook (FAA-H-8083-3C, ch. 18, emergency approaches and landings) is the method:
// best glide, pick a field, fly a pattern to it. Pure: no THREE, no DOM. Tested in
// tests/unit/deadStick.test.js and flown headless in tests/flight/c172.test.js.
import { approachGeometry, runwayEnd, selectActiveRunway } from './airports.js';
import { letterGrade } from './landing.js';
import { M_TO_FT } from './constants.js';
import { AIRCRAFT_DATABASE } from './aircraft.js';

export const DEADSTICK_KEY = 'deadstick_kads_16';
export const DS_GLIDE_KTS = AIRCRAFT_DATABASE.c172.vGlideKts; // POH: best glide at 2,550 lb
export const DS_GLIDE_RATIO = 9; // POH Fig. 3-1: 1.5 NM per 1,000 ft
// Addison's runway, both ends: the challenge is made on either (a landing on 34 counts).
const ENDS = [runwayEnd('KADS', '16'), runwayEnd('KADS', '34')];
export const DS_PLACE_NAME = 'Addison · engine out';

// The coach's speed band around best glide, and when the prompts stop: below the flare
// height the landing coach (coach.js) takes over (flare, idle, rollout).
export const DS_SLOW_KTS = 62;
export const DS_FAST_KTS = 76;
export const DS_FLARE_FT = 50;
// "Engine failure!" is the first thing said, for this long.
export const DS_FAIL_S = 5;
// High: this much height above a straight glide to the nearer threshold, lined up on final.
// With no power the spare height stays the same all the way down final, and at 9:1 it is
// where the wheels touch: 200 ft spare lands ~1,800 ft past the threshold, the far end of the
// full-marks touchdown zone (landing.js: 600 m). Anywhere within DS_NEAR_NM of the field, the
// pattern can still use more (DS_HIGH_PATTERN_FT).
export const DS_HIGH_FINAL_FT = 200;
export const DS_HIGH_PATTERN_FT = 1500;
export const DS_NEAR_NM = 1.5;

export const DS_TEXT = {
  dsFail: `Engine failure! Pitch for ${DS_GLIDE_KTS} knots`,
  dsSlow: `Slow: lower the nose, ${DS_GLIDE_KTS} knots`,
  dsFast: `Fast: ease back to ${DS_GLIDE_KTS} knots`,
  dsLow: 'Low: turn straight for the runway, no flaps',
  dsHigh: "High: add flaps, or S-turn to lose height",
  dsLeft: 'Addison is off your left: downwind, base, final',
  dsRight: 'Addison is off your right: downwind, base, final',
  dsFinal: "On final: flaps when you're sure you'll make it",
};

// One frame's input, reused (main.js runs this every frame: no allocation).
const _in = { t: 0, iasKts: 0, aglFt: 0, x: 0, z: 0, trackDeg: 0 };
export const createDeadStick = (t0) => ({ t0, done: false });

// The geometry the coach needs from a position: the nearer threshold's straight-line distance
// (ft), the end you are lined up with (null if none) and the field's relative bearing (+ right).
export function fieldGeometry(x, z, trackDeg) {
  let distFt = Infinity, near = ENDS[0];
  for (const e of ENDS) {
    const d = Math.hypot(x - e.thrX, z - e.thrZ) * M_TO_FT;
    if (d < distFt) { distFt = d; near = e; }
  }
  const lined = selectActiveRunway(ENDS, { x, z }, trackDeg, null);
  // Bearing to the runway's middle (sim frame: +X east, -Z north).
  const mx = (ENDS[0].endX + ENDS[1].endX) / 2, mz = (ENDS[0].endZ + ENDS[1].endZ) / 2;
  const brg = Math.atan2(mx - x, -(mz - z)) * 180 / Math.PI;
  const relDeg = ((brg - trackDeg) % 360 + 540) % 360 - 180;
  return { distFt, near, lined, relDeg };
}

// The coach's prompt key for one moment (null below the flare height: coach.js has it).
// s: { t (s since the failure), iasKts, aglFt, x, z (sim metres), trackDeg (ground track) }.
export function deadStickTarget(s) {
  if (s.t < DS_FAIL_S) return 'dsFail';
  if (s.aglFt < DS_FLARE_FT) return null;
  if (s.iasKts < DS_SLOW_KTS) return 'dsSlow';
  if (s.iasKts > DS_FAST_KTS) return 'dsFast';
  const g = fieldGeometry(s.x, s.z, s.trackDeg);
  // Height above a straight glide to the nearer threshold: below it, no pattern is left.
  const spareFt = s.aglFt - g.distFt / DS_GLIDE_RATIO;
  if (spareFt < 0) return 'dsLow';
  if (spareFt > (g.lined ? DS_HIGH_FINAL_FT : g.distFt < DS_NEAR_NM * 6076 ? DS_HIGH_PATTERN_FT : Infinity)) return 'dsHigh';
  if (g.lined) return 'dsFinal';
  return g.relDeg < 0 ? 'dsLeft' : 'dsRight';
}

// main.js's call: the prompt for the sim right now (st: createDeadStick's state).
export function deadStickPrompt(st, sim) {
  _in.t = sim.simTime - st.t0; _in.iasKts = sim.iasKts; _in.aglFt = sim.aglFt;
  _in.x = sim.pos.x; _in.z = sim.pos.z;
  _in.trackDeg = (Math.atan2(sim.vel.x, -sim.vel.z) * 180 / Math.PI + 360) % 360;
  return deadStickTarget(_in);
}

// The Addison end a touchdown is graded on: the one whose landing direction is nearer your
// heading (a landing on 34 is graded on 34).
export function landingEnd(headingDeg) {
  const off = (e) => Math.abs(((headingDeg - e.hdgT) % 360 + 540) % 360 - 180);
  return off(ENDS[0]) <= off(ENDS[1]) ? ENDS[0] : ENDS[1];
}

// How far (m) a point is from the runway's pavement, its displaced threshold included (0 = on it).
export function missM(end, pos) {
  const g = approachGeometry(end, pos);
  const along = -g.distM; // past the landing threshold
  const out = Math.max(0, -end.displacedM - along, along - (end.lengthM - end.displacedM));
  return Math.hypot(out, Math.max(0, Math.abs(g.crossM) - end.widthM / 2));
}

// Made the runway is 30% of the grade, the landing (landing.js gradeLanding) 70%. On the
// pavement short of a displaced threshold counts as made: with no engine, it is runway.
// Missed: the card says by how much, and the grade is a D at best. A crash stays a crash.
const MADE_WEIGHT = 0.3;
const MISSED_CAP = 54; // the top of a D
const fmtFt = (m) => Math.round(m * M_TO_FT).toLocaleString('en-US');
export function deadStickResult(landing, miss) {
  const made = miss <= 0;
  const factors = [{ key: 'made', label: 'Made the runway', value: made ? 'yes' : `missed by ${fmtFt(miss)} ft`, score: made ? 100 : 0 },
    ...landing.factors];
  const out = { ...landing, title: 'Dead-stick landing', factors, madeRunway: made, missFt: made ? 0 : Math.round(miss * M_TO_FT) };
  if (landing.grade === 'CRASH') return out;
  let score = Math.round(landing.score * (1 - MADE_WEIGHT) + (made ? 100 * MADE_WEIGHT : 0));
  if (made) {
    // On the pavement, gradeLanding's only D is "short" of a displaced threshold: runway here.
    out.reason = null;
    out.grade = letterGrade(score);
    out.note = 'Made the runway with the engine out';
  } else {
    score = Math.min(score, MISSED_CAP);
    out.grade = 'D';
    out.reason = `Missed the runway by ${fmtFt(miss)} ft: hold ${DS_GLIDE_KTS} kt and turn for it sooner.`;
  }
  out.score = score;
  return out;
}

// Kid's hands-off guide with no engine (main.js applyAssists): the flight path (deg, + up)
// that holds best glide. Steady, it is the 9:1 glide's −6.3°; slow, a steeper path to
// gather speed (the AoA protection is the backstop), fast, a shallower one.
export const DS_GLIDE_GAMMA_DEG = -Math.atan(1 / DS_GLIDE_RATIO) * 180 / Math.PI;
export const kidGlideGammaDeg = (iasKts) => Math.max(-12, Math.min(-2, DS_GLIDE_GAMMA_DEG + 0.4 * (iasKts - DS_GLIDE_KTS)));

// ?debug (tests): put the gliding Cessna on Addison 16's extended centreline, distNm before
// the threshold and aglFt above the ground there, wings level at best glide on the 9:1 path.
// sim.quat and sim.vel are three.js objects (set/copy by components: this chunk has no THREE).
export function debugFinal(sim, distNm, aglFt, ground) {
  const e = ENDS[0], r = e.hdgT * Math.PI / 180, dx = Math.sin(r), dz = -Math.cos(r);
  const x = e.thrX - dx * distNm * 1852, z = e.thrZ - dz * distNm * 1852;
  const v = DS_GLIDE_KTS * 0.514444, g = DS_GLIDE_GAMMA_DEG * Math.PI / 180;
  sim.pos.set(x, ground.heightAt(x, z) + aglFt / M_TO_FT, z);
  sim.vel.set(dx * v * Math.cos(g), v * Math.sin(g), dz * v * Math.cos(g));
  sim.quat.set(0, Math.sin(-r / 2), 0, Math.cos(-r / 2));
  sim.angVel.set(0, 0, 0);
  sim.flapsIndex = 0;
}
