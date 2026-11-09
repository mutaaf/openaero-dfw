// Steep turns (ticket 0161, a lazy chunk loaded with the mission): the Cessna at 3,000 ft over
// Grapevine Lake rolls into a 360° turn at 45° of bank, then a 360° the other way, holding its
// height and speed, graded to the FAA's private pilot test standard: FAA-S-ACS-6C (Private Pilot
// Airplane ACS, Nov 2023), Area of Operation V, Task A, Steep Turns: roll into a coordinated 360°
// turn with approximately 45° of bank, then the other way; hold the entry altitude ±100 ft, the
// airspeed ±10 kt and the bank ±5°, and roll out on the entry heading ±10°. Pure: no THREE, no DOM.
// Tested in tests/unit/steepTurns.test.js and flown headless in tests/flight/steepTurns.test.js.
import { curve, letterGrade } from './landing.js';
import { DRILL_TEXT, RANK } from './coach.js';
import { stallAoaDeg } from './aero.js';
import { M_TO_FT } from './constants.js';

export const STEEP_KEY = 'steep_turns';
export const STEEP_BANK_DEG = 45;
// The ACS tolerances (Area V Task A, skill S5).
export const STEEP_ALT_TOL_FT = 100;
export const STEEP_KTS_TOL = 10;
export const STEEP_BANK_TOL_DEG = 5;
export const STEEP_HDG_TOL_DEG = 10;
// Kid's and Learner's bank cap in the mission (assists.js s.bankMaxDeg): full stick asks for
// 0.85 of it (CMD_SHARE), so full stick sideways is the 45° the task asks for.
export const STEEP_ASSIST_BANK_DEG = 53;
// A turn starts when the bank passes ROLLED_IN; wings within LEVEL are rolled out. The bank is
// held to the standard between HOLD_FROM° into a turn and HOLD_FROM° short of its 360° (the
// roll-in and roll-out are not a held bank); a turn can end once it has gone ROLLOUT_FROM°.
export const STEEP_ROLLED_IN_DEG = 30;
export const STEEP_LEVEL_DEG = 10;
export const STEEP_HOLD_FROM_DEG = 45;
export const STEEP_ROLLOUT_FROM_DEG = 300;
// Lead the roll-out by about half the bank (FAA-H-8083-3C ch. 10: roll out ~20° before the
// heading at 45°): the coach says "roll out" this far short of the 360°.
export const STEEP_LEAD_DEG = 20;
// Not finished: this far off the entry altitude, this long after the roll-in, or stalled.
export const STEEP_FAIL_FT = 500;
export const STEEP_FAIL_S = 150;
export const STEEP_IAS_TAU_S = 2;
export const STEEP_PLACE = { name: 'Over Grapevine Lake · 3,000 ft' };

export const STEEP_TEXT = {
  sttRollIn: 'Roll into a 45° bank, left or right: hold your height',
  sttBack: 'Ease back as the bank steepens: hold your height',
  sttEase: 'Climbing: ease off the back pressure a little',
  sttSteeper: 'Steeper: 45° of bank',
  sttShallower: 'Too steep: back to 45°',
  sttRollingIn: 'Rolling in: ease back and add power',
  sttLeft: 'Now the other way: roll left to 45°',
  sttRight: 'Now the other way: roll right to 45°',
  sttPower: 'Slowing: add power',
  sttFast: 'Fast: ease off the power',
  sttHold: 'Hold it: 45°, your height, your speed',
  sttReverse: 'Roll out, wings level: release the back pressure, less power. Then the other way',
  sttRollOut: 'Wings level, roll out on your heading: release the back pressure, less power',
  sttKidIn: 'Let go: the plane rolls into a steep turn',
  sttKid: 'The plane holds the turn: watch the nose ride the horizon',
};
Object.assign(DRILL_TEXT, STEEP_TEXT);
Object.assign(RANK, { sttRollIn: 1, sttRollingIn: 1, sttBack: 1, sttEase: 1, sttSteeper: 1, sttShallower: 1, sttPower: 1, sttFast: 1, sttHold: 1,
  sttLeft: 2, sttRight: 2, sttReverse: 2, sttRollOut: 2, sttKidIn: 1, sttKid: 1 });

