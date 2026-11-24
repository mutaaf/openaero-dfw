// Power-off 180° accuracy approach and landing (ticket 0189): the Cessna on a left downwind for
// Addison 16 at 1,000 ft above the field, abeam the spot, when the engine quits. Glide at best
// glide (68 KIAS, POH Section 3), choose when to turn, and land on the spot or up to 200 ft past
// it, never short (FAA-S-ACS-7B, Commercial Pilot Airplane ACS, Area IV Task M, Power-Off 180°
// Accuracy Approach and Landing: touch down on the specified point or up to 200 ft beyond it, never
// short; FAA-S-ACS-7A said the same). The spot is the aiming-point marking 1,000 ft (AIM_POINT_M) past 16's landing threshold
// (AIM 2-3-3), which the 3D runway paints and the card's strip draws.
// The dead-stick challenge's machinery is reused (deadStick.js: the dead engine, best glide, Kid's
// glide path, the touchdown on or off the pavement): main.js loads this chunk in its place and
// calls the same five names. Pure: no THREE, no DOM. Tested in tests/unit/power180.test.js and
// flown headless in tests/flight/power180.test.js.
import { runwayEnd, AIM_POINT_M } from './airports.js';
import { bankCommandForHeading } from './autopilot.js';
import { stallAoaDeg } from './aero.js';
import { letterGrade, curve } from './landing.js';
import { M_TO_FT } from './constants.js';
import { DRILL_TEXT, TOUCH_WORDS } from './coach.js';
import { missionByKey } from './missions.js';
import {
  DS_GLIDE_KTS, DS_SLOW_KTS, DS_SLOW_FLAPS_KTS, DS_FAST_KTS, DS_FAIL_S, DS_FLARE_FT,
  kidGlideGammaDeg, landingEnd, deadStickResult as dsResult, debugFinal,
} from './deadStick.js';

export { landingEnd, debugFinal };
export const P180_KEY = 'pad_180_kads_16';
const END = runwayEnd('KADS', '16');
const SPAWN = missionByKey(P180_KEY);
const D = { x: Math.sin(END.hdgT * Math.PI / 180), z: -Math.cos(END.hdgT * Math.PI / 180) };
// The spot, along 16's centreline from its landing threshold, and the ACS's window past it.
export const SPOT_M = AIM_POINT_M;
export const BEYOND_FT = 200;
export const SPOT_X = END.thrX + D.x * SPOT_M, SPOT_Z = END.thrZ + D.z * SPOT_M;
// The downwind: half a mile out (the FAA Airplane Flying Handbook, ch. 8, puts the downwind
// "approximately 1/2 to 1 mile" from the runway), checked by tests/unit/power180.test.js.
export const DOWNWIND_NM = 0.5;
// The idle glide ratio by flap notch (0/10/20/30) at 68 KIAS, measured on flightModel.js since 0186's
// flap drag (CHANGELOG 2026-11-15: 9.2 / 8.8 / 7.5 / 6.6; deadStick.js's older table reads 9 / 8.3 /
// 7.6 / 7). The flaps-up figure is the POH's 9:1 (Fig. 3-1) within 2%.
export const RATIO_BY_FLAPS = [9.2, 8.8, 7.5, 6.6];
// The glide is aimed this far before the spot: the round-out and hold-off float the rest. With TURN_FT,
// fitted headless on flightModel.js (0202: 95 → 101 m, 170 → 160 ft, on a 20 ft round-out that doesn't hop;
// 0214, the elevator's lift beyond trim: the flaps-30 flares floated 20-35 ft further, 101 → 109 m, TURN_FT kept).
export const FLOAT_M = 109;
const AIM_X = SPOT_X - D.x * FLOAT_M, AIM_Z = SPOT_Z - D.z * FLOAT_M;

// The coach's plan: a short final (FINAL_M before the spot) flown with flaps 20 (RATIO_BY_FLAPS:
// 7.5:1), reached from where you are flaps up (9.2:1). Turn when the height above that glide falls to
// TURN_FT: until then the extra height is used up by gliding on down the downwind. The base leg cuts
// the corner and the flare floats, which TURN_FT and FINAL_M absorb: flown headless from the spawn
// (tests/flight/power180.test.js), the coached pilot touches down inside the ACS window.
export const FINAL_M = 600;
const CLOSE_DEG_PER_M = 0.2;
export const TURN_FT = 160;
// Kid's guide turns this much later (lower), fitted in tests/e2e/power180.spec.js: since 0202 (Cmα̇, TURN_FT
// 160) at 95 ft, as before, 87-168 ft past over 5 runs (main 113-173; TURN_FT − 75 gave 31-109). 0214 kept it at
// 95 ft: 13-160 ft past over 8 runs (a turn at 92 ft gave 48-250, out twice in 5).
export const KID_TURN_FT = TURN_FT - 65;
// Lined up: when a glide with the next notch out still reaches the aim with this much to spare,
// the coach asks for it (flaps 20, then 30); Kid's guide sets them.
export const FLAPS_FT = 10;
const LOW_FT = 20;
const KEEP_S = 5;

