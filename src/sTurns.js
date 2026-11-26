// S-turns across a road (ticket 0224, a lazy chunk loaded with the mission `s_turns_road`): the Cessna at 1,000 ft AGL
// crosses an east-west road at a right angle with a 12 kt south wind behind it, then flies four half-circles of equal
// radius, left, right, left, right, each one ending back over the road with the wings level.
// Source: FAA Airplane Flying Handbook (FAA-H-8083-3C) ch. 7, Ground Reference Maneuvers, S-Turns (pp. 7-8 to 7-10):
// "the airplane's ground track resembles two opposite but equal half-circles on each side of a selected ground-based
// straight-line reference"; "With the airplane in the downwind position, the maneuver consists of crossing a straight-
// line ground reference at a 90° angle and immediately beginning a 180° constant-radius turn"; "the angle of bank should
// be steepest when initiating the turn. As the turn progresses, the bank angle and the rate of rollout should be
// decreased as the groundspeed decreases"; "adjust the rollout timing so that the wings become level just as the
// airplane crosses the straight-line ground reference"; "there should be no delay in rolling out from one turn and
// rolling into the next turn ... the roll in should be smooth and gentle and the initial bank angle should be shallow";
// "If the straight-line ground reference is of sufficient length, the pilot may complete as many as can be safely
// accomplished" (four here). The chapter's general rules: "between 600 and 1,000 feet AGL" (p. 7-2), no "bank angle of
// 45°" or more (p. 7-1), and the bank for a constant radius is tan φ = Vg² / (g R) (p. 7-3's worked example).
// FAA-S-ACS-6C (Nov 2023) Area V Task B: S3 the entry 600 to 1,000 ft AGL, S7 "Maintain altitude ±100 feet; maintain
// airspeed ±10 knots"; it sets no number for the radius. The game's own: the 1,500 ft radius (0211's circle), the road
// marked by five lit poles where the crossings fall (3C names a road, a fence or a railroad), the radius bands (0211's),
// and "wings level at the crossing" scored by the bank there (3C: "the wings become level just as the airplane crosses").
// Pure but for makeMarker (aroundPoint.js's three classes: no new boot export). Tested in tests/unit/sTurns.test.js and
// flown headless in tests/flight/sTurns.test.js.
import * as THREE from 'three';
import { curve, letterGrade } from './landing.js';
import { DRILL_TEXT, RANK, TOUCH_WORDS } from './coach.js';
import { stallAoaDeg } from './aero.js';
import { lessonWx, MAX_BANK_DEG, ALT_TOL_FT, KTS_TOL, SPREAD_B_FT, SPREAD_D_FT, IAS_TAU_S, STEEP_HOLD_S, ASSIST_BANK_DEG,
  SAY_OFF_M, TRACK_MAX, TRACK_DT_S, KP, KD, ACS_CAP, LOST_CAP } from './aroundPoint.js';
import { M_TO_FT, FT_TO_M, GRAVITY } from './constants.js';

export { lessonWx, MAX_BANK_DEG, ASSIST_BANK_DEG, SPREAD_B_FT, SPREAD_D_FT };
export const S_KEY = 's_turns_road';
export const PLACE = { name: 'Fields north-west of Alliance · 1,000 ft' };
export const SNAP = 'sTurns'; // openaeroDebug's field
export const HALVES = 4;
export const SPREAD_C_FT = 250; // wider than this: no better than a C
export const OFF_FT = 300; // the average radius this far from the one asked: no better than a B
export const CROSS_B_DEG = 10; // banked more than this over the road: no better than a B (3C: wings level as it crosses)
export const LOST_R = 3; // this many radii from the half-circle's middle: drifted away
export const SHALLOW_R = 1 / 3; // a half-circle that never got this far from the road: crossed back too soon
export const FAIL_FT = 500;
export const FAIL_S = 300; // four half-circles take ~2 minutes
export const ENTRY_FAIL_S = 120;
export const ENTRY_OFF_R = 1; // the first crossing within this many radii of the first pole
// The roll-out: the bank is eased off over the last OUT_S seconds before the road, so the wings are level as it crosses.
export const OUT_S = 3, OUT_LEAD_S = 0.8; // the roll takes a moment: level OUT_LEAD_S before the road, ramped from OUT_S before that
// The coach's "road ahead: roll out" this long before the road; a half's roll-in word this long after the crossing.
export const SAY_OUT_S = 5;
export const ROLL_WORD_S = 6;