// phase: 'entry' (wings level, not turning yet), 'turn1', 'turn2' (the other way), 'complete'
// (both turns rolled out: graded), 'failed' (graded D). dir: +1 right, −1 left.
export const createSteepTurns = () => ({
  phase: 'entry', dir: 0, turned: 0, lastHdg: null, hdg0: 0, alt0: 0, kts0: 0, t: 0,
  maxAltDevFt: 0, altSignFt: 0, maxKtsDev: 0, iasF: 0, bankS: 0, bankOkS: 0, rollout: [], why: null,
});

const wrap180 = (d) => ((d % 360) + 540) % 360 - 180;

// One sub-step. st is mutated (no allocation). s: { dt, altFt (any datum, the same each step),
// iasKts, bankDeg (+ = right), hdgDeg (the nose, true), stalled }.
// Returns the transition: 'turn1' | 'reverse' | 'complete' | 'failed' | ''.
export function steepTurnStep(st, s) {
  if (st.phase === 'complete' || st.phase === 'failed') return '';
  const first = st.lastHdg === null;
  const d = first ? 0 : wrap180(s.hdgDeg - st.lastHdg);
  st.lastHdg = s.hdgDeg;
  const abs = Math.abs(s.bankDeg);
  if (st.phase === 'entry') {
    // The entry heading, altitude and speed are the ones where the roll-in began (or the first step's).
    if (abs < STEEP_LEVEL_DEG || first) { st.hdg0 = s.hdgDeg; st.alt0 = s.altFt; st.kts0 = s.iasKts; st.turned = 0; if (abs < STEEP_LEVEL_DEG) return ''; }
    st.turned += d;
    if (abs < STEEP_ROLLED_IN_DEG) return '';
    st.phase = 'turn1'; st.dir = Math.sign(s.bankDeg); st.iasF = s.iasKts;
    return 'turn1';
  }
  st.turned += d; st.t += s.dt;
  const altDev = s.altFt - st.alt0;
  if (Math.abs(altDev) > st.maxAltDevFt) { st.maxAltDevFt = Math.abs(altDev); st.altSignFt = altDev; }
  // The airspeed through a ~2 s filter: a METAR gust's spike is not the pilot's speed (physics panel).
  st.iasF += (s.iasKts - st.iasF) * Math.min(1, s.dt / STEEP_IAS_TAU_S);
  st.maxKtsDev = Math.max(st.maxKtsDev, Math.abs(st.iasF - st.kts0));
  const deg = st.turned * st.dir; // this turn's progress, degrees
  if (deg > STEEP_HOLD_FROM_DEG && deg < 360 - STEEP_HOLD_FROM_DEG) {
    st.bankS += s.dt;
    if (Math.sign(s.bankDeg) === st.dir && Math.abs(abs - STEEP_BANK_DEG) <= STEEP_BANK_TOL_DEG) st.bankOkS += s.dt;
  }
  if (s.stalled || st.maxAltDevFt > STEEP_FAIL_FT || st.t > STEEP_FAIL_S) {
    st.why = s.stalled ? 'stall' : st.maxAltDevFt > STEEP_FAIL_FT ? 'height' : 'time';
    st.phase = 'failed';
    return 'failed';
  }
  if (deg >= STEEP_ROLLOUT_FROM_DEG && abs < STEEP_LEVEL_DEG) {
    // Off the entry heading; a turn that went round again (a 720°) counts its extra turn, not the heading.
    const over = Math.abs(deg - 360);
    st.rollout.push(over > 180 ? over : Math.abs(wrap180(s.hdgDeg - st.hdg0)));
    if (st.phase === 'turn1') { st.phase = 'turn2'; st.dir = -st.dir; st.turned = 0; return 'reverse'; }
    st.phase = 'complete';
    return 'complete';
  }
  return '';
}

