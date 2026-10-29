// Engine failure after takeoff (ticket 0104): the "impossible turn". The Cessna takes off from
// Addison 16 and the engine quits at a set height (300 or 900 ft AGL). Below the height a turn
// back to the runway needs, land ahead; above it, the turn can be made. FAA Airplane Flying
// Handbook (FAA-H-8083-3C, ch. 18, emergency approaches and landings): before a safe
// maneuvering altitude "it is usually inadvisable to attempt to turn back"; AC 61-83J asks for
// when and how a 180° turnback can be made; the FAA Safety Team handout (Engine Failure on
// Takeoff, 2016) notes the return needs well over 180° of turn once the turn radius is
// counted. POH Section 3: "Airspeed 68 KIAS (best glide)". Pure: no THREE, no DOM. Tested in
// tests/unit/engineOut.test.js and flown headless in tests/flight/engineOut.test.js.
import { runwayEnd } from './airports.js';
import { letterGrade } from './landing.js';
import { M_TO_FT } from './constants.js';
import { DRILL_TEXT } from './coach.js';
import { DS_GLIDE_KTS, DS_RATIO_BY_FLAPS, DS_SLOW_KTS, DS_FAIL_S, DS_FLARE_FT, kidGlideGammaDeg, landingEnd, missM, missText, missWay } from './deadStick.js';

export { landingEnd };
export const EO_PLACE_NAME = 'Addison · engine failure after takeoff';
const G = 9.81;
// The turn back: 180° to the reciprocal leaves you two turn radii (2R) beside the runway, so
// the turn goes on by the angle that cuts back to its threshold, atan(2R / distance), and that
// angle again to line up: well over 180° close in (the FAA handout's point), ~200° far out.
// At the bank the assist level allows, up to the Handbook's 45°.
export const EO_BANK_DEG = 45;
// Before the first input: the moment it takes to see the engine has quit.
export const EO_REACT_S = 1;
// The coach says "you can turn back" only with this much height to spare over the need (a turn
// that makes it by a few feet is not a plan).
export const EO_MARGIN_FT = 25;
// Turned back: the track more than this far off the runway's heading ("land ahead" allows
// small turns to pick a field; the coach calls past EO_TURN_FROM_DEG a turn). Back: within this
// of the reciprocal.
// The turn's cost is the height lost from the track first EO_TURN_FROM_DEG off the runway's
// heading to the track within EO_BACK_DEG of the reciprocal (or the touchdown).
export const EO_TURNED_DEG = 120; // a 60-90° turn to a field is still landing ahead
export const EO_TURN_FROM_DEG = 30;
export const EO_BACK_DEG = 30;
// Landed ahead off the runway: survived, but a field is not a runway. The best is a B.
const FIELD_CAP = 84;
const WRONG_CAP = 54; // the top of a D

const E16 = runwayEnd('KADS', '16');
const E34 = runwayEnd('KADS', '34');
const D16 = { x: Math.sin(E16.hdgT * Math.PI / 180), z: -Math.cos(E16.hdgT * Math.PI / 180) };
const wrap180 = (d) => ((d % 360) + 540) % 360 - 180;
const deg = (rad) => rad * 180 / Math.PI;