export const S_TEXT = {
  stFlyOn: 'Fly on, wings level: straight across the road at the first lit pole, at a right angle',
  stKidIn: 'Let go: the plane crosses the road and flies the S-turns',
  stKid: 'Watch: steep with the wind behind, shallow into it, wings level over the road',
  stRollLSteep: 'Over the road: roll left now, steep: the wind is behind you, fastest over the ground',
  stRollRSteep: 'Over the road: roll right now, steep: the wind is behind you, fastest over the ground',
  stRollLGentle: 'Over the road: roll left now, gently: into the wind you are slowest over the ground',
  stRollRGentle: 'Over the road: roll right now, gently: into the wind you are slowest over the ground',
  stRollL: 'Over the road: roll left now, a medium bank',
  stRollR: 'Over the road: roll right now, a medium bank',
  stShallower: 'Turning into the wind: ease the bank shallower as you come round',
  stSteeper: 'The wind is coming behind you: steepen the bank as you come round',
  stDown: 'Wind behind you: fastest over the ground, the steepest bank',
  stUp: 'Into the wind: slowest over the ground, the shallowest bank',
  stRollOut: 'Road ahead: roll the wings level just as you cross it, at the next lit pole',
  stWide: 'Swinging wide of the half-circle: steepen the bank',
  stClose: 'Inside the half-circle: ease the bank shallower',
  stLow: 'Sinking: a little back pressure, a little power',
  stHigh: 'Climbing: ease the back pressure',
  stSlow: 'Slowing: add power',
  stFast: 'Fast: ease off the power',
  stSteep: 'Over 45° of bank: shallower',
};
Object.assign(DRILL_TEXT, S_TEXT);
Object.assign(RANK, { stFlyOn: 1, stKidIn: 1, stKid: 1, stRollLSteep: 2, stRollRSteep: 2, stRollLGentle: 2, stRollRGentle: 2, stRollL: 2, stRollR: 2,
  stShallower: 1, stSteeper: 1, stDown: 1, stUp: 1, stRollOut: 2, stWide: 1, stClose: 1, stLow: 1, stHigh: 1, stSlow: 1, stFast: 1, stSteep: 2 });
// On the touch stick up is nose up (lesson 2026-11-24): "back pressure" means nothing there.
export const S_TOUCH = { stLow: 'Sinking: stick up a touch (nose up), a little power', stHigh: 'Climbing: stick down a touch (nose down)' };
Object.assign(TOUCH_WORDS, S_TOUCH);

const DEG = 180 / Math.PI;

// m: the mission ({ road: [x, z] (the first pole, on the road), radiusFt, wind: [fromDeg, kts], pos, aglFt, kias }).
// The road runs east-west through it; the S-turns go west along it (left first, north of the road). Allocates (a load).
let last = null; // the e2e hook's handle (openaeroDebugSTurns below)
export function createSTurns(m) {
  last = {
    kind: 'sTurns',
    phase: 'entry', x0: m.road[0], z0: m.road[1], R: m.radiusFt * FT_TO_M,
    live: false, hold: null, spawn: m, wx: lessonWx(m),
    t: 0, ct: 0, half: 0, ht: 0, xIn: 0, depth: 0, maxDepth: 0, d: 0, prevX: 0, prevZ: null, done: false,
    ck: '', alt0: null, kts0: m.kias, iasF: m.kias,
    maxAltDevFt: 0, altSignFt: 0, maxKtsDev: 0, maxBankDeg: 0, steepS: 0, maxCrossDeg: 0, crossDeg: [0, 0, 0, 0],
    w: 0, sum: 0, sumSq: 0, why: null, halfN: 0,
    track: new Float32Array(2 * TRACK_MAX), trackN: 0, trackStart: -1, trackT: 0,
  };
  return last;
}
export const create = createSTurns;

