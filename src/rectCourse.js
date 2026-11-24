// The rectangular course (ticket 0223, a lazy chunk loaded with the mission `rectangular_course`): the Cessna at
// 1,000 ft AGL in a 12 kt wind flies two left-hand laps round a field marked by a lit pole at each corner, a constant
// distance off its edges: crabbed into the wind on the legs, the turns at the corners steepest with the wind behind.
// Source: FAA Airplane Flying Handbook (FAA-H-8083-3C) ch. 7, Ground Reference Maneuvers: flown "between 600 and
// 1,000 feet AGL", never past "a bank angle of 45°"; the rectangular course: the entry "accomplished downwind", the
// legs flown "parallel to and at an equal distance between one-half to three-fourths of a mile away from the field
// boundaries" (here one-half: 2,640 ft; 3C warns that flying close needs "very steep bank angles … especially in the
// downwind to crosswind turn"), the drift on the legs corrected by a crab into the wind, and the bank steepest where the
// groundspeed is highest and shallowest into the wind (tan φ = Vg² / (g R), the relation of the chapter's own worked
// example). 3C gives no field size: the 1/2 by 3/4 statute mile field is the game's. FAA-S-ACS-6C (Nov 2023) Area V
// Task B: PA.V.B.S3a "enter a left or right pattern, 600 to 1,000 feet AGL" (the ACS's entry is 45° to the downwind
// leg; this lesson starts on the downwind leg's line, the handbook's downwind entry), S7 "Maintain altitude ±100 feet;
// maintain airspeed ±10 knots"; it sets no number for the distance (the bands here are 0211's, the game's own, and the
// card says so).
// The "distance" is to the field's nearest edge or corner, so the path asked is the field grown by 2,640 ft: straight
// legs and quarter circles round the corners. Rolling into each corner's turn as the Cessna comes abeam it is the game's
// (and the common instructor's) cue: 3C lists only "failure to execute turns with accurate timing" as an error.
// Pure but for makeMarker (aroundPoint.js's three classes: no new boot export). Tested in tests/unit/rectCourse.test.js
// and flown headless in tests/flight/rectCourse.test.js.
import * as THREE from 'three';
import { curve, letterGrade } from './landing.js';
import { DRILL_TEXT, RANK } from './coach.js';
import { stallAoaDeg } from './aero.js';
import { lessonWx, MAX_BANK_DEG, ALT_TOL_FT, KTS_TOL, SPREAD_B_FT, SPREAD_D_FT, IAS_TAU_S, STEEP_HOLD_S, ASSIST_BANK_DEG,
  SAY_OFF_M, TRACK_MAX, TRACK_DT_S, KP, KD, ACS_CAP, LOST_CAP } from './aroundPoint.js';
import { M_TO_FT, FT_TO_M, GRAVITY } from './constants.js';

export { lessonWx, MAX_BANK_DEG, ASSIST_BANK_DEG, SPREAD_B_FT, SPREAD_D_FT };
export const RECT_KEY = 'rectangular_course';
export const PLACE = { name: 'Fields north-west of Alliance · 1,000 ft' };
export const SNAP = 'rectCourse'; // openaeroDebug's field
export const LAPS_DEG = 720; // two laps (the turns-around-a-point lesson's two circles)
export const SPREAD_C_FT = 250; // wider than this: no better than a C
export const OFF_FT = 300; // the average this far from the distance asked: no better than a B
export const LOST_X = 3; // this many times the distance off the field: drifted away
export const FAIL_FT = 500;
export const FAIL_S = 900; // two laps take ~6.5 minutes
export const ENTRY_FAIL_S = 120;
// The corner's turn starts this far before abeam (the bank takes ~2 s to come), Kid's guide and the coach's "roll now".
export const ROLL_LEAD_M = 60;

