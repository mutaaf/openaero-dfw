// Dead-stick challenge (ticket 0036): the Cessna's engine quits 3,500 ft over North Dallas,
// abeam Addison. Pitch for best glide (68 KIAS), fly downwind, base and final to the runway
// with no power, land it. Cessna 172S POH Section 3 (Emergency Procedures, engine failure
// during flight: "Airspeed 68 KIAS (best glide)") and Fig. 3-1, Maximum Glide (1.5 NM per
// 1,000 ft above the ground, ~9:1, flaps up, prop windmilling, zero wind). The FAA Airplane
// Flying Handbook (FAA-H-8083-3C, ch. 18, emergency approaches and landings) is the method:
// best glide, pick a field, fly a pattern to it. Pure: no THREE, no DOM. Tested in
// tests/unit/deadStick.test.js and flown headless in tests/flight/c172.test.js.
import { approachGeometry, runwayEnd } from './airports.js';
import { bankCommandForHeading } from './autopilot.js';
import { kidLocalizerBankDeg } from './assists.js';
import { letterGrade } from './landing.js';
import { M_TO_FT } from './constants.js';
import { AIRCRAFT_DATABASE } from './aircraft.js';
import { DRILL_TEXT } from './coach.js';

export const DEADSTICK_KEY = 'deadstick_kads_16';
export const DS_GLIDE_KTS = AIRCRAFT_DATABASE.c172.vGlideKts; // POH: best glide at 2,550 lb
export const DS_GLIDE_RATIO = 9; // POH Fig. 3-1: 1.5 NM per 1,000 ft
// Addison's runway, both ends: the challenge is made on either (a landing on 34 counts).
const ENDS = [runwayEnd('KADS', '16'), runwayEnd('KADS', '34')];
export const DS_PLACE_NAME = 'Addison · engine out';

// The glide ratio by flap notch (0/10/20/30), measured on flightModel.js at idle near the
// approach speeds (tests/flight/c172.test.js); flaps up is the POH's 9:1. The coach and Kid's
// guide judge height with it, scaled by the wind (groundspeed over true airspeed).
export const DS_RATIO_BY_FLAPS = [DS_GLIDE_RATIO, 8.3, 7.6, 7];

// The coach's speed band around best glide (flaps out: around the approach speed), and when
// the prompts stop: below the flare height the landing coach (coach.js) takes over.
export const DS_SLOW_KTS = 62;
export const DS_SLOW_FLAPS_KTS = 58;
export const DS_FAST_KTS = 76;
export const DS_FLARE_FT = 50;
// "Engine failure!" is the first thing said, for this long.
export const DS_FAIL_S = 5;
// High: this much height above a straight glide to the nearer threshold, lined up on final.
// With no power the spare height stays the same all the way down final, and at 9:1 it is
// where the wheels touch: 200 ft spare lands ~1,800 ft past the threshold, the far end of the
// full-marks touchdown zone (landing.js: 600 m).
export const DS_HIGH_FINAL_FT = 200;
// The pattern: a 1 NM final to 16 (the FAA Handbook's "key position" idea, simplified). Turn
// for it when the height above a glide to that final and down it falls to DS_TURN_FT: until
// then, glide on (a longer downwind is how the height is used up). Flown headless from the
// spawn (tests/flight/c172.test.js), the turn at 150 ft crosses the threshold ~200 ft up (the
// base leg cuts the corner to the final); at 0 ft it falls short, at 300 ft it is ~450 ft high.
export const DS_FINAL_NM = 1;
export const DS_TURN_FT = 150;

export const DS_TEXT = {
  dsFail: `Engine failure! Pitch for ${DS_GLIDE_KTS} knots`,
  dsSlow: `Slow: lower the nose, ${DS_GLIDE_KTS} knots`,
  dsFast: `Fast: ease back to ${DS_GLIDE_KTS} knots`,
  dsLow: 'Low: flaps up, turn straight for the runway',
  dsHigh: 'High: add flaps, or S-turn to lose height',
  dsLeft: 'Runway off your left: glide on till I say turn',
  dsRight: 'Runway off your right: glide on till I say turn',
  dsTurnL: 'Turn left now, toward the runway',
  dsTurnR: 'Turn right now, toward the runway',
  dsBase: 'Glide to the runway line, then turn onto it',
  dsFinal: "On final: flaps when you're sure you'll make it",
  dsRunway: 'Over the runway: ease the nose up, land it',
  dsBounce: 'Bounced: hold the attitude, let it settle', // coach.js, no power to add
  dsKidFail: 'Engine stopped! Let go: the plane glides',
  dsKid: 'No engine: the plane glides to the runway',
};
Object.assign(DRILL_TEXT, DS_TEXT);

const E16 = ENDS[0];
const D16 = { x: Math.sin(E16.hdgT * Math.PI / 180), z: -Math.cos(E16.hdgT * Math.PI / 180) };
const FINAL_M = DS_FINAL_NM * 1852;
const wrap180 = (d) => ((d % 360) + 540) % 360 - 180;
const deg = (rad) => rad * 180 / Math.PI;