export const sLive = (st) => st.phase === 'entry' || st.phase === 'course';
export const live = sLive;

// Half k's side (−1: north of the road, a left turn; +1 south, a right turn) and its middle (x, on the road): the
// half-circles are anchored on the poles, 2R apart going west.
export const sideOf = (k) => (k % 2 === 0 ? -1 : 1);
export const centreX = (st, k) => st.x0 - (2 * k + 1) * st.R;

// Fold the half just ended into the radius's spread: each sample's distance from the half's own middle (half-way between
// its two crossings), so an even half-circle of the wrong size spreads no more than its size is off (graded apart).
function foldHalf(st, xOut) {
  const cx = (st.xIn + xOut) / 2 - st.x0;
  for (let i = st.halfN; i < st.trackN; i++) {
    const d = Math.hypot(st.track[2 * i] - cx, st.track[2 * i + 1]);
    st.w += 1; st.sum += d; st.sumSq += d * d;
  }
  st.halfN = st.trackN;
}

// One step. st is mutated (no allocation). s: { dt, x, z (sim metres, +x east, +z south), vx, vz (ground velocity, m/s),
// wx, wz (the wind, m/s), altFt, iasKts, bankDeg (+ right), stalled }. Returns 'course' | 'complete' | 'failed' | ''.
export function sStep(st, s) {
  if (st.phase === 'complete' || st.phase === 'failed') return '';
  const rx = s.x - st.x0, rz = s.z - st.z0;
  st.t += s.dt;
  st.trackT += s.dt;
  if (st.trackT >= TRACK_DT_S && st.trackN < TRACK_MAX) {
    st.trackT = 0;
    st.track[2 * st.trackN] = rx; st.track[2 * st.trackN + 1] = rz; st.trackN++;
  }
  const prevZ = st.prevZ, prevX = st.prevX;
  st.prevZ = rz; st.prevX = rx;
  // Where this step crossed the road (+z south: rz changes sign), interpolated; NaN if it did not.
  const crossed = prevZ !== null && (prevZ > 0) !== (rz > 0);
  const crossX = crossed ? prevX + (rx - prevX) * prevZ / (prevZ - rz) : NaN;
  if (st.phase === 'entry') {
    if (st.alt0 === null) st.alt0 = s.altFt;
    st.iasF = s.iasKts;
    st.depth = rz; // south of the road on the way in
    // The course starts as the Cessna crosses the road northbound near the first pole.
    if (crossed && rz <= 0 && Math.abs(crossX) <= ENTRY_OFF_R * st.R) {
      st.phase = 'course'; st.trackStart = Math.max(0, st.trackN - 1); st.halfN = st.trackStart;
      st.xIn = st.x0 + crossX; st.half = 0; st.ht = 0; st.maxDepth = 0;
      return 'course';
    }
    if (st.t < ENTRY_FAIL_S && !crossed && Math.hypot(rx, rz) < 3000) return '';
    st.why = 'missed'; st.phase = 'failed';
    return 'failed';
  }
  st.ct += s.dt;
  st.ht += s.dt;
  const side = sideOf(st.half);
  st.depth = side < 0 ? -rz : rz; // + out on the half's own side of the road
  st.maxDepth = Math.max(st.maxDepth, st.depth);
  st.d = Math.hypot(s.x - centreX(st, st.half), rz);
  const altDev = s.altFt - st.alt0;
  if (Math.abs(altDev) > st.maxAltDevFt) { st.maxAltDevFt = Math.abs(altDev); st.altSignFt = altDev; }
  st.iasF += (s.iasKts - st.iasF) * Math.min(1, s.dt / IAS_TAU_S);
  st.maxKtsDev = Math.max(st.maxKtsDev, Math.abs(st.iasF - st.kts0));
  const bank = Math.abs(s.bankDeg);
  st.maxBankDeg = Math.max(st.maxBankDeg, bank);
  if (bank > MAX_BANK_DEG + 2) st.steepS += s.dt;
  if (crossed) {
    // Back over the road: a half-circle done, the wings' bank there scored, the next one the other way.
    const xOut = st.x0 + crossX;
    st.crossDeg[st.half] = bank;
    st.maxCrossDeg = Math.max(st.maxCrossDeg, bank);
    if (xOut > st.xIn) return fail(st, 'wrongWay'); // turned east: the S goes west, left first
    if (st.maxDepth < SHALLOW_R * st.R) return fail(st, 'shallow');
    foldHalf(st, xOut);
    st.half++; st.ht = 0; st.xIn = xOut; st.maxDepth = 0; st.ck = '';
    if (st.half >= HALVES) { st.phase = 'complete'; return 'complete'; }
  }
  if (s.stalled) return fail(st, 'stall');
  if (st.d > LOST_R * st.R) return fail(st, 'drift');
  if (st.maxAltDevFt > FAIL_FT) return fail(st, 'height');
  if (st.ct > FAIL_S) return fail(st, 'time');
  if (st.done) { st.phase = 'complete'; return 'complete'; } // the e2e hook's fast-forward
  return '';
}
function fail(st, why) {
  st.why = why; st.phase = 'failed';
  return 'failed';
}