export const RECT_TEXT = {
  rcFlyOn: 'Fly on: the field is on your left. Keep its edge the same distance off your left wing',
  rcKidIn: 'Let go: the plane flies round the field, the same distance off its edges',
  rcKid: 'Watch the nose: it points into the wind on the legs, and the turns are steepest with the wind behind',
  rcCornerDown: 'Corner abeam: roll left, steep: the wind is behind you, fastest over the ground',
  rcCornerUp: 'Corner abeam: roll left, gently: into the wind you are slowest over the ground',
  rcCorner: 'Corner abeam: roll left, a medium bank, round the corner',
  rcWide: 'Drifting away from the field: turn a little left, toward it, and crab',
  rcClose: 'Too close to the field: turn a little right, away from it, and crab',
  rcCrabL: 'Wind from your left: point the nose a little left, into it, to fly straight along the edge',
  rcCrabR: 'Wind from your right: point the nose a little right, into it, to fly straight along the edge',
  rcLegDown: 'Wind behind you: fastest over the ground. The next corner needs the steepest bank',
  rcLegUp: 'Into the wind: slowest over the ground. The next corner needs only a gentle bank',
  rcLevel: 'Straight leg: wings level, the field the same distance off your left',
  rcLow: 'Sinking: a little back pressure, a little power',
  rcHigh: 'Climbing: ease the back pressure',
  rcSlow: 'Slowing: add power',
  rcFast: 'Fast: ease off the power',
  rcSteep: 'Over 45° of bank: shallower. You are too close to the field, or started the corner late',
};
Object.assign(DRILL_TEXT, RECT_TEXT);
Object.assign(RANK, { rcFlyOn: 1, rcKidIn: 1, rcKid: 1, rcCornerDown: 2, rcCornerUp: 2, rcCorner: 2, rcWide: 1, rcClose: 1, rcCrabL: 1, rcCrabR: 1,
  rcLegDown: 1, rcLegUp: 1, rcLevel: 1, rcLow: 1, rcHigh: 1, rcSlow: 1, rcFast: 1, rcSteep: 2 });

const wrap180 = (d) => ((d % 360) + 540) % 360 - 180;
const DEG = 180 / Math.PI;

// m: the mission ({ field: [x, z] (its centre), fieldFt: [east-west, north-south], distFt, wind: [fromDeg, kts], pos,
// aglFt, kias }). Allocates (a mission load). A left-hand course: the field on the left wing, anticlockwise from above.
let last = null; // the e2e hook's handle (openaeroDebugRectCourse below)
export function createRectCourse(m) {
  last = {
    kind: 'rectCourse',
    phase: 'entry', cx: m.field[0], cz: m.field[1], hx: m.fieldFt[0] * FT_TO_M / 2, hz: m.fieldFt[1] * FT_TO_M / 2, D: m.distFt * FT_TO_M,
    live: false, hold: null, spawn: m, wx: lessonWx(m),
    t: 0, ct: 0, swept: 0, lastAng: null, d: 0, corner: false, nx: 0, nz: 0,
    alt0: null, kts0: m.kias, iasF: m.kias,
    maxAltDevFt: 0, altSignFt: 0, maxKtsDev: 0, maxBankDeg: 0, steepS: 0,
    w: 0, sum: 0, sumSq: 0, why: null, awayS: 0,
    track: new Float32Array(2 * TRACK_MAX), trackN: 0, trackStart: -1, trackT: 0,
  };
  return last;
}
export const create = createRectCourse;

export const rectLive = (st) => st.phase === 'entry' || st.phase === 'course';
export const live = rectLive;

// The field's signed distance at (x, z) (+ outside, − over the field), its outward normal and whether its nearest point
// is a corner, written into st (no allocation).
export function fieldDistance(st, x, z) {
  const rx = x - st.cx, rz = z - st.cz;
  const qx = Math.abs(rx) - st.hx, qz = Math.abs(rz) - st.hz;
  if (qx > 0 && qz > 0) {
    const d = Math.hypot(qx, qz);
    st.nx = Math.sign(rx) * qx / d; st.nz = Math.sign(rz) * qz / d; st.corner = true;
    return (st.d = d);
  }
  st.corner = false;
  if (qx > qz) { st.nx = Math.sign(rx) || 1; st.nz = 0; return (st.d = qx); }
  st.nx = 0; st.nz = Math.sign(rz) || 1;
  return (st.d = qz);
}

