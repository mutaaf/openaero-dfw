// Turns around a point (ticket 0211, a lazy chunk loaded with the mission `turns_around_point`): the Cessna at
// 1,000 ft AGL in a 12 kt wind circles a lit pole twice at a constant distance, the bank steepest downwind and
// shallowest upwind. Source: FAA Airplane Flying Handbook (FAA-H-8083-3C) ch. 7, Ground Reference Maneuvers:
// flown "between 600 and 1,000 feet AGL" (p. 7-2), never past "a bank angle of 45° or an airspeed greater than the
// maneuvering speed" (p. 7-1), "entered from a downwind position" (p. 7-4); turns around a point: "a 360° constant
// radius turn around a single ground-based reference point", "two or more turns" to assess the wind (p. 7-7); the
// bank is "proportional to groundspeed" (p. 7-3: its 2,000 ft radius at 100 kt over the ground is ~24°, i.e.
// tan φ = Vg² / (g R)). FAA-S-ACS-6C (Nov 2023) Area V Task B: PA.V.B.S3c enter 600-1,000 ft AGL, S4 "maintain a
// constant radius turn" (no number: the radius bands here are the game's own, and the card says so), S7 "Maintain
// altitude ±100 feet; maintain airspeed ±10 knots".
// Pure but for makeMarker (three's classes windsock.js already pulls in: no new boot export). Tested in
// tests/unit/aroundPoint.test.js and flown headless in tests/flight/aroundPoint.test.js.
import * as THREE from 'three';
import { curve, letterGrade } from './landing.js';
import { DRILL_TEXT, RANK } from './coach.js';
import { stallAoaDeg } from './aero.js';
import { scenarioWeather } from './weather.js';
import { M_TO_FT, FT_TO_M, GRAVITY } from './constants.js';

export const AROUND_KEY = 'turns_around_point';
export const AROUND_PLACE = { name: 'Fields north-west of Alliance · 1,000 ft' };
export const CIRCLES_DEG = 720; // two full turns (AFH p. 7-7: "two or more")
export const MAX_BANK_DEG = 45; // AFH p. 7-1
export const ALT_TOL_FT = 100; // ACS Area V Task B
export const KTS_TOL = 10;
// The game's bands for "a constant radius" (the ACS sets no number): the spread of the distance from the pole
// (its standard deviation over the two circles) and how far its average sits from the circle asked for.
export const SPREAD_B_FT = 150; // wider than this is not held: no better than a B
export const SPREAD_D_FT = 350; // an oval, not a circle: D
export const RADIUS_OFF_FT = 400; // the average this far from the asked radius: no better than a B
// Not finished: this far from the pole (a circle drifted away), this far off the height, this long, a stall.
export const LOST_RADII = 3;
export const FAIL_FT = 500;
export const FAIL_S = 300;
export const ENTRY_FAIL_S = 120; // never reached the pole
export const IAS_TAU_S = 2; // as steepTurns.js: a gust's spike is not the pilot's speed
export const STEEP_HOLD_S = 1; // past 45° (+ 2° grace) this long counts
// Kid's and Learner's bank cap in the lesson (assists.js s.bankMaxDeg): full stick (0.85 of it) is the 45° most.
export const ASSIST_BANK_DEG = 53;
// The coach's "wide" / "close" past this much off the radius; height words past half the tolerance.
export const SAY_OFF_M = 40;
export const TRACK_MAX = 1200; // samples (0.5 s each: 10 minutes)
export const TRACK_DT_S = 0.5;

// The ground-track law (Kid's guide, the coach's sense of "steeper"): the bank whose horizontal lift turns the
// ground velocity round the pole at the distance flown (Vt² / d), plus a spring back to the radius and damping
// on the radial speed. Gains: ~0.1 rad/s, damped ~0.7.
export const KP = 0.012; // m/s² per m off the radius
export const KD = 0.17; // m/s² per m/s outward