// The ground-track law (Kid's guide, the coach's sense of "wide"): the bank whose horizontal lift turns the ground
// velocity round the half's middle at the distance flown (Vt² / d, the handbook's tan φ = Vg² / (g R)), a spring back
// to the radius and damping on the outward speed (aroundPoint.js's gains), eased to wings level over the last OUT_S
// before the road. Before the course: wings level along the entry line, north to the first pole. Bank in degrees, + right.
export function sBankDeg(st, s) {
  if (st.phase === 'entry') {
    const want = -0.02 * (s.x - st.x0); // m/s east wanted: back to the line through the first pole
    return Math.max(-10, Math.min(10, 3 * (want - s.vx)));
  }
  const side = sideOf(st.half);
  const rx = s.x - centreX(st, st.half), rz = s.z - st.z0;
  const d = Math.max(1, Math.hypot(rx, rz));
  const vr = (s.vx * rx + s.vz * rz) / d; // + outward
  const vt2 = Math.max(0, s.vx * s.vx + s.vz * s.vz - vr * vr);
  const a = vt2 / d + KP * (d - st.R) + KD * vr;
  let mag = Math.max(-10, Math.min(MAX_BANK_DEG, Math.atan(a / GRAVITY) * DEG));
  // Closing on the road (past the half's middle): ease the bank off so it is level as it crosses.
  const depth = side < 0 ? -rz : rz, closing = side < 0 ? s.vz : -s.vz;
  if (closing > 1 && rx < 0) mag *= Math.min(1, Math.max(0, depth / closing - OUT_LEAD_S) / OUT_S);
  return side * mag;
}

const windBehind = (s) => {
  const w = Math.hypot(s.wx, s.wz), v = Math.hypot(s.vx, s.vz);
  return w < 1 || v < 1 ? 0 : (s.wx * s.vx + s.wz * s.vz) / (w * v);
};
// Whether the turn is bringing the wind round behind (+) or ahead (−): d(wind behind)/dψ for a turn of this side's way.
const windComing = (s, side) => {
  const v = Math.hypot(s.vx, s.vz);
  return v < 1 ? 0 : side * (-s.wx * s.vz + s.wz * s.vx) / v;
};