// One step. st is mutated (no allocation). s: { dt, x, z (sim metres), vx, vz (ground velocity, m/s), wx, wz (the
// wind, m/s), altFt, iasKts, bankDeg (+ right), stalled }. Returns 'course' | 'complete' | 'failed' | ''.
export function rectStep(st, s) {
  if (st.phase === 'complete' || st.phase === 'failed') return '';
  const d = fieldDistance(st, s.x, s.z);
  const rx = s.x - st.cx, rz = s.z - st.cz;
  st.t += s.dt;
  st.trackT += s.dt;
  if (st.trackT >= TRACK_DT_S && st.trackN < TRACK_MAX) {
    st.trackT = 0;
    st.track[2 * st.trackN] = rx; st.track[2 * st.trackN + 1] = rz; st.trackN++;
  }
  const ang = Math.atan2(rz, rx) * DEG;
  const dAng = st.lastAng === null ? 0 : wrap180(ang - st.lastAng);
  st.lastAng = ang;
  if (st.phase === 'entry') {
    if (st.alt0 === null) st.alt0 = s.altFt;
    st.iasF = s.iasKts;
    // The course starts abeam the field (its nearest point on an edge, not a corner) within twice the distance, flying
    // the left-hand way along it (the field on the left: the track along the left-hand tangent (nz, −nx); panel).
    if (!st.corner && d > 0 && d <= 2 * st.D && s.vx * st.nz - s.vz * st.nx > 0) {
      st.phase = 'course'; st.trackStart = Math.max(0, st.trackN - 1);
      return 'course';
    }
    if (st.t < ENTRY_FAIL_S && d <= LOST_X * st.D + 1000) return '';
    st.why = 'missed'; st.phase = 'failed';
    return 'failed';
  }
  st.ct += s.dt;
  st.swept += dAng;
  st.w += s.dt; st.sum += d * s.dt; st.sumSq += d * d * s.dt;
  const altDev = s.altFt - st.alt0;
  if (Math.abs(altDev) > st.maxAltDevFt) { st.maxAltDevFt = Math.abs(altDev); st.altSignFt = altDev; }
  st.iasF += (s.iasKts - st.iasF) * Math.min(1, s.dt / IAS_TAU_S);
  st.maxKtsDev = Math.max(st.maxKtsDev, Math.abs(st.iasF - st.kts0));
  const bank = Math.abs(s.bankDeg);
  st.maxBankDeg = Math.max(st.maxBankDeg, bank);
  if (bank > MAX_BANK_DEG + 2) st.steepS += s.dt;
  // Flying away from the field (opening faster than a fifth of the speed: not a crab's drift).
  if (s.vx * st.nx + s.vz * st.nz > 0.2 * Math.hypot(s.vx, s.vz)) st.awayS += s.dt;
  // Left-hand: anticlockwise from above, the angle round the field's centre falls in the sim's frame (+z south). A quarter
  // of a lap the other way round is a right-hand course: not the lesson (panel: it completed S, the corner words wrong).
  if (s.stalled || d > LOST_X * st.D || d < 0 || st.swept > 90 || st.maxAltDevFt > FAIL_FT || st.ct > FAIL_S) {
    st.why = s.stalled ? 'stall' : d > LOST_X * st.D ? 'drift' : d < 0 ? 'over' : st.swept > 90 ? 'wrongWay' : st.maxAltDevFt > FAIL_FT ? 'height' : 'time';
    st.phase = 'failed';
    return 'failed';
  }
  if (st.swept <= -LAPS_DEG) { st.phase = 'complete'; return 'complete'; }
  return '';
}