export const AROUND_TEXT = {
  tptFlyOnL: 'Fly on, level: when the lit pole is off your left wingtip, roll left round it',
  tptFlyOnR: 'Fly on, level: when the lit pole is off your right wingtip, roll right round it',
  tptRollL: 'Pole abeam: roll left now, steep: you are downwind, fastest over the ground',
  tptRollR: 'Pole abeam: roll right now, steep: you are downwind, fastest over the ground',
  tptWide: 'Drifting wide of the circle: steepen the bank',
  tptClose: 'Too close to the pole: shallower bank',
  tptDown: 'Wind behind you: fastest over the ground, so the steepest bank',
  tptUp: 'Into the wind: slowest over the ground, so the shallowest bank',
  tptHold: 'Same distance all the way round: steeper as the wind comes behind, shallower as it comes ahead',
  tptLow: 'Sinking: a little back pressure, a little power',
  tptHigh: 'Climbing: ease the back pressure',
  tptSlow: 'Slowing: add power',
  tptFast: 'Fast: ease off the power',
  tptSteep: 'Over 45° of bank: shallower, and next time start the circle wider',
  tptKidIn: 'Let go: the plane flies to the lit pole and circles it',
  tptKid: 'Watch the wing: steep with the wind behind, shallow into it, and the circle stays round',
};
Object.assign(DRILL_TEXT, AROUND_TEXT);
Object.assign(RANK, { tptFlyOnL: 1, tptFlyOnR: 1, tptRollL: 2, tptRollR: 2, tptWide: 1, tptClose: 1, tptDown: 1, tptUp: 1, tptHold: 1,
  tptLow: 1, tptHigh: 1, tptSlow: 1, tptFast: 1, tptSteep: 2, tptKidIn: 1, tptKid: 1 });

const wrap180 = (d) => ((d % 360) + 540) % 360 - 180;
const DEG = 180 / Math.PI;

// m: the mission ({ point: [x, z], hdg, radiusFt, wind: [fromDeg, kts], pos, aglFt }). Allocates (a mission load).
let last = null; // the e2e hook's handle (openaeroDebugAroundPoint below)
export function createAroundPoint(m) {
  const h = m.hdg / DEG;
  last = {
    phase: 'entry', px: m.point[0], pz: m.point[1], ux: Math.sin(h), uz: -Math.cos(h), R: m.radiusFt * FT_TO_M,
    live: false, hold: null, spawn: m, wx: lessonWx(m),
    t: 0, ct: 0, swept: 0, lastAng: null, side: 0, d: 0, along: 0,
    alt0: 0, kts0: 0, iasF: 0, maxAltDevFt: 0, altSignFt: 0, maxKtsDev: 0, maxBankDeg: 0, steepS: 0,
    w: 0, sum: 0, sumSq: 0, why: null,
    track: new Float32Array(2 * TRACK_MAX), trackN: 0, trackStart: -1, trackT: 0,
  };
  return last;
}

// The lesson's wind (main.js currentWeather while it flies): a scenario, labelled so (wingLow.js scenarioWx's shape).
export function lessonWx(m) {
  const [dir, kts] = m.wind;
  return { ...scenarioWeather(), windDirDeg: dir, windKts: kts, gustKts: kts, scripted: true,
    raw: `SCENARIO KAFW ${String(dir).padStart(3, '0')}${kts}KT 10SM FEW050 18/08 A3000` };
}

export const aroundLive = (st) => st.phase === 'entry' || st.phase === 'circle';

// One step. st is mutated (no allocation). s: { dt, x, z (sim metres), vx, vz (ground velocity, m/s), wx, wz (the
// wind, m/s), altFt (any datum, the same each step), iasKts, bankDeg (+ right), stalled }.
// Returns the transition: 'circle' | 'complete' | 'failed' | ''.
export function aroundStep(st, s) {
  if (st.phase === 'complete' || st.phase === 'failed') return '';
  const rx = s.x - st.px, rz = s.z - st.pz;
  const d = st.d = Math.hypot(rx, rz);
  st.along = rx * st.ux + rz * st.uz; // + = past abeam the pole along the entry track
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
    // Which side the pole is on (+ right, − left): the ground track crossed with the line to it.
    const cr = rx * s.vz - rz * s.vx;
    if (Math.abs(cr) > 1) st.side = cr > 0 ? 1 : -1;
    // The entry altitude and speed: the ones where the circle starts.
    st.alt0 = s.altFt; st.kts0 = s.iasKts; st.iasF = s.iasKts;
    if (st.along < 0 && st.t < ENTRY_FAIL_S) return '';
    if (st.along >= 0 && d <= 2 * st.R) {
      st.phase = 'circle'; st.trackStart = Math.max(0, st.trackN - 1);
      return 'circle';
    }
    st.why = 'missed'; st.phase = 'failed';
    return 'failed';
  }
  st.ct += s.dt;
  st.swept += dAng;
  // The distance's spread, time-weighted.
  st.w += s.dt; st.sum += d * s.dt; st.sumSq += d * d * s.dt;
  const altDev = s.altFt - st.alt0;
  if (Math.abs(altDev) > st.maxAltDevFt) { st.maxAltDevFt = Math.abs(altDev); st.altSignFt = altDev; }
  st.iasF += (s.iasKts - st.iasF) * Math.min(1, s.dt / IAS_TAU_S);
  st.maxKtsDev = Math.max(st.maxKtsDev, Math.abs(st.iasF - st.kts0));
  const bank = Math.abs(s.bankDeg);
  st.maxBankDeg = Math.max(st.maxBankDeg, bank);
  if (bank > MAX_BANK_DEG + 2) st.steepS += s.dt;
  if (s.stalled || d > LOST_RADII * st.R || st.maxAltDevFt > FAIL_FT || st.ct > FAIL_S) {
    st.why = s.stalled ? 'stall' : d > LOST_RADII * st.R ? 'drift' : st.maxAltDevFt > FAIL_FT ? 'height' : 'time';
    st.phase = 'failed';
    return 'failed';
  }
  if (Math.abs(st.swept) >= CIRCLES_DEG) { st.phase = 'complete'; return 'complete'; }
  return '';
}