// The coach's word for this moment (coach.js s.ds). kid: the guide flies it. A half's roll-in word is chosen once, at
// its crossing, from the wind there (lesson 2026-11-24: never re-derived mid-roll), then the turn's own words.
export function sPrompt(st, s, kid) {
  if (st.phase === 'complete' || st.phase === 'failed' || !st.live) return null;
  if (kid) return st.phase === 'entry' ? 'stKidIn' : 'stKid';
  if (st.phase === 'entry') return 'stFlyOn';
  if (Math.abs(s.bankDeg) > MAX_BANK_DEG + 2) return 'stSteep';
  const side = sideOf(st.half), dir = side < 0 ? 'L' : 'R';
  if (st.ck === '') { const wb = windBehind(s); st.ck = wb > 0.5 ? 'Steep' : wb < -0.5 ? 'Gentle' : 'M'; }
  if (st.ht < ROLL_WORD_S && s.bankDeg * side < 10) return `stRoll${dir}${st.ck === 'M' ? '' : st.ck}`;
  const closing = side < 0 ? s.vz : -s.vz;
  if (closing > 1 && st.depth / closing < SAY_OUT_S && s.x < centreX(st, st.half)) return 'stRollOut';
  if (st.iasF < st.kts0 - KTS_TOL) return 'stSlow';
  const off = st.d - st.R;
  if (Math.abs(off) > 2 * SAY_OFF_M) return off > 0 ? 'stWide' : 'stClose';
  const altDev = s.altFt - st.alt0;
  if (altDev < -ALT_TOL_FT / 2) return 'stLow';
  if (altDev > ALT_TOL_FT / 2) return 'stHigh';
  if (off > SAY_OFF_M) return 'stWide';
  if (off < -SAY_OFF_M) return 'stClose';
  if (st.iasF < st.kts0 - KTS_TOL / 2) return 'stSlow';
  if (st.iasF > st.kts0 + KTS_TOL / 2) return 'stFast';
  const wb = windBehind(s);
  if (wb > 0.8) return 'stDown';
  if (wb < -0.8) return 'stUp';
  return windComing(s, side) > 0 ? 'stSteeper' : 'stShallower';
}

// Kid's hands-off guide (main.js applyAssists): the ground-track law, the flight path back to the entry height
// (aroundPoint.js's: banked, ask α(1 − cos φ) lower).
export function sKidGuide(st, s, out) {
  out.guideBankDeg = sBankDeg(st, s);
  const err = st.phase === 'course' ? st.alt0 - s.altFt : 0;
  out.guideGammaDeg = Math.max(-3, Math.min(3, err * 0.02)) - s.aoaDeg * (1 - Math.cos(s.bankDeg / DEG));
}

// The game's adapter (aroundPoint.js aroundSimStep's): held at the spawn until the first live frame.
const _s = { dt: 0, x: 0, z: 0, vx: 0, vz: 0, wx: 0, wz: 0, altFt: 0, iasKts: 0, bankDeg: 0, aoaDeg: 0, stalled: false };
export function sSimStep(st, sim, dt, isLive) {
  if (!st.live) {
    if (!isLive) {
      const m = st.spawn;
      const h = st.hold ??= { p: [m.pos[0], sim.pos.y + (m.aglFt - sim.aglFt) * FT_TO_M, m.pos[1]], v: [sim.vel.x, sim.vel.y, sim.vel.z], q: [sim.quat.x, sim.quat.y, sim.quat.z, sim.quat.w] };
      sim.pos.set(h.p[0], h.p[1], h.p[2]); sim.vel.set(h.v[0], h.v[1], h.v[2]); sim.quat.set(h.q[0], h.q[1], h.q[2], h.q[3]); sim.angVel.set(0, 0, 0);
      sim.aoaPrevRad = null; sim.aoaRateF = 0; // a teleport: no α-rate from the old α (flightModel.js Cmα̇, 0202)
      return '';
    }
    st.live = true;
  }
  const { x, y, z, w } = sim.quat;
  _s.dt = dt;
  _s.x = sim.pos.x; _s.z = sim.pos.z;
  _s.vx = sim.vel.x; _s.vz = sim.vel.z;
  _s.wx = sim.windVec.x; _s.wz = sim.windVec.z;
  _s.altFt = sim.pos.y * M_TO_FT;
  _s.iasKts = sim.iasKts;
  _s.bankDeg = -Math.atan2(2 * (x * y + w * z), 1 - 2 * (x * x + z * z)) * DEG;
  _s.aoaDeg = sim.aoaDeg;
  _s.stalled = sim.aoaDeg > stallAoaDeg(sim.spec, sim.flapsIndex);
  return sStep(st, _s);
}
export const simStep = sSimStep;
export const coachWord = (st, kid) => sPrompt(st, _s, kid);
export function kidGuide(st, out) {
  if (st.phase === 'complete' || st.phase === 'failed' || !st.live) return 0;
  sKidGuide(st, _s, out);
  return ASSIST_BANK_DEG;
}