// How far (m) the Cessna is short of abeam the next corner along its leg (left-hand: the field on the left), or −1 off a leg.
export function toCornerM(st, s) {
  if (st.corner) return -1;
  const rx = s.x - st.cx, rz = s.z - st.cz;
  // Along the leg, the way a left-hand course goes: on the east side (+x) north (−z), on the north side west, and so on.
  if (st.nx > 0) return rz + st.hz; // east side, going north: the north-east corner is at rz = −hz
  if (st.nx < 0) return st.hz - rz; // west side, going south
  if (st.nz < 0) return rx + st.hx; // north side, going west
  return st.hx - rx; // south side, going east
}

// The ground-track law (Kid's guide, the coach's sense of the corners): the bank whose horizontal lift holds the path
// at the distance asked: round a corner the ground velocity turned at the distance flown (Vt² / d, the handbook's
// tan φ = Vg² / (g R)); on a leg none (the crab holds it); a spring back to the distance and damping on the outward
// speed, aroundPoint.js's gains. The corner's turn is led by ROLL_LEAD_M. Bank in degrees, + right (a left-hand course
// banks left: −).
export function rectBankDeg(st, s) {
  fieldDistance(st, s.x, s.z);
  // Before the course: the downwind leg's line, up the field's east side (missions.js spawns there), no corner yet.
  if (st.phase === 'entry') { st.corner = false; st.nx = 1; st.nz = 0; st.d = s.x - st.cx - st.hx; }
  const d = Math.max(1, st.d);
  const vr = s.vx * st.nx + s.vz * st.nz; // + outward
  const vt2 = Math.max(0, s.vx * s.vx + s.vz * s.vz - vr * vr);
  const lead = !st.corner && toCornerM(st, s) >= 0 && toCornerM(st, s) < ROLL_LEAD_M;
  const a = (st.corner || lead ? vt2 / Math.max(d, st.D / 2) : 0) + KP * (st.d - st.D) + KD * vr;
  return -Math.max(-10, Math.min(MAX_BANK_DEG, Math.atan(a / GRAVITY) * DEG));
}

// How the wind sits on the ground track: + behind, − ahead (−1 … 1); and across it: + from the right.
const windBehind = (s) => {
  const w = Math.hypot(s.wx, s.wz), v = Math.hypot(s.vx, s.vz);
  return w < 1 || v < 1 ? 0 : (s.wx * s.vx + s.wz * s.vz) / (w * v);
};
// The wind's cross component on the track (+ blowing to the left, i.e. from the right), m/s.
const windFromRight = (s) => {
  const v = Math.hypot(s.vx, s.vz);
  return v < 1 ? 0 : (s.wx * s.vz - s.wz * s.vx) / v;
};

// The coach's word for this moment (coach.js s.ds). kid: the guide flies it.
export function rectPrompt(st, s, kid) {
  if (st.phase === 'complete' || st.phase === 'failed' || !st.live) return null;
  if (kid) return st.phase === 'entry' ? 'rcKidIn' : 'rcKid';
  if (st.phase === 'entry') return 'rcFlyOn';
  if (Math.abs(s.bankDeg) > MAX_BANK_DEG + 2) return 'rcSteep';
  // The corner: roll in as it comes abeam (the game's cue), the bank by the wind behind.
  const toC = toCornerM(st, s);
  if (st.corner || (toC >= 0 && toC < ROLL_LEAD_M)) {
    if (s.bankDeg > -10) {
      const wb = windBehind(s);
      return wb > 0.5 ? 'rcCornerDown' : wb < -0.5 ? 'rcCornerUp' : 'rcCorner';
    }
  }
  if (st.iasF < st.kts0 - KTS_TOL) return 'rcSlow';
  if (st.d - st.D > 2 * SAY_OFF_M) return 'rcWide';
  if (st.D - st.d > 2 * SAY_OFF_M) return 'rcClose';
  const altDev = s.altFt - st.alt0;
  if (altDev < -ALT_TOL_FT / 2) return 'rcLow';
  if (altDev > ALT_TOL_FT / 2) return 'rcHigh';
  if (st.d - st.D > SAY_OFF_M) return 'rcWide';
  if (st.D - st.d > SAY_OFF_M) return 'rcClose';
  if (st.iasF < st.kts0 - KTS_TOL / 2) return 'rcSlow';
  if (st.iasF > st.kts0 + KTS_TOL / 2) return 'rcFast';
  if (st.corner) return 'rcCorner';
  const xw = windFromRight(s);
  if (Math.abs(xw) > 3) return xw > 0 ? 'rcCrabR' : 'rcCrabL';
  const wb = windBehind(s);
  return wb > 0.7 ? 'rcLegDown' : wb < -0.7 ? 'rcLegUp' : 'rcLevel';
}