// The bank (deg, + right) that holds the circle: the ground velocity turned round the pole at the distance flown,
// a spring back to the radius and damping on the radial speed; side −1 circles with the pole on the left.
export function circleBankDeg(st, s, side) {
  const rx = s.x - st.px, rz = s.z - st.pz;
  const d = Math.max(1, Math.hypot(rx, rz));
  const vr = (s.vx * rx + s.vz * rz) / d; // + outward
  const vt2 = Math.max(0, s.vx * s.vx + s.vz * s.vz - vr * vr);
  const a = vt2 / d + KP * (d - st.R) + KD * vr;
  const mag = Math.max(-10, Math.min(MAX_BANK_DEG, Math.atan(a / GRAVITY) * DEG));
  return side * mag;
}

// How the wind sits on the ground track: + = behind (downwind), − = ahead (upwind), from −1 to 1.
const windBehind = (s) => {
  const w = Math.hypot(s.wx, s.wz), v = Math.hypot(s.vx, s.vz);
  return w < 1 || v < 1 ? 0 : (s.wx * s.vx + s.wz * s.vz) / (w * v);
};

// The coach's word for this moment (coach.js s.ds, rank 1-2). kid: the guide flies it.
export function aroundPrompt(st, s, kid) {
  if (st.phase === 'complete' || st.phase === 'failed' || !st.live) return null;
  if (kid) return st.phase === 'entry' ? 'tptKidIn' : 'tptKid';
  const left = st.side <= 0;
  if (st.phase === 'entry') return st.along > -ROLL_LEAD_M * 3 ? (left ? 'tptRollL' : 'tptRollR') : left ? 'tptFlyOnL' : 'tptFlyOnR';
  if (Math.abs(s.bankDeg) > MAX_BANK_DEG + 2) return 'tptSteep';
  const altDev = s.altFt - st.alt0;
  if (altDev < -ALT_TOL_FT / 2) return 'tptLow';
  if (altDev > ALT_TOL_FT / 2) return 'tptHigh';
  if (st.d - st.R > SAY_OFF_M) return 'tptWide';
  if (st.R - st.d > SAY_OFF_M) return 'tptClose';
  if (st.iasF < st.kts0 - KTS_TOL / 2) return 'tptSlow';
  if (st.iasF > st.kts0 + KTS_TOL / 2) return 'tptFast';
  const wb = windBehind(s);
  return wb > 0.7 ? 'tptDown' : wb < -0.7 ? 'tptUp' : 'tptHold';
}

// Kid's hands-off guide (main.js applyAssists): wings level to abeam the pole, then the circle law, the flight
// path back to the entry height (banked, the nose sits only α·cos φ above the path: ask α(1 − cos φ) lower, as
// steepTurns.js). Done: wings level, level.
export const ROLL_LEAD_M = 40; // roll in this far before abeam (the bank takes ~2 s to come)
export function aroundKidGuide(st, s, out) {
  const circling = st.phase === 'circle' || (st.phase === 'entry' && st.along > -ROLL_LEAD_M);
  out.guideBankDeg = circling ? circleBankDeg(st, s, st.side || -1) : 0;
  const err = st.phase === 'circle' ? st.alt0 - s.altFt : 0;
  out.guideGammaDeg = Math.max(-3, Math.min(3, err * 0.02)) - s.aoaDeg * (1 - Math.cos(s.bankDeg / DEG));
}