// The HUD's readout (aroundPoint.js drawPole's slot and box): an arrow from the nose to the next lit pole (where the
// half-circle should cross back over the road), and the radius flown against the one asked, e.g. "RADIUS 1,480 / 1,500
// FT"; on the way in, the road's distance. The text is rebuilt only when its number changes (AGENTS.md invariant 4).
export const BOX_W = 232, BOX_H = 24;
let shownFt = -1, shownPhase = '', boxText = '';
export function nextPoleRelDeg(st, x, z, hdgTrueDeg) {
  const k = st.phase === 'entry' ? 0 : st.half + 1;
  const px = st.x0 - 2 * k * st.R;
  const brg = Math.atan2(px - x, -(st.z0 - z)) * DEG; // true bearing (+x east, −z north)
  return ((brg - hdgTrueDeg) % 360 + 360) % 360;
}
export function drawHud(ctx, cx, top, st, sim, hdgTrueDeg) {
  if (!sLive(st) || !st.live) return;
  const entry = st.phase === 'entry';
  const v = entry ? Math.max(0, sim.pos.z - st.z0) : st.d;
  const q = v > 2 * st.R ? 50 : 10;
  const ft = Math.round(v * M_TO_FT / q) * q;
  if (ft !== shownFt || st.phase !== shownPhase) {
    shownFt = ft; shownPhase = st.phase;
    boxText = entry ? `ROAD ${ft.toLocaleString('en-US')} FT` : `RADIUS ${ft.toLocaleString('en-US')} / ${Math.round(st.R * M_TO_FT).toLocaleString('en-US')} FT`;
  }
  ctx.fillStyle = 'rgba(2, 6, 23, 0.7)';
  ctx.fillRect(cx - BOX_W / 2, top, BOX_W, BOX_H);
  ctx.fillStyle = !entry && Math.abs(st.d - st.R) <= SAY_OFF_M ? '#6ee7b7' : '#fcd34d';
  ctx.save();
  ctx.translate(cx - BOX_W / 2 + 15, top + BOX_H / 2);
  ctx.rotate(nextPoleRelDeg(st, sim.pos.x, sim.pos.z, hdgTrueDeg) / DEG);
  ctx.beginPath();
  ctx.moveTo(0, -9); ctx.lineTo(6, 2); ctx.lineTo(2, 2); ctx.lineTo(2, 9); ctx.lineTo(-2, 9); ctx.lineTo(-2, 2); ctx.lineTo(-6, 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(boxText, cx + 10, top + 17);
}

// Five lit poles along the road, one at each crossing (the first and the four ends of the half-circles), built once per
// chunk and moved (0211's panel: a new mesh per load leaked its GPU buffers). seatMarker puts each on the ground.
export const POLES = HALVES + 1;
let marker = null;
export function makeMarker(st) {
  if (!marker) {
    marker = new THREE.Group();
    const disc = new THREE.CylinderGeometry(20, 20, 0.6, 20), mast = new THREE.CylinderGeometry(1.5, 2.5, 60, 8), lamp = new THREE.CylinderGeometry(4, 4, 8, 10);
    const mDisc = new THREE.MeshBasicMaterial({ color: 0xf97316 }), mMast = new THREE.MeshBasicMaterial({ color: 0xf8fafc }), mLamp = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    for (let i = 0; i < POLES; i++) {
      const pole = new THREE.Group();
      const add = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; pole.add(m); };
      add(disc, mDisc, 0.3); add(mast, mMast, 30); add(lamp, mLamp, 64);
      marker.add(pole);
    }
  }
  marker.children.forEach((pole, i) => pole.position.set(-2 * i * st.R, 0, 0));
  marker.position.set(st.x0, 0, st.z0);
  return marker;
}
export function seatMarker(st, m, heightAt) {
  for (let i = 0; i < POLES; i++) {
    const p = m.children[i];
    p.position.y = heightAt(st.x0 + p.position.x, st.z0);
  }
}