// The coach's word for this moment (coach.js s.ds, rank 1-2). kid: the guide flies it.
export function steepPrompt(st, s, kid) {
  if (st.phase === 'complete' || st.phase === 'failed') return null;
  if (kid) return st.phase === 'entry' ? 'sttKidIn' : 'sttKid';
  if (st.phase === 'entry') return 'sttRollIn';
  const deg = st.turned * st.dir;
  if (deg >= 360 - STEEP_LEAD_DEG) return st.phase === 'turn1' ? 'sttReverse' : 'sttRollOut';
  const bank = s.bankDeg * st.dir; // + = banked the turn's way
  // The second turn: which way, until the player is banked that way (the same way again never ends it).
  if (st.phase === 'turn2' && deg < STEEP_HOLD_FROM_DEG && bank < STEEP_ROLLED_IN_DEG) return st.dir > 0 ? 'sttRight' : 'sttLeft';
  // Rolling in: the lift tilts, so the back pressure and the power go in now, not after the height goes.
  if (deg < STEEP_HOLD_FROM_DEG) return 'sttRollingIn';
  const altDev = s.altFt - st.alt0;
  if (altDev < -STEEP_ALT_TOL_FT / 2) return 'sttBack';
  if (altDev > STEEP_ALT_TOL_FT / 2) return 'sttEase';
  if (bank < STEEP_BANK_DEG - STEEP_BANK_TOL_DEG) return 'sttSteeper';
  if (bank > STEEP_BANK_DEG + STEEP_BANK_TOL_DEG) return 'sttShallower';
  if (s.iasKts < st.kts0 - STEEP_KTS_TOL * 0.5) return 'sttPower';
  if (s.iasKts > st.kts0 + STEEP_KTS_TOL * 0.5) return 'sttFast';
  return 'sttHold';
}

// Kid's hands-off guide (main.js applyAssists): rolls right into the turn, the other way for the
// second, wings level for the last STEEP_LEAD_DEG of each; the flight path climbs or descends
// gently back to the entry altitude. assists.js holds pitch = path + α, but banked the nose sits
// only α·cos φ above the path, so the guide asks α(1 − cos φ) lower to stay level.
export function steepKidGuide(st, s, out) {
  let bank = st.phase === 'entry' ? STEEP_BANK_DEG : st.phase === 'turn1' || st.phase === 'turn2' ? STEEP_BANK_DEG * st.dir : 0;
  if (st.phase !== 'entry' && st.turned * st.dir >= 360 - STEEP_LEAD_DEG) bank = 0;
  out.guideBankDeg = bank;
  const err = st.phase === 'entry' ? 0 : st.alt0 - s.altFt;
  out.guideGammaDeg = Math.max(-3, Math.min(3, err * 0.02)) - s.aoaDeg * (1 - Math.cos(s.bankDeg * Math.PI / 180));
}

// The game's adapter: reads the sim (its quaternion's YXZ angles, as main.js _euler reads them)
// into one reused input, steps the drill and returns its transition.
const _s = { dt: 0, altFt: 0, iasKts: 0, bankDeg: 0, hdgDeg: 0, aoaDeg: 0, stalled: false };
export function steepStep(st, sim, dt) {
  const { x, y, z, w } = sim.quat;
  _s.dt = dt;
  _s.altFt = sim.pos.y * M_TO_FT;
  _s.iasKts = sim.iasKts;
  _s.bankDeg = -Math.atan2(2 * (x * y + w * z), 1 - 2 * (x * x + z * z)) * 180 / Math.PI;
  _s.hdgDeg = (-Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y)) * 180 / Math.PI + 360) % 360;
  _s.aoaDeg = sim.aoaDeg;
  _s.stalled = sim.aoaDeg > stallAoaDeg(sim.spec, sim.flapsIndex);
  return steepTurnStep(st, _s);
}
// The coach's word and Kid's guide from the last step's input.
export const steepCoach = (st, kid) => steepPrompt(st, _s, kid);
// kidGuide returns the assists' bank cap in the mission (main.js sets s.bankMaxDeg from it).
export const kidGuide = (st, out) => (steepKidGuide(st, _s, out), STEEP_ASSIST_BANK_DEG);