// The height (ft) a turn back to the runway needs from here: the reaction second gliding
// straight, the turn, then the glide back to the runway's far threshold over the ground, less
// the height the climb's extra speed buys on the way down to best glide ((v² - vg²) / 2g).
// The turn (see above): at constant airspeed a bank's load factor n raises the induced drag by n², so the
// sink grows by 1 + k(n² - 1), k the induced share of the drag at best glide (0.5 for a
// parabolic polar; the C172's flightModel.js sinks ~1.36x at 45° and 68 KIAS, k = EO_INDUCED,
// a card in tests/flight/engineOut.test.js). The glide back is downwind: a headwind on the
// takeoff stretches it over the ground, and drifts the turn back towards the runway.
//   distBackM: how far past the far threshold (0 still over the runway); ratio: the glide ratio
//   through the air; tasMps: now; glideTasMps: best glide's; bankDeg; headwindMps: the wind
//   down the takeoff runway (+ head).
export const EO_INDUCED = 0.35;
export function turnbackHeightFt({ distBackM, ratio, tasMps, glideTasMps = tasMps, bankDeg = EO_BANK_DEG, headwindMps = 0 }) {
  const phi = Math.max(10, Math.min(60, bankDeg)) * Math.PI / 180;
  const v = glideTasMps;
  const sinkMps = v / ratio;
  const turnSinkMps = sinkMps * (1 + EO_INDUCED * (1 / Math.cos(phi) ** 2 - 1));
  const twoR = 2 * v * v / (G * Math.tan(phi));
  const cutRad = Math.atan2(twoR, Math.max(0, distBackM));
  const turnS = (Math.PI + 2 * cutRad) * v / (G * Math.tan(phi));
  const backM = Math.hypot(Math.max(0, distBackM - headwindMps * (EO_REACT_S + turnS)), twoR);
  const backRatio = ratio * Math.max(0.4, (v + headwindMps) / v);
  const energyM = Math.max(0, tasMps * tasMps - v * v) / (2 * G);
  return Math.max(0, sinkMps * EO_REACT_S + turnSinkMps * turnS + backM / backRatio - energyM) * M_TO_FT;
}

// How far the point is past runway 34's threshold (16's far end), along 16 (0 over the runway).
export const distPastRunwayM = (x, z) => Math.max(0, (x - E34.thrX) * D16.x + (z - E34.thrZ) * D16.z);

export const EO_TEXT = {
  eoClimb: 'Climb out at 74 knots, and be ready: the engine will quit',
  eoFail: `Engine failure! Nose down, ${DS_GLIDE_KTS} knots, land ahead`,
  eoFailTurn: `Engine failure! Nose down, ${DS_GLIDE_KTS} knots: you can turn back`,
  eoAhead: 'Too low to turn back: land ahead, small turns only',
  eoCanTurn: 'High enough to turn back: steep turn, nose down',
  eoTurning: `Keep turning: 45° bank, ${DS_GLIDE_KTS} knots, nose down`,
  eoTooLow: 'Too low for this turn: wings level, land ahead',
  eoLineUp: 'Line up with the runway and land it',
  eoSlow: `Slow: lower the nose, ${DS_GLIDE_KTS} knots`,
  eoKidFail: 'Engine stopped! Let go: the plane glides ahead',
  eoKid: 'No engine: the plane glides down ahead',
};
Object.assign(DRILL_TEXT, EO_TEXT);

export const createEngineOut = (mission) => ({
  failFt: mission.engineOutFt, rolled: false, failed: false, t0: 0, turnbackFt: 0, canTurn: false,
  turned: false, turnFromFt: 0, startFt: null, back: false, costFt: 0, stalled: false,
});

// The live geometry for one step, into a reused object. s: { t, aglFt, x, z, trackDeg, iasKts,
// tasKts, aoaDeg, stallAoaDeg, flaps, headwindKts, bankMaxDeg, kid, onGround }.
const _g = { offDeg: 0, needFt: 0 };
const _tb = { distBackM: 0, ratio: 9, tasMps: 0, glideTasMps: 0, bankDeg: EO_BANK_DEG, headwindMps: 0 };
function geometry(s) {
  _g.offDeg = wrap180(s.trackDeg - E16.hdgT);
  const tas = Math.max(25, s.tasKts * 0.514444);
  _tb.distBackM = distPastRunwayM(s.x, s.z); _tb.ratio = DS_RATIO_BY_FLAPS[s.flaps ?? 0]; _tb.tasMps = tas;
  _tb.glideTasMps = s.iasKts > 20 ? tas * DS_GLIDE_KTS / s.iasKts : tas;
  _tb.bankDeg = Math.min(EO_BANK_DEG, s.bankMaxDeg ?? EO_BANK_DEG);
  _tb.headwindMps = (s.headwindKts ?? 0) * 0.514444;
  _g.needFt = turnbackHeightFt(_tb);
  return _g;
}