export const P180_TEXT = {
  p1Fail: `Engine out! Pitch for ${DS_GLIDE_KTS} knots: the spot is the big white blocks`,
  p1KidFail: 'Engine stopped! Let go: the plane glides to the white blocks',
  p1Kid: 'No engine: the plane glides round to the white blocks',
  p1Slow: `Slow: lower the nose, ${DS_GLIDE_KTS} knots`,
  p1Fast: `Fast: ease back to ${DS_GLIDE_KTS} knots`,
  p1WaitL: 'Spot off your left: too high to turn yet, glide on',
  p1WaitR: 'Spot off your right: too high to turn yet, glide on',
  p1TurnL: 'Turn left now: glide round toward the spot',
  p1TurnR: 'Turn right now: glide round toward the spot',
  p1KeepL: 'Keep turning left, toward the runway line',
  p1KeepR: 'Keep turning right, toward the runway line',
  p1Base: 'Fly to the runway line, then turn onto it',
  p1Low: 'Low: cut the corner to the runway, hold 68',
  p1LowF: 'Low: hold 68 knots, no more flaps',
  p1Flaps: 'High enough: flaps 20 now (press F until 20°)',
  p1High: 'Still high: flaps 30 now (press F to 30°)',
  p1Final: 'On final: hold 68, aim just before the blocks',
  p1Runway: 'Over the runway: ease the nose up, touch on the blocks',
};
Object.assign(DRILL_TEXT, P180_TEXT);
Object.assign(TOUCH_WORDS, { p1Flaps: 'High enough: tap FLAPS until 20°', p1High: 'Still high: tap FLAPS to 30°' });

const wrap180 = (d) => ((d % 360) + 540) % 360 - 180;
const deg = (rad) => rad * 180 / Math.PI;

// stalled: the wing went past its stall angle above the flare height; live: flying has started (p180Step).
export const createDeadStick = (t0) => ({ t0, spot: true, stalled: false, live: false });