const WEIGHTS = { alt: 0.35, speed: 0.2, bank: 0.25, rollout: 0.2 };
export const STEEP_ACS_CAP = 84; // the top of a B: outside a test tolerance is not an A
export const STEEP_LOST_CAP = 54; // the top of a D
// The bank is held to ±5° too: under 90% of each turn's middle at 45° ±5 is outside the standard (≤ B),
// under 30% is not a steep turn (≤ D).
export const STEEP_BANK_SHARE_B = 0.9;
export const STEEP_BANK_SHARE_D = 0.3;
export const STEEP_KID_NOTE = 'The plane flew the turns for you'; // results.js already says "Kid level"

// The grade from the drill's state at 'complete' or 'failed'.
export function gradeSteepTurns(st, kid = false) {
  const failed = st.phase === 'failed';
  const alt = st.maxAltDevFt, kts = st.maxKtsDev;
  const share = st.bankS > 0 ? st.bankOkS / st.bankS : 0;
  const roll = st.rollout.length === 2 ? Math.max(...st.rollout) : null;
  const factors = [
    { key: 'alt', label: 'Altitude held (test: ±100 ft)', value: `${Math.round(alt) === 0 ? '' : st.altSignFt < 0 ? '−' : '+'}${Math.round(alt)} ft at worst`,
      score: curve(alt, [[50, 100], [100, 85], [200, 40], [300, 10], [400, 0]]) },
    { key: 'speed', label: 'Airspeed held (test: ±10 kt)', value: `±${Math.round(kts)} kt at worst`,
      score: curve(kts, [[5, 100], [10, 85], [15, 50], [25, 0]]) },
    { key: 'bank', label: 'Time at 45° ±5 of bank', value: `${Math.round(share * 100)}%`,
      score: curve(1 - share, [[0.05, 100], [0.2, 85], [0.5, 40], [0.8, 0]]) },
    { key: 'rollout', label: 'Rolled out on the heading (test: ±10°)', value: roll === null ? 'not both' : `${Math.round(roll)}° off`,
      score: roll === null ? 0 : curve(roll, [[5, 100], [10, 85], [20, 40], [45, 0]]) },
  ];
  for (const f of factors) f.score = Math.round(f.score);
  let score = Math.round(factors.reduce((sum, f) => sum + f.score * WEIGHTS[f.key], 0));
  let reason = null;
  if (failed) {
    score = Math.min(score, STEEP_LOST_CAP);
    reason = st.why === 'stall' ? 'Stalled in the turn: at 45° of bank the stall speed is ~19% higher. Roll shallower, then ease back.'
      : st.why === 'height' ? (st.altSignFt < 0 ? `Lost over ${STEEP_FAIL_FT} ft: ease back as you roll in, and add power.`
        : `Gained over ${STEEP_FAIL_FT} ft: less back pressure, and ease off the power.`)
        : 'Not finished: two 360° turns, one each way.';
  } else if (alt > 2 * STEEP_ALT_TOL_FT) {
    score = Math.min(score, STEEP_LOST_CAP);
    reason = `${st.altSignFt < 0 ? 'Lost' : 'Gained'} ${Math.round(alt)} ft: the test allows 100. Capped at D.`;
  } else if (share < STEEP_BANK_SHARE_D) {
    score = Math.min(score, STEEP_LOST_CAP);
    reason = 'Not a steep turn: hold 45° of bank. Capped at D.';
  } else if (alt > STEEP_ALT_TOL_FT || kts > STEEP_KTS_TOL || roll > STEEP_HDG_TOL_DEG || share < STEEP_BANK_SHARE_B) {
    score = Math.min(score, STEEP_ACS_CAP);
    reason = share < STEEP_BANK_SHARE_B ? 'Bank outside 45° ±5 for part of the turns: no better than a B.' : 'Outside a test tolerance: no better than a B.';
  }
  return { kind: 'steepTurns', title: failed ? 'Steep turns not finished' : 'Steep turns', grade: letterGrade(score), score, factors, reason,
    note: kid && !failed ? STEEP_KID_NOTE : null };
}