// One step: fails the engine at its height (returns true that step), then watches the turn.
export function stepEngineOut(st, s) {
  if (!st.failed) {
    if (s.onGround) st.rolled = true; // a chunk that loads in the air never fails the engine there
    if (!st.rolled || s.onGround || s.aglFt < st.failFt) return false;
    st.failed = true; st.t0 = s.t;
    st.turnbackFt = geometry(s).needFt;
    st.canTurn = s.aglFt >= st.turnbackFt + EO_MARGIN_FT;
    return true;
  }
  if (s.onGround) return false;
  const off = Math.abs(geometry(s).offDeg);
  if (st.startFt === null && off > EO_TURN_FROM_DEG) st.startFt = s.aglFt;
  if (!st.turned && off > EO_TURNED_DEG) { st.turned = true; st.turnFromFt = st.startFt; }
  if (st.startFt !== null) {
    if (!st.back) st.costFt = Math.max(0, st.startFt - s.aglFt);
    if (off > 180 - EO_BACK_DEG) st.back = true;
  }
  if (s.aoaDeg > s.stallAoaDeg && s.aglFt > DS_FLARE_FT) st.stalled = true; // not a full-stall flare
  return false;
}

// The coach's prompt (null on the ground and below the flare height: coach.js has those).
export function engineOutTarget(st, s) {
  if (s.onGround) return null;
  if (!st.failed) return 'eoClimb';
  if (s.t - st.t0 < DS_FAIL_S) return s.kid ? 'eoKidFail' : st.canTurn ? 'eoFailTurn' : 'eoFail';
  if (s.aglFt < DS_FLARE_FT) return null;
  if (s.kid) return 'eoKid';
  if (s.iasKts < DS_SLOW_KTS) return 'eoSlow';
  // Straight ahead: whether a turn from here still makes it. In the turn: whether it could
  // from where the engine quit (from inside the turn, "a whole turn from here" is not the question).
  const g = geometry(s), off = Math.abs(g.offDeg);
  if (off > 180 - EO_BACK_DEG) return 'eoLineUp';
  if (st.canTurn && off > EO_TURN_FROM_DEG / 2) return 'eoTurning';
  if (!st.canTurn && st.startFt !== null) return 'eoTooLow';
  return s.aglFt >= g.needFt + EO_MARGIN_FT ? 'eoCanTurn' : 'eoAhead';
}

// main.js's calls, with the input built from the sim here (reused; the chunk, not boot, pays).
// The stall angle by flap notch is aero.js stallAoaDeg's (the C172's table has every notch).
const _in = { t: 0, aglFt: 0, x: 0, z: 0, trackDeg: 0, iasKts: 0, tasKts: 0, aoaDeg: 0, stallAoaDeg: 0, flaps: 0, headwindKts: 0, bankMaxDeg: EO_BANK_DEG, kid: false, onGround: false };
function input(sim) {
  _in.t = sim.simTime; _in.aglFt = sim.aglFt; _in.x = sim.pos.x; _in.z = sim.pos.z;
  _in.trackDeg = sim.onGround ? E16.hdgT : (deg(Math.atan2(sim.vel.x, -sim.vel.z)) + 360) % 360;
  _in.iasKts = sim.iasKts; _in.tasKts = sim.tasKts; _in.aoaDeg = sim.aoaDeg; _in.flaps = sim.flapsIndex;
  _in.stallAoaDeg = sim.spec.alphaStallDegByFlap?.[sim.flapsIndex] ?? sim.spec.alphaStallDeg;
  _in.headwindKts = -(sim.windVec.x * D16.x + sim.windVec.z * D16.z) / 0.514444; // the air's motion
  _in.kid = sim.assist === 'kid';
  _in.bankMaxDeg = _in.kid ? 30 : EO_BANK_DEG; // assists.js: Kid's bank limit
  _in.onGround = sim.onGround;
  return _in;
}
export const engineOutStep = (st, sim) => stepEngineOut(st, input(sim));
export const engineOutPrompt = (st, sim) => engineOutTarget(st, input(sim));

// Kid's hands-off guide: best glide, wings level, ahead (main.js applyAssists).
export function kidGuide(sim, out) {
  out.guideGammaDeg = kidGlideGammaDeg(sim.iasKts);
  out.guideBankDeg = 0;
  return out;
}