// The geometry the coach and Kid's guide need, into a reused object (no allocation per frame).
// s: { aglFt, x, z (sim m), trackDeg, flaps (index), windX, windZ (the air's motion, m/s), tasMps }.
//   pastSpotM: along 16's centreline past the spot (− before it); crossM: right of it (+);
//   lined: lined up on final for 16 before the spot; overRunway; toSpotFt: height above a glide
//   straight to the aim before the spot (flaps up; lined up, the flaps out; the wind's);
//   nextFlapsFt: the same with the next notch (20, then 30); viaFinalFt: above a glide to the short final's
//   start and down it with flaps 20; spotRelDeg: the spot off your track (+ right); aimRelDeg: the
//   track that flies the base leg and the final (90° across the centreline, closing on it) off yours.
const _g = { pastSpotM: 0, crossM: 0, lined: false, overRunway: false, toSpotFt: 0, nextFlapsFt: 0, viaFinalFt: 0, spotRelDeg: 0, aimRelDeg: 0 };
const legWind = (s, dx, dz) => Math.max(0.4, Math.min(1.5, 1 + ((s.windX ?? 0) * dx + (s.windZ ?? 0) * dz) / Math.max(20, s.tasMps ?? 35)));
export function spotGeometry(s) {
  const g = _g;
  const rx = s.x - SPOT_X, rz = s.z - SPOT_Z;
  g.pastSpotM = rx * D.x + rz * D.z;
  g.crossM = rx * -D.z + rz * D.x;
  // The wind on each leg (groundspeed over airspeed): the base across to the centreline, the final down it.
  const side = g.crossM < 0 ? 1 : -1;
  const wBase = legWind(s, -D.z * side, D.x * side), wFinal = legWind(s, D.x, D.z);
  const r0 = RATIO_BY_FLAPS[0] * wBase, r20 = RATIO_BY_FLAPS[2] * wFinal, rNow = RATIO_BY_FLAPS[s.flaps ?? 0] * wFinal;
  const along = g.pastSpotM + SPOT_M; // past the landing threshold
  g.overRunway = along > -END.displacedM - 30 && along < END.lengthM - END.displacedM && Math.abs(g.crossM) < END.widthM / 2 + 30;
  g.lined = Math.abs(wrap180(s.trackDeg - END.hdgT)) <= 30 && g.pastSpotM < 0 && Math.abs(g.crossM) < Math.max(60, -g.pastSpotM * 0.2);
  const distM = Math.hypot(s.x - AIM_X, s.z - AIM_Z);
  g.toSpotFt = s.aglFt - distM * M_TO_FT / (g.lined ? rNow : r0);
  // The way round: a base leg across to the centreline and the final down it (the corners cut).
  const pastAimM = g.pastSpotM + FLOAT_M;
  const flapsM = Math.min(FINAL_M, Math.max(0, -pastAimM));
  g.viaFinalFt = s.aglFt - (Math.abs(g.crossM) * M_TO_FT / r0) - (Math.abs(pastAimM) - flapsM) * M_TO_FT / (RATIO_BY_FLAPS[0] * wFinal) - flapsM * M_TO_FT / r20;
  // With the next notch out from here on (lined up: straight to the aim; else the way round).
  const rNext = RATIO_BY_FLAPS[(s.flaps ?? 0) < 2 ? 2 : 3];
  g.nextFlapsFt = s.aglFt - (g.lined ? distM / (rNext * wFinal) : Math.abs(g.crossM) / (rNext * wBase) + Math.abs(pastAimM) / (rNext * wFinal)) * M_TO_FT;
  g.spotRelDeg = wrap180(deg(Math.atan2(SPOT_X - s.x, -(SPOT_Z - s.z))) - s.trackDeg);
  // The track that flies it: 90° across the centreline far out, closing on it as the gap shrinks.
  g.aimRelDeg = wrap180(END.hdgT + Math.max(-90, Math.min(90, -g.crossM * CLOSE_DEG_PER_M)) - s.trackDeg);
  return g;
}

// The coach's prompt key for one moment (null below the flare height: coach.js has it).
// s: spotGeometry's input plus t (s since the failure), iasKts, kid and turned (the coach has
// said turn: from then on it guides the turn, it does not take it back).
export function power180Target(s) {
  if (s.t < DS_FAIL_S) return s.kid ? 'p1KidFail' : 'p1Fail';
  if (s.aglFt < DS_FLARE_FT) return null;
  if (s.kid) return 'p1Kid';
  const g = spotGeometry(s);
  if (s.iasKts < (s.flaps ? DS_SLOW_FLAPS_KTS : DS_SLOW_KTS)) return 'p1Slow';
  if (s.iasKts > DS_FAST_KTS) return 'p1Fast';
  if (g.lined || g.overRunway) {
    // Low on final (a little margin, so a gust after the flaps doesn't flip it): no more flaps.
    if (g.toSpotFt < -LOW_FT && g.pastSpotM < 0) return 'p1LowF';
    if (s.flaps < 3 && g.nextFlapsFt > FLAPS_FT && g.pastSpotM < 0) return s.flaps < 2 ? 'p1Flaps' : 'p1High';
    return g.overRunway ? 'p1Runway' : 'p1Final';
  }
  if (g.toSpotFt < 0) return 'p1Low';
  if (!s.turned && g.viaFinalFt > TURN_FT) return g.spotRelDeg < 0 ? 'p1WaitL' : 'p1WaitR';
  if (Math.abs(g.aimRelDeg) > 30) return s.turned ? (g.aimRelDeg < 0 ? 'p1KeepL' : 'p1KeepR') : g.aimRelDeg < 0 ? 'p1TurnL' : 'p1TurnR';
  if (s.flaps < 3 && g.nextFlapsFt > FLAPS_FT) return s.flaps < 2 ? 'p1Flaps' : 'p1High';
  return 'p1Base';
}