// The game's adapter: reads the sim (its quaternion's YXZ bank, as steepTurns.js) into one reused input.
// live: the player is flying (cockpitEntered, no menu). Until the first live frame the Cessna is held where it
// spawned (power180.js p180Step's way: the sim flies behind the start screen, and would pass the pole there).
const _s = { dt: 0, x: 0, z: 0, vx: 0, vz: 0, wx: 0, wz: 0, altFt: 0, iasKts: 0, bankDeg: 0, aoaDeg: 0, stalled: false };
export function aroundSimStep(st, sim, dt, live) {
  if (!st.live) {
    if (!live) {
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
  return aroundStep(st, _s);
}
// The coach's word and Kid's guide from the last step's input.
export const aroundCoach = (st, kid) => aroundPrompt(st, _s, kid);
// kidGuide returns the assists' bank cap in the lesson (main.js sets s.bankMaxDeg from it); done, nothing.
export function kidGuide(st, out) {
  if (st.phase === 'complete' || st.phase === 'failed' || !st.live) return 0;
  aroundKidGuide(st, _s, out);
  return ASSIST_BANK_DEG;
}

// The HUD's pole readout (main.js renderHud, in the takeoff call's slot under the heading box, hudLayout.js): its
// distance and clock position from the nose, the way an instructor calls it ("pole at 9 o'clock"): the pole sits under
// the lowered wing, out of a forward view (AFH p. 7-7). Green on the circle (±SAY_OFF_M), amber off it. The text is
// rebuilt only when what it says changes (no string per frame, AGENTS.md invariant 4).
export const POLE_BOX_W = 210, POLE_BOX_H = 24;
let poleFt = -1, poleClock = -1, poleText = '';
export function poleClockOf(st, x, z, hdgTrueDeg) {
  const brg = Math.atan2(st.px - x, -(st.pz - z)) * DEG; // true bearing to the pole (+x east, −z north)
  const rel = ((brg - hdgTrueDeg) % 360 + 360) % 360;
  return Math.round(rel / 30) % 12 || 12;
}
export function drawPole(ctx, cx, top, st, sim, hdgTrueDeg) {
  if (!aroundLive(st) || !st.live) return;
  const ft = Math.round(st.d * M_TO_FT / 10) * 10, clock = poleClockOf(st, sim.pos.x, sim.pos.z, hdgTrueDeg);
  if (ft !== poleFt || clock !== poleClock) { poleFt = ft; poleClock = clock; poleText = `POLE ${ft.toLocaleString('en-US')} FT · ${clock} O'CLOCK`; }
  ctx.fillStyle = 'rgba(2, 6, 23, 0.7)';
  ctx.fillRect(cx - POLE_BOX_W / 2, top, POLE_BOX_W, POLE_BOX_H);
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = st.phase === 'circle' && Math.abs(st.d - st.R) <= SAY_OFF_M ? '#6ee7b7' : '#fcd34d';
  ctx.fillText(poleText, cx, top + 17);
}

// The lit pole: a 60 m mast with a lamp on top over a 25 m disc, unlit materials (it glows at dusk as by day).
// Its height follows the ground under it (main.js moves it as the terrain's DEM arrives).
export function makeMarker(st) {
  const g = new THREE.Group();
  const add = (geo, color, y) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color })); m.position.y = y; g.add(m); };
  add(new THREE.CylinderGeometry(25, 25, 0.6, 24), 0xf97316, 0.3); // the disc on the ground
  add(new THREE.CylinderGeometry(1.5, 2.5, 60, 8), 0xf8fafc, 30); // the mast
  add(new THREE.CylinderGeometry(4, 4, 8, 10), 0xfacc15, 64); // the lamp
  g.position.set(st.px, 0, st.pz);
  return g;
}

const WEIGHTS = { spread: 0.4, radius: 0.1, alt: 0.25, speed: 0.15, bank: 0.1 };
export const ACS_CAP = 84; // the top of a B
export const LOST_CAP = 54; // the top of a D
export const KID_NOTE = 'The plane flew the circles for you'; // results.js already says "Kid level"

// The distance's average and spread (ft) over the circles flown.
export function spreadFt(st) {
  if (!(st.w > 0)) return { meanFt: 0, sdFt: 0 };
  const mean = st.sum / st.w;
  return { meanFt: mean * M_TO_FT, sdFt: Math.sqrt(Math.max(0, st.sumSq / st.w - mean * mean)) * M_TO_FT };
}