const WEIGHTS = { spread: 0.35, radius: 0.1, cross: 0.1, alt: 0.25, speed: 0.1, bank: 0.1 };
export const KID_NOTE = 'The plane flew the S-turns for you';

// The radius's average and spread (ft) over the half-circles done.
export function spreadFt(st) {
  if (!(st.w > 0)) return { meanFt: 0, sdFt: 0 };
  const mean = st.sum / st.w;
  return { meanFt: mean * M_TO_FT, sdFt: Math.sqrt(Math.max(0, st.sumSq / st.w - mean * mean)) * M_TO_FT };
}

export function gradeSTurns(st, kid = false) {
  const failed = st.phase === 'failed';
  const { meanFt, sdFt } = spreadFt(st);
  const rFt = st.R * M_TO_FT;
  const off = Math.abs(meanFt - rFt);
  const alt = st.maxAltDevFt, kts = st.maxKtsDev, bank = st.maxBankDeg, cross = st.maxCrossDeg;
  const flown = st.w > 0;
  const factors = [
    { key: 'spread', label: 'Radius held (spread round each half-circle)', value: flown ? `±${Math.round(sdFt)} ft` : 'no half-circle',
      score: flown ? curve(sdFt, [[75, 100], [SPREAD_B_FT, 85], [SPREAD_C_FT, 45], [400, 0]]) : 0 },
    { key: 'radius', label: `Radius (asked: ${Math.round(rFt).toLocaleString('en-US')} ft)`,
      value: flown ? `${Math.round(meanFt).toLocaleString('en-US')} ft on average` : '–',
      score: flown ? curve(off, [[150, 100], [OFF_FT, 85], [600, 40], [1000, 0]]) : 0 },
    { key: 'cross', label: 'Wings level over the road (handbook)', value: flown ? `${Math.round(cross)}° of bank at worst` : '–',
      score: flown ? curve(cross, [[5, 100], [CROSS_B_DEG, 85], [20, 40], [30, 0]]) : 0 },
    { key: 'alt', label: 'Altitude held (test: ±100 ft)', value: `${Math.round(alt) === 0 ? '' : st.altSignFt < 0 ? '−' : '+'}${Math.round(alt)} ft at worst`,
      score: curve(alt, [[50, 100], [100, 85], [200, 40], [300, 10], [400, 0]]) },
    { key: 'speed', label: 'Airspeed held (test: ±10 kt)', value: `±${Math.round(kts)} kt at worst`,
      score: curve(kts, [[5, 100], [10, 85], [15, 50], [25, 0]]) },
    { key: 'bank', label: 'Steepest bank (handbook: under 45°)', value: `${Math.round(bank)}°`,
      score: curve(bank, [[MAX_BANK_DEG + 2, 100], [52, 60], [60, 0]]) },
  ];
  for (const f of factors) f.score = Math.round(f.score);
  let score = Math.round(factors.reduce((sum, f) => sum + f.score * WEIGHTS[f.key], 0));
  let reason = null;
  if (failed) {
    score = Math.min(score, LOST_CAP);
    reason = st.why === 'stall' ? 'Stalled in a turn: no steeper than 45°, and keep the speed up.'
      : st.why === 'drift' ? 'The wind carried you away from the road: steeper turns with the wind behind you, shallower into it.'
        : st.why === 'wrongWay' ? 'You turned the wrong way: left first, then right, each turn the opposite way to the last, along the line of poles.'
          : st.why === 'shallow' ? `Crossed back over the road too soon: each half-circle goes ${Math.round(rFt).toLocaleString('en-US')} ft out from it.`
            : st.why === 'height' ? `${st.altSignFt < 0 ? 'Lost' : 'Gained'} over ${FAIL_FT} ft: hold your height through the turns.`
              : st.why === 'missed' ? 'Never crossed the road at the first pole: fly straight across it there, wings level.'
                : 'Not finished: four half-circles across the road.';
  } else if (sdFt > SPREAD_D_FT) {
    score = Math.min(score, LOST_CAP);
    reason = 'Uneven half-circles: the wind pushed the turns out of shape. Steepest bank with the wind behind you, shallowest into it. Capped at D.';
  } else if (alt > 2 * ALT_TOL_FT) {
    score = Math.min(score, LOST_CAP);
    reason = `${st.altSignFt < 0 ? 'Lost' : 'Gained'} ${Math.round(alt)} ft: the test allows 100. Capped at D.`;
  } else if (sdFt > SPREAD_C_FT) {
    score = Math.min(score, 69);
    reason = `The radius wandered ±${Math.round(sdFt)} ft: an uneven S. Change the bank as the wind comes round: steeper behind, shallower ahead. No better than a C.`;
  } else if (sdFt > SPREAD_B_FT || off > OFF_FT || alt > ALT_TOL_FT || kts > KTS_TOL || st.steepS > STEEP_HOLD_S || cross > CROSS_B_DEG) {
    score = Math.min(score, ACS_CAP);
    reason = st.steepS > STEEP_HOLD_S ? 'Past 45° of bank: the handbook\'s limit. No better than a B.'
      : cross > CROSS_B_DEG ? `Banked ${Math.round(cross)}° over the road: roll the wings level just as you cross it. No better than a B.`
        : sdFt > SPREAD_B_FT ? `The radius wandered ±${Math.round(sdFt)} ft (the game asks ±${SPREAD_B_FT}; the test sets no number). No better than a B.`
          : off > OFF_FT ? 'Even half-circles, but not the size asked for. No better than a B.'
            : 'Outside a test tolerance: no better than a B.';
  }
  const track = { pts: st.track.slice(0, 2 * st.trackN), n: st.trackN, start: st.trackStart, R: st.R, sTurns: HALVES, wind: st.wx && [st.wx.windDirDeg, st.wx.windKts] };
  return { kind: 'sTurns', title: failed ? 'S-turns not finished' : 'S-turns across a road', grade: letterGrade(score), score, factors, reason,
    note: kid && !failed ? KID_NOTE : null, track };
}
export const grade = gradeSTurns;

export const debugSnap = (st) => {
  const { meanFt, sdFt } = spreadFt(st);
  return { phase: st.phase, live: st.live, half: st.half, d: st.d, R: st.R, depth: st.depth, ct: st.ct, meanFt, sdFt, maxCrossDeg: st.maxCrossDeg,
    maxAltDevFt: st.maxAltDevFt, maxKtsDev: st.maxKtsDev, maxBankDeg: st.maxBankDeg, why: st.why, trackN: st.trackN, windKts: st.wx.windKts, windDirDeg: st.wx.windDirDeg };
};

// e2e: end the lesson now (graded on the half-circles done so far).
if (typeof window !== 'undefined') window.openaeroDebugSTurns = () => { if (last?.phase === 'course') last.done = true; };