// main.js's calls: the input from the sim (reused), the prompt, Kid's guide, the per-frame step.
const _in = { t: 0, iasKts: 0, aglFt: 0, x: 0, z: 0, trackDeg: 0, flaps: 0, windX: 0, windZ: 0, tasMps: 35, kid: false, turned: false };
function input(st, sim) {
  _in.t = sim.simTime - st.t0; _in.iasKts = sim.iasKts; _in.aglFt = sim.aglFt;
  _in.x = sim.pos.x; _in.z = sim.pos.z;
  _in.trackDeg = (deg(Math.atan2(sim.vel.x, -sim.vel.z)) + 360) % 360;
  _in.flaps = sim.flapsIndex; _in.windX = sim.windVec?.x ?? 0; _in.windZ = sim.windVec?.z ?? 0; _in.tasMps = sim.tasKts * 0.514444;
  _in.kid = sim.assist === 'kid'; _in.turned = !!st.turned;
  return _in;
}
export function deadStickPrompt(st, sim) {
  const p = power180Target(input(st, sim));
  if (p === 'p1TurnL' || p === 'p1TurnR' || p === 'p1Base') st.turned = true;
  if (st.turned) st.turnT ??= _in.t;
  // "Turn left now" stays up a few seconds before it becomes "keep turning".
  if (_in.t - (st.turnT ?? _in.t) < KEEP_S) return p === 'p1KeepL' ? 'p1TurnL' : p === 'p1KeepR' ? 'p1TurnR' : p;
  return p;
}

// Kid's hands-off guide: best glide's path (deadStick.js), wings level down the downwind until
// the turn, round toward the spot, the localizer's line-up on final, and Kid's flaps 20 when the
// coach would ask for them (Kid's flaps are the plane's).
export function kidGuide(st, sim, out) {
  out.guideGammaDeg = kidGlideGammaDeg(sim.iasKts);
  const s = input(st, sim), g = spotGeometry(s);
  if (g.lined || g.overRunway) {
    out.guideBankDeg = bankCommandForHeading(g.aimRelDeg);
    if (s.kid && s.aglFt > DS_FLARE_FT && sim.flapsIndex < 3 && g.nextFlapsFt > FLAPS_FT) sim.flapsIndex = sim.flapsIndex < 2 ? 2 : 3;
  } else {
    if (g.viaFinalFt <= (s.kid ? KID_TURN_FT : TURN_FT) || g.toSpotFt < 0) st.turned = true;
    if (s.kid && st.turned && Math.abs(g.aimRelDeg) <= 30 && sim.flapsIndex < 3 && g.nextFlapsFt > FLAPS_FT) sim.flapsIndex = sim.flapsIndex < 2 ? 2 : 3;
    out.guideBankDeg = st.turned ? bankCommandForHeading(g.aimRelDeg) : 0;
  }
  return out;
}

// Every frame (main.js), live: the player is flying (the start screen is gone, no menu open).
// Until the first live frame the Cessna is held where it spawned, so the start screen does not
// glide it off the abeam point, and the engine quits (the coach's clock starts) as flying starts.
// Then a stall above the flare height is remembered for the card.
export function p180Step(st, sim, live = true) {
  st.kid = sim.assist === 'kid';
  if (!st.live) {
    if (live) { st.live = true; st.t0 = sim.simTime; return; }
    // The mission's spawn point and height (this chunk can arrive a second or two after the spawn,
    // on a slow link: the Cessna has glided on meanwhile), with the velocity and attitude it has.
    const h = st.hold ??= { p: [SPAWN.pos[0], sim.pos.y + (SPAWN.aglFt - sim.aglFt) / M_TO_FT, SPAWN.pos[1]], v: [sim.vel.x, sim.vel.y, sim.vel.z], q: [sim.quat.x, sim.quat.y, sim.quat.z, sim.quat.w] };
    sim.pos.set(...h.p); sim.vel.set(...h.v); sim.quat.set(...h.q); sim.angVel.set(0, 0, 0);
    sim.aoaPrevRad = null; sim.aoaRateF = 0; // a teleport: no α-rate from the old α (flightModel.js Cmα̇, 0202)
    sim.gateVsFpm = null; // nor the old sink rate at the stabilized gate (aero.js gateVsStep)
    st.t0 = sim.simTime;
    return;
  }
  const dt = sim.simTime - (st.lastT ?? sim.simTime);
  st.lastT = sim.simTime;
  // Past the stall angle for STALL_S (a gust's single frame is not a stall).
  st.stallS = sim.aglFt > DS_FLARE_FT && sim.aoaDeg > stallAoaDeg(sim.spec, sim.flapsIndex) ? (st.stallS ?? 0) + dt : 0;
  if (st.stallS >= STALL_S) st.stalled = true;
  // The nose against the track while airborne (+ = nose right): its last value is the touchdown's.
  if (!sim.onGround && sim.quat) {
    const { x, y, z, w } = sim.quat;
    const nose = -deg(Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y)));
    st.driftDeg = wrap180(nose - deg(Math.atan2(sim.vel.x, -sim.vel.z)));
  }
}
const STALL_S = 0.5;