export const createDeadStick = (t0) => ({ t0 });

// The geometry the coach and Kid's guide need, into a reused object (main.js runs it every
// frame: no allocation). s: { iasKts, aglFt, x, z (sim m), trackDeg, flaps (index), windRatio
// (groundspeed / true airspeed) }.
//   ratio: the glide ratio over the ground now; spareFt: height above a straight glide to the
//   nearer threshold; viaFinalFt: above a glide to the 1 NM final point and down the final;
//   lined: the Addison end you are lined up on (or null); overRunway; relDeg: the runway's
//   middle off your track (+ right); finalRelDeg: the aim point on 16's centreline (900 m ahead
//   of your abeam point, never past the threshold) off your track.
const _g = { ratio: 0, spareFt: 0, viaFinalFt: 0, lined: null, overRunway: false, relDeg: 0, finalRelDeg: 0, aimX: 0, aimZ: 0 };
export function fieldGeometry(s) {
  const g = _g;
  g.ratio = DS_RATIO_BY_FLAPS[s.flaps ?? 0] * Math.max(0.4, Math.min(1.5, s.windRatio ?? 1));
  let distM = Infinity;
  g.lined = null;
  for (const e of ENDS) {
    distM = Math.min(distM, Math.hypot(s.x - e.thrX, s.z - e.thrZ));
    const dx = Math.sin(e.hdgT * Math.PI / 180), dz = -Math.cos(e.hdgT * Math.PI / 180);
    const along = (s.x - e.thrX) * dx + (s.z - e.thrZ) * dz; // + past the threshold
    const cross = (s.x - e.thrX) * -dz + (s.z - e.thrZ) * dx;
    // Lined up (selectActiveRunway's cone, kept to the runway's far end, not 200 m past).
    if (Math.abs(wrap180(s.trackDeg - e.hdgT)) <= 35 && along < e.lengthM - e.displacedM && along > -30000
      && Math.abs(cross) < Math.max(150, -along * 0.268)) g.lined = e;
  }
  const a16 = (s.x - E16.thrX) * D16.x + (s.z - E16.thrZ) * D16.z;
  const c16 = (s.x - E16.thrX) * -D16.z + (s.z - E16.thrZ) * D16.x;
  g.overRunway = a16 > -E16.displacedM - 30 && a16 < E16.lengthM - E16.displacedM && Math.abs(c16) < E16.widthM / 2 + 30;
  g.spareFt = s.aglFt - distM * M_TO_FT / g.ratio;
  const fx = E16.thrX - D16.x * FINAL_M, fz = E16.thrZ - D16.z * FINAL_M;
  g.viaFinalFt = s.aglFt - (Math.hypot(s.x - fx, s.z - fz) + FINAL_M) * M_TO_FT / g.ratio;
  const mx = (ENDS[0].endX + ENDS[1].endX) / 2, mz = (ENDS[0].endZ + ENDS[1].endZ) / 2;
  g.relDeg = wrap180(deg(Math.atan2(mx - s.x, -(mz - s.z))) - s.trackDeg);
  const aim = Math.min(a16 + 900, 0); // along 16's centreline (− before the threshold)
  g.aimX = E16.thrX + D16.x * aim; g.aimZ = E16.thrZ + D16.z * aim;
  g.finalRelDeg = wrap180(deg(Math.atan2(g.aimX - s.x, -(g.aimZ - s.z))) - s.trackDeg);
  return g;
}

// The coach's prompt key for one moment (null below the flare height: coach.js has it).
// s: fieldGeometry's input plus t (s since the failure) and kid (Kid level: its guide flies).
export function deadStickTarget(s) {
  if (s.t < DS_FAIL_S) return s.kid ? 'dsKidFail' : 'dsFail';
  if (s.aglFt < DS_FLARE_FT) return null;
  if (s.kid) return 'dsKid';
  const g = fieldGeometry(s);
  if (g.overRunway) return 'dsRunway';
  if (s.iasKts < (s.flaps ? DS_SLOW_FLAPS_KTS : DS_SLOW_KTS)) return 'dsSlow';
  if (s.iasKts > DS_FAST_KTS) return 'dsFast';
  // Below a straight glide to the nearer threshold: no pattern is left.
  if (g.spareFt < 0) return 'dsLow';
  if (g.lined) return g.spareFt > DS_HIGH_FINAL_FT ? 'dsHigh' : 'dsFinal';
  if (g.viaFinalFt > DS_TURN_FT) return g.relDeg < 0 ? 'dsLeft' : 'dsRight';
  if (Math.abs(g.finalRelDeg) > 30) return g.finalRelDeg < 0 ? 'dsTurnL' : 'dsTurnR';
  return 'dsBase';
}