// Kid's hands-off guide (main.js applyAssists): the ground-track law from the spawn (the downwind leg's line), the
// flight path back to the entry height (aroundPoint.js's: banked, ask α(1 − cos φ) lower).
export function rectKidGuide(st, s, out) {
  out.guideBankDeg = rectBankDeg(st, s);
  const err = st.phase === 'course' ? st.alt0 - s.altFt : 0;
  out.guideGammaDeg = Math.max(-3, Math.min(3, err * 0.02)) - s.aoaDeg * (1 - Math.cos(s.bankDeg / DEG));
}

// The game's adapter (aroundPoint.js aroundSimStep's): held at the spawn until the first live frame.
const _s = { dt: 0, x: 0, z: 0, vx: 0, vz: 0, wx: 0, wz: 0, altFt: 0, iasKts: 0, bankDeg: 0, aoaDeg: 0, stalled: false };
export function rectSimStep(st, sim, dt, isLive) {
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
  return rectStep(st, _s);
}
export const simStep = rectSimStep;
export const coachWord = (st, kid) => rectPrompt(st, _s, kid);
export function kidGuide(st, out) {
  if (st.phase === 'complete' || st.phase === 'failed' || !st.live) return 0;
  rectKidGuide(st, _s, out);
  return ASSIST_BANK_DEG;
}

// The HUD's field readout (aroundPoint.js drawPole's slot and box): an arrow from the nose to the field's nearest edge
// and the distance against the one asked, e.g. "FIELD 2,600 / 2,640 FT". The field is off the left wing all the way
// round, out of a phone's forward view. The text is rebuilt only when its number changes (AGENTS.md invariant 4).
export const BOX_W = 232, BOX_H = 24;
let fieldFt = -1, fieldText = '';
export function fieldRelDeg(st, x, z, hdgTrueDeg) {
  fieldDistance(st, x, z);
  const brg = Math.atan2(-st.nx, st.nz) * DEG; // the way to the field (−normal): +x east, −z north
  return ((brg - hdgTrueDeg) % 360 + 360) % 360;
}
export function drawHud(ctx, cx, top, st, sim, hdgTrueDeg) {
  if (!rectLive(st) || !st.live) return;
  const rel = fieldRelDeg(st, sim.pos.x, sim.pos.z, hdgTrueDeg); // also refreshes st.d
  const q = st.d > 2 * st.D ? 50 : 10;
  const ft = Math.round(Math.max(0, st.d) * M_TO_FT / q) * q;
  if (ft !== fieldFt) { fieldFt = ft; fieldText = `FIELD ${ft.toLocaleString('en-US')} / ${Math.round(st.D * M_TO_FT).toLocaleString('en-US')} FT`; }
  ctx.fillStyle = 'rgba(2, 6, 23, 0.7)';
  ctx.fillRect(cx - BOX_W / 2, top, BOX_W, BOX_H);
  ctx.fillStyle = st.phase === 'course' && Math.abs(st.d - st.D) <= SAY_OFF_M ? '#6ee7b7' : '#fcd34d';
  ctx.save();
  ctx.translate(cx - BOX_W / 2 + 15, top + BOX_H / 2);
  ctx.rotate(rel / DEG);
  ctx.beginPath();
  ctx.moveTo(0, -9); ctx.lineTo(6, 2); ctx.lineTo(2, 2); ctx.lineTo(2, 9); ctx.lineTo(-2, 9); ctx.lineTo(-2, 2); ctx.lineTo(-6, 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(fieldText, cx + 10, top + 17);
}

// Four lit poles, one at each corner of the field, built once per chunk and moved (0211's panel: a new mesh per load
// leaked its GPU buffers). seatMarker puts each on the ground under it.
let marker = null;
export function makeMarker(st) {
  if (!marker) {
    marker = new THREE.Group();
    const disc = new THREE.CylinderGeometry(20, 20, 0.6, 20), mast = new THREE.CylinderGeometry(1.5, 2.5, 60, 8), lamp = new THREE.CylinderGeometry(4, 4, 8, 10);
    const mDisc = new THREE.MeshBasicMaterial({ color: 0xf97316 }), mMast = new THREE.MeshBasicMaterial({ color: 0xf8fafc }), mLamp = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    for (let i = 0; i < 4; i++) {
      const pole = new THREE.Group();
      const add = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; pole.add(m); };
      add(disc, mDisc, 0.3); add(mast, mMast, 30); add(lamp, mLamp, 64);
      marker.add(pole);
    }
  }
  marker.children.forEach((pole, i) => pole.position.set((i & 1 ? 1 : -1) * st.hx, 0, (i & 2 ? 1 : -1) * st.hz));
  marker.position.set(st.cx, 0, st.cz);
  return marker;
}
// Each pole on the ground under it (main.js, every frame: the DEM can arrive after the poles).
export function seatMarker(st, m, heightAt) {
  for (let i = 0; i < 4; i++) {
    const p = m.children[i];
    p.position.y = heightAt(st.cx + p.position.x, st.cz + p.position.z);
  }
}