// The grade. Off the pavement (or the wrong way, on 34): the dead-stick's card (a D at best, how
// far and which way). On 16's pavement the spot is half the score and the touchdown (landing.js:
// rate, centreline, flare, speed; its zone is the spot's job; and the ACS's "no side drift,
// longitudinal axis aligned": the nose against the track) the other half. Both sides of the window
// fail the test: just short is a C at best (C to D further short), just past it a B at best (the
// spot's marks falling away), and the card says how far. A stall on the approach is a D at best.
// A crash stays a crash.
const SHORT_CAP = 69; // the top of a C
const LONG_CAP = 84; // the top of a B
const STALL_CAP = 54; // the top of a D
const W_SPOT = 0.5;
const TD_WEIGHTS = { rate: 0.35, centreline: 0.2, flare: 0.15, speed: 0.1, align: 0.1 };
const ftText = (ft) => `${Math.max(1, Math.round(ft)).toLocaleString('en-US')} ft`;
export const spotScore = (pastFt) => (pastFt < 0 ? curve(-pastFt, [[0, 60], [100, 40], [300, 0]]) : curve(pastFt, [[BEYOND_FT, 100], [250, 70], [400, 40], [800, 0]]));

export function deadStickResult(landing, end, pos, st = null) {
  const base = deadStickResult0(landing, end, pos);
  if (base) return base;
  const pastFt = ((pos.x - SPOT_X) * D.x + (pos.z - SPOT_Z) * D.z) * M_TO_FT;
  const spot = Math.round(spotScore(pastFt));
  const factors = [{ key: 'spot', label: 'The spot', value: pastFt < 0 ? `${ftText(-pastFt)} short` : `${ftText(pastFt)} past`, score: spot },
    ...landing.factors.filter((f) => f.key !== 'zone')];
  if (typeof st?.driftDeg === 'number') {
    const d = Math.abs(st.driftDeg);
    factors.push({ key: 'align', label: 'Nose along the track', value: `${d.toFixed(1)}° off`, score: Math.round(curve(d, [[0, 100], [3, 100], [10, 30], [15, 0]])) });
  }
  // The strip shades the ACS window past the spot (touchdownStrip.js zoneM).
  const touchdown = landing.touchdown && { ...landing.touchdown, zoneM: [SPOT_M, SPOT_M + BEYOND_FT / M_TO_FT] };
  const out = { ...landing, title: 'Power-off 180', factors, touchdown, pastSpotFt: Math.round(pastFt) };
  if (landing.grade === 'CRASH') return out;
  let w = 0, td = 0;
  for (const f of factors) if (TD_WEIGHTS[f.key]) { td += f.score * TD_WEIGHTS[f.key]; w += TD_WEIGHTS[f.key]; }
  let score = Math.round(spot * W_SPOT + (w ? td / w : 0) * (1 - W_SPOT));
  let reason = null;
  if (pastFt < 0) {
    score = Math.min(score, SHORT_CAP);
    reason = st?.kid ? `Short of the spot by ${ftText(-pastFt)}.` : `Short of the spot by ${ftText(-pastFt)}: the test fails that. Turn sooner, or flaps later.`;
  } else if (pastFt > BEYOND_FT) {
    score = Math.min(score, LONG_CAP);
    reason = st?.kid ? `${ftText(pastFt)} past the spot.` : `${ftText(pastFt)} past the spot (the test allows 200): turn later, or flaps sooner.`;
  }
  if (st?.stalled) {
    score = Math.min(score, STALL_CAP);
    reason = 'Stalled on the way down: keep 68 knots in the turn.';
  }
  out.score = score;
  out.grade = letterGrade(score);
  out.reason = reason;
  out.note = !reason ? 'On the spot with the engine out' : null;
  return out;
}

// The dead-stick's card when the wheels are off 16's pavement (missed, or landed on 34), else null.
function deadStickResult0(landing, end, pos) {
  const ds = dsResult(landing, end, pos);
  return ds.madeRunway && end.id === END.id ? null : { ...ds, title: 'Power-off 180', reason: end.id === END.id ? ds.reason : 'Landed on 34, the wrong way: the spot is on 16.', grade: ds.grade === 'CRASH' ? 'CRASH' : 'D', score: Math.min(ds.score, STALL_CAP) };
}