// main.js's calls: the input from the sim (reused), the prompt, and Kid's hands-off guide.
const _in = { t: 0, iasKts: 0, aglFt: 0, x: 0, z: 0, trackDeg: 0, flaps: 0, windRatio: 1, kid: false };
function input(st, sim) {
  _in.t = sim.simTime - st.t0; _in.iasKts = sim.iasKts; _in.aglFt = sim.aglFt;
  _in.x = sim.pos.x; _in.z = sim.pos.z;
  _in.trackDeg = (deg(Math.atan2(sim.vel.x, -sim.vel.z)) + 360) % 360;
  _in.flaps = sim.flapsIndex; _in.windRatio = sim.tasKts > 20 ? sim.gsKts / sim.tasKts : 1;
  _in.kid = sim.assist === 'kid';
  return _in;
}
export const deadStickPrompt = (st, sim) => deadStickTarget(input(st, sim));

// Kid's hands-off guide with no engine (main.js applyAssists writes out.guideGammaDeg and
// out.guideBankDeg): the flight path that holds best glide (steady, the 9:1 glide's −6.3°;
// slow, a steeper path to gather speed, the AoA protection the backstop; fast, a shallower
// one), and the coach's pattern: wings level while there is height to spare, then a turn to
// the final, lined up the localizer guide's line-up.
export const DS_GLIDE_GAMMA_DEG = -deg(Math.atan(1 / DS_GLIDE_RATIO));
export const kidGlideGammaDeg = (iasKts) => Math.max(-12, Math.min(-2, DS_GLIDE_GAMMA_DEG + 0.4 * (iasKts - DS_GLIDE_KTS)));
export function kidGuide(st, sim, out) {
  out.guideGammaDeg = kidGlideGammaDeg(sim.iasKts);
  const s = input(st, sim), g = fieldGeometry(s);
  const e = g.lined;
  if (e) {
    const cross = (s.x - e.thrX) * Math.cos(e.hdgT * Math.PI / 180) + (s.z - e.thrZ) * Math.sin(e.hdgT * Math.PI / 180);
    out.guideBankDeg = kidLocalizerBankDeg(e.hdgT, s.trackDeg, cross);
  } else {
    const turn = g.viaFinalFt <= DS_TURN_FT || g.spareFt < 0;
    out.guideBankDeg = turn ? bankCommandForHeading(g.spareFt < 0 ? g.relDeg : g.finalRelDeg) : 0;
  }
  return out;
}

// The Addison end a touchdown is graded on: the one whose landing direction is nearer your
// heading (a landing on 34 is graded on 34).
export function landingEnd(headingDeg) {
  const off = (e) => Math.abs(wrap180(headingDeg - e.hdgT));
  return off(ENDS[0]) <= off(ENDS[1]) ? ENDS[0] : ENDS[1];
}

// How far (m) a point is from the runway's pavement, its displaced threshold included (0 = on
// it), and which way: 'short', 'long' (past the far end) or 'side' (into _miss.way).
const _miss = { way: 'short' };
export function missM(end, pos) {
  const g = approachGeometry(end, pos);
  const along = -g.distM; // past the landing threshold
  const short = -end.displacedM - along, long = along - (end.lengthM - end.displacedM);
  const side = Math.abs(g.crossM) - end.widthM / 2;
  _miss.way = short > 0 && short >= side ? 'short' : long > 0 && long >= side ? 'long' : 'side';
  return Math.hypot(Math.max(0, short, long), Math.max(0, side));
}
export const missWay = () => _miss.way;

// Made the runway is 30% of the grade, the landing (landing.js gradeLanding) 70%. On the
// pavement short of a displaced threshold counts as made: with no engine, it is runway.
// Missed: the card says by how much and what to change, keeps only the touchdown's rate and
// speed (centreline and zone mean nothing in a field), and the grade is a D at best. A crash
// stays a crash.
const MADE_WEIGHT = 0.3;
const MISSED_CAP = 54; // the top of a D
const MISS_ADVICE = {
  short: 'Short of the runway by {d}: turn for it sooner.',
  long: 'Past the far end by {d}: too high, use flaps or S-turns sooner.',
  side: 'Beside the runway by {d}: line up with it on final.',
};
// Feet, or nautical miles past one.
export const missText = (m) => (m >= 1852 ? `${(m / 1852).toFixed(1)} NM`
  : `${Math.max(1, Math.ceil(m * M_TO_FT)).toLocaleString('en-US')} ft`);
export function deadStickResult(landing, end, pos) {
  const miss = missM(end, pos);
  const made = miss <= 0;
  const touchdown = made ? landing.factors : landing.factors.filter((f) => f.key === 'rate' || f.key === 'speed');
  const factors = [{ key: 'made', label: 'Made the runway', value: made ? 'yes' : `missed by ${missText(miss)}`, score: made ? 100 : 0 },
    ...touchdown];
  const out = { ...landing, title: 'Dead-stick landing', factors, madeRunway: made, missFt: made ? 0 : Math.max(1, Math.ceil(miss * M_TO_FT)) };
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
    out.reason = MISS_ADVICE[_miss.way].replace('{d}', missText(miss));
  }
  out.score = score;
  return out;
}

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