const WEIGHTS = { spread: 0.4, dist: 0.1, alt: 0.25, speed: 0.15, bank: 0.1 };
export const KID_NOTE = 'The plane flew the course for you';

export function spreadFt(st) {
  if (!(st.w > 0)) return { meanFt: 0, sdFt: 0 };
  const mean = st.sum / st.w;
  return { meanFt: mean * M_TO_FT, sdFt: Math.sqrt(Math.max(0, st.sumSq / st.w - mean * mean)) * M_TO_FT };
}

export function gradeRectCourse(st, kid = false) {
  const failed = st.phase === 'failed';
  const { meanFt, sdFt } = spreadFt(st);
  const dFt = st.D * M_TO_FT;
  const off = Math.abs(meanFt - dFt);
  const alt = st.maxAltDevFt, kts = st.maxKtsDev, bank = st.maxBankDeg;
  const flown = st.w > 0;
  const factors = [
    { key: 'spread', label: 'Distance held (spread of your distance from the field)', value: flown ? `±${Math.round(sdFt)} ft` : 'no lap',
      score: flown ? curve(sdFt, [[75, 100], [SPREAD_B_FT, 85], [SPREAD_C_FT, 45], [400, 0]]) : 0 },
    { key: 'dist', label: `Distance from the field (asked: ${Math.round(dFt).toLocaleString('en-US')} ft)`,
      value: flown ? `${Math.round(meanFt).toLocaleString('en-US')} ft on average` : '–',
      score: flown ? curve(off, [[150, 100], [OFF_FT, 85], [600, 40], [1000, 0]]) : 0 },
    { key: 'alt', label: 'Altitude held (test: ±100 ft)', value: `${Math.round(alt) === 0 ? '' : st.altSignFt < 0 ? '−' : '+'}${Math.round(alt)} ft at worst`,
      score: curve(alt, [[50, 100], [100, 85], [200, 40], [300, 10], [400, 0]]) },
    { key: 'speed', label: 'Airspeed held (test: ±10 kt)', value: `±${Math.round(kts)} kt at worst`,
      score: curve(kts, [[5, 100], [10, 85], [15, 50], [25, 0]]) },
    { key: 'bank', label: 'Steepest bank (handbook: 45° at most)', value: `${Math.round(bank)}°`,
      score: curve(bank, [[MAX_BANK_DEG + 2, 100], [52, 60], [60, 0]]) },
  ];
  for (const f of factors) f.score = Math.round(f.score);
  let score = Math.round(factors.reduce((sum, f) => sum + f.score * WEIGHTS[f.key], 0));
  let reason = null;
  if (failed) {
    score = Math.min(score, LOST_CAP);
    reason = st.why === 'stall' ? 'Stalled in a turn: no steeper than 45°, and keep the speed up.'
      : st.why === 'drift' ? (st.awayS > st.ct / 3 ? 'You flew away from the field: keep it off your left wing, and turn left at each corner.'
        : 'The wind carried you away from the field: crab into the wind on the legs, and turn steeper with the wind behind you.')
        : st.why === 'wrongWay' ? 'You went round the other way: this course is left-hand, the field on your left and a left turn at each corner.'
        : st.why === 'over' ? 'You flew over the field: the course goes round it, the same distance off its edges.'
          : st.why === 'height' ? `${st.altSignFt < 0 ? 'Lost' : 'Gained'} over ${FAIL_FT} ft: hold your height round the course.`
            : st.why === 'missed' ? 'Never joined the course: fly along the field\'s edge with it off your left wing.'
              : 'Not finished: two laps round the field.';
  } else if (sdFt > SPREAD_D_FT) {
    score = Math.min(score, LOST_CAP);
    reason = 'The distance swung in and out: the wind pushed the course out of shape. Crab into the wind on the legs; steeper turns with the wind behind you. Capped at D.';
  } else if (alt > 2 * ALT_TOL_FT) {
    score = Math.min(score, LOST_CAP);
    reason = `${st.altSignFt < 0 ? 'Lost' : 'Gained'} ${Math.round(alt)} ft: the test allows 100. Capped at D.`;
  } else if (sdFt > SPREAD_C_FT) {
    score = Math.min(score, 69);
    reason = `The distance wandered ±${Math.round(sdFt)} ft: the wind drifted you on the legs. Crab into it, and steeper turns with it behind you. No better than a C.`;
  } else if (sdFt > SPREAD_B_FT || off > OFF_FT || alt > ALT_TOL_FT || kts > KTS_TOL || st.steepS > STEEP_HOLD_S) {
    score = Math.min(score, ACS_CAP);
    reason = st.steepS > STEEP_HOLD_S ? 'Past 45° of bank: the handbook\'s limit (start the corner sooner). No better than a B.'
      : sdFt > SPREAD_B_FT ? `The distance wandered ±${Math.round(sdFt)} ft (the game asks ±${SPREAD_B_FT}; the test sets no number). No better than a B.`
        : off > OFF_FT ? 'An even course, but not the distance asked for. No better than a B.'
          : 'Outside a test tolerance: no better than a B.';
  }
  const track = { pts: st.track.slice(0, 2 * st.trackN), n: st.trackN, start: st.trackStart, R: st.D, rect: [st.hx, st.hz], wind: st.wx && [st.wx.windDirDeg, st.wx.windKts] };
  return { kind: 'rectCourse', title: failed ? 'Rectangular course not finished' : 'Rectangular course', grade: letterGrade(score), score, factors, reason,
    note: kid && !failed ? KID_NOTE : null, track };
}
export const grade = gradeRectCourse;

export const debugSnap = (st) => {
  const { meanFt, sdFt } = spreadFt(st);
  return { phase: st.phase, live: st.live, swept: st.swept, d: st.d, D: st.D, corner: st.corner, ct: st.ct, meanFt, sdFt,
    maxAltDevFt: st.maxAltDevFt, maxKtsDev: st.maxKtsDev, maxBankDeg: st.maxBankDeg, why: st.why, trackN: st.trackN, windKts: st.wx.windKts, windDirDeg: st.wx.windDirDeg };
};

// e2e: fast-forward the lesson to `deg` of the two laps (the flown samples so far stay its grade's).
if (typeof window !== 'undefined') window.openaeroDebugRectCourse = (deg) => { if (last?.phase === 'course') last.swept = -deg; }; // left-hand: the angle falls