// The grade from the lesson's state at 'complete' or 'failed'. Allocates the track's copy (once, for the card).
export function gradeAroundPoint(st, kid = false) {
  const failed = st.phase === 'failed';
  const { meanFt, sdFt } = spreadFt(st);
  const rFt = st.R * M_TO_FT;
  const off = Math.abs(meanFt - rFt);
  const alt = st.maxAltDevFt, kts = st.maxKtsDev, bank = st.maxBankDeg;
  const flown = st.w > 0;
  const factors = [
    { key: 'spread', label: 'Circle held round (spread of your distance)', value: flown ? `±${Math.round(sdFt)} ft` : 'no circle',
      score: flown ? curve(sdFt, [[75, 100], [SPREAD_B_FT, 85], [250, 45], [400, 0]]) : 0 },
    { key: 'radius', label: `Distance from the pole (asked: ${Math.round(rFt).toLocaleString('en-US')} ft)`,
      value: flown ? `${Math.round(meanFt).toLocaleString('en-US')} ft on average` : '–',
      score: flown ? curve(off, [[150, 100], [300, 85], [600, 40], [1000, 0]]) : 0 },
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
    reason = st.why === 'stall' ? 'Stalled in the turn: no steeper than 45°, and keep the speed up.'
      : st.why === 'drift' ? 'The wind carried you away from the pole: steepen the bank as the wind comes behind you.'
        : st.why === 'height' ? `${st.altSignFt < 0 ? 'Lost' : 'Gained'} over ${FAIL_FT} ft: hold your height round the turns.`
          : st.why === 'missed' ? 'Never reached the pole: fly on until it is off your wingtip, then roll round it.'
            : 'Not finished: two full circles round the pole.';
  } else if (sdFt > SPREAD_D_FT) {
    score = Math.min(score, LOST_CAP);
    reason = 'An oval, not a circle: the wind pushed the track out downwind. Steeper as the wind comes behind you, shallower into it. Capped at D.';
  } else if (alt > 2 * ALT_TOL_FT) {
    score = Math.min(score, LOST_CAP);
    reason = `${st.altSignFt < 0 ? 'Lost' : 'Gained'} ${Math.round(alt)} ft: the test allows 100. Capped at D.`;
  } else if (sdFt > SPREAD_B_FT || off > RADIUS_OFF_FT || alt > ALT_TOL_FT || kts > KTS_TOL || st.steepS > STEEP_HOLD_S) {
    score = Math.min(score, ACS_CAP);
    reason = st.steepS > STEEP_HOLD_S ? 'Past 45° of bank: the handbook\'s limit (start the circle wider). No better than a B.'
      : sdFt > SPREAD_B_FT ? `The distance wandered ±${Math.round(sdFt)} ft (the game asks ±${SPREAD_B_FT}; the test sets no number). No better than a B.`
        : off > RADIUS_OFF_FT ? 'A round circle, but not the one asked for. No better than a B.'
          : 'Outside a test tolerance: no better than a B.';
  }
  const track = { pts: st.track.slice(0, 2 * st.trackN), n: st.trackN, start: st.trackStart, R: st.R, wind: st.wx && [st.wx.windDirDeg, st.wx.windKts] };
  return { kind: 'aroundPoint', title: failed ? 'Turns around a point not finished' : 'Turns around a point', grade: letterGrade(score), score, factors, reason,
    note: kid && !failed ? KID_NOTE : null, track };
}

// openaeroDebug's view (scalars: no track, no mesh).
export const debugSnap = (st) => {
  const { meanFt, sdFt } = spreadFt(st);
  return { phase: st.phase, live: st.live, side: st.side, swept: st.swept, d: st.d, along: st.along, R: st.R, ct: st.ct, meanFt, sdFt,
    maxAltDevFt: st.maxAltDevFt, maxKtsDev: st.maxKtsDev, maxBankDeg: st.maxBankDeg, why: st.why, trackN: st.trackN, windKts: st.wx.windKts, windDirDeg: st.wx.windDirDeg };
};

// e2e: fast-forward the lesson to `deg` of the two circles (the flown samples so far stay its grade's).
if (typeof window !== 'undefined') window.openaeroDebugAroundPoint = (deg) => { if (last?.phase === 'circle') last.swept = Math.sign(last.swept || -1) * deg; };