// The turn back for a pilot that makes it (the flight cards): the bank (+ right) that flies
// to a point `leadM` ahead along 34's centreline (on the runway, if high: not past 600 m from its end), turning left from behind it (16's traffic is a
// left pattern), at most bankDeg. trackDeg: the ground track.
export function turnbackBankDeg(x, z, trackDeg, bankDeg = EO_BANK_DEG, leadM = 400) {
  const along = (x - E34.thrX) * -D16.x + (z - E34.thrZ) * -D16.z; // − before 34's threshold
  const aim = Math.min(along + leadM, E34.lengthM - 600); // down the runway, a stop's room left
  const ax = E34.thrX - D16.x * aim, az = E34.thrZ - D16.z * aim;
  let err = wrap180(deg(Math.atan2(ax - x, -(az - z))) - trackDeg);
  if (err > 150) err -= 360;
  return Math.max(-bankDeg, Math.min(bankDeg, err * 1.5));
}

// The result: the decision (30%), the landing (70%). Turned back below the height it needed,
// or stalled in the turn: a D at best, with what the turn cost. Ahead off the runway: a B at
// best (a field is not a runway, but it was the right call). A crash stays a crash.
export function engineOutResult(landing, st, end, pos) {
  const miss = missM(end, pos);
  const made = miss <= 0;
  const wrong = st.turned && st.turnFromFt < st.turnbackFt;
  const decision = st.turned
    ? { key: 'decision', label: 'Decision', value: `turned back from ${Math.round(st.turnFromFt)} ft (needs ${Math.round(st.turnbackFt)})`, score: wrong ? 0 : 100 }
    : { key: 'decision', label: 'Decision', value: 'landed ahead', score: 100 };
  const touchdown = made ? landing.factors : landing.factors.filter((f) => f.key === 'rate' || f.key === 'speed');
  const factors = [decision,
    { key: 'made', label: 'Runway', value: made ? 'made it' : `missed by ${missText(miss)}`, score: made ? 100 : 0 },
    ...touchdown];
  const out = { ...landing, title: 'Engine failure after takeoff', factors, madeRunway: made, turnedBack: st.turned, costFt: Math.round(st.costFt) };
  const cost = `The turn cost you ${Math.round(st.costFt)} ft.`;
  if (landing.grade === 'CRASH') {
    if (st.stalled) out.reason = st.startFt !== null ? `Stalled in the turn back. ${cost}` : `Stalled: lower the nose, ${DS_GLIDE_KTS} knots, even this close to the ground.`;
    else if (wrong) out.reason = `${landing.reason ?? 'Crashed.'} Turned back from ${Math.round(st.turnFromFt)} ft: land ahead below ${Math.round(st.turnbackFt)} ft.`;
    return out;
  }
  const land = made ? landing.score
    : Math.round(touchdown.reduce((a, f) => a + f.score, 0) / Math.max(1, touchdown.length));
  let score = Math.round(decision.score * 0.3 + land * 0.7);
  out.reason = null;
  out.note = null;
  if (st.stalled) {
    score = Math.min(score, WRONG_CAP);
    out.reason = st.startFt !== null ? `Stalled in the turn back: lower the nose. ${cost}` : `Stalled: lower the nose, ${DS_GLIDE_KTS} knots, even this close to the ground.`;
  } else if (wrong) {
    score = Math.min(score, WRONG_CAP);
    out.reason = `Turned back from ${Math.round(st.turnFromFt)} ft, below the ${Math.round(st.turnbackFt)} ft it needs: land ahead. ${cost}`;
  } else if (!made) {
    score = Math.min(score, st.turned ? WRONG_CAP : FIELD_CAP);
    if (st.turned) out.reason = `Missed the runway by ${missText(miss)} (${missWay()}). ${cost}`;
    else out.note = 'Landed ahead in a field: the right call this low';
  } else {
    out.note = st.turned ? 'Turned back and made the runway' : 'Landed ahead on the runway';
  }
  out.score = score;
  out.grade = letterGrade(score);
  return out;
}
