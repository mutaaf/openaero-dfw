// Emergency descent (ticket 0209, a lazy chunk loaded with the mission): smoke in the cockpit over
// Grapevine Lake, get the Cessna down 3,000 ft as fast as it safely goes and level off, graded to the
// FAA's private pilot test standard: FAA-S-ACS-6C (Private Pilot Airplane ACS, Nov 2023), Area of
// Operation IX, Task A, Emergency Descent (p. 51): S4 "use bank angle between 30° and 45° to maintain
// positive load factors during the descent"; S5 "maintain appropriate airspeed +0/-10 knots, and level
// off at a specified altitude ±100 feet". The technique is the Airplane Flying Handbook's
// (FAA-H-8083-3C, ch. 18, Emergency Descents): power to idle, a 30-45° bank, "the maximum allowable
// airspeed consistent with the procedure", never past VNE (or VFE with flaps out), VA in turbulence.
// The 172S POH has no emergency-descent procedure (Section 3's "descent through clouds" is a 500-800
// fpm let-down), so the drill's airspeed is its maneuvering speed, 105 KIAS at 2,550 lb (POH Section 3,
// Airspeeds for Emergency Operations): the drill flies in today's METAR, which may be bumpy, and with a
// fire on board the handbook warns that a weakened structure wants less speed, not more. Band 95-105.
// Pure: no THREE, no DOM. Tested in tests/unit/emergencyDescent.test.js, flown headless in
// tests/flight/emergencyDescent.test.js.
import { curve, letterGrade } from './landing.js';
import { DRILL_TEXT, RANK } from './coach.js';
import { stallAoaDeg, stallWarningKts, speedLimitKts } from './aero.js';
import { M_TO_FT } from './constants.js';

export const ED_KEY = 'c172_emergency_descent';
// The descent: from where the player starts to ED_DROP_FT lower, rounded to the 100 ft the tape shows.
export const ED_DROP_FT = 3000;
// The appropriate airspeed (S5's +0/-10): the C172S's VA, POH Section 3.
export const ED_TARGET_KTS = 105;
export const ED_KTS_UNDER = 10;
// S4's bank.
export const ED_BANK_MIN_DEG = 30;
export const ED_BANK_MAX_DEG = 45;
export const ED_BANK_GRACE_DEG = 1;
// S5's level-off, held for ED_LEVEL_S once within ED_ALT_TOL_FT on the way down.
export const ED_ALT_TOL_FT = 100;
export const ED_LEVEL_S = 15;
export const ED_ROUND_S = 5;
export const ED_LEVEL_NEAR_FT = 500;
export const ED_LEVEL_VS_FPM = 300;
export const ED_LEVEL_VS_S = 3;
// Not finished: not at the level-off this long after the start (a 500 fpm let-down takes 6 min), through it by
// ED_LOW_FT, stalled, past the airplane's speed limit for ED_LIMIT_S, or past its +3.8 g (POH Section 2, normal category).
export const ED_FAIL_S = 240;
export const ED_LOW_FT = 300;
export const ED_LIMIT_S = 0.5;
export const ED_G_LIMIT = 3.8;
// Positive load factors (S4, the handbook's reason for the bank): the seat's g through ED_G_TAU_S under ED_G_MIN (the ACS's
// "positive", literally) is named, and a pull past ED_G_PULL (the drill's own line, two thirds of the +3.8 g limit: no
// source gives one). The filter is the METAR's: at 0.5 s the handbook pilot read 0.19-2.54 g in 25G38 with the stick
// frozen (physics panel); at 2 s every gusty seed stays within 0.6-1.9 g (tests/flight/emergencyDescent.test.js).
export const ED_G_MIN = 0;
export const ED_G_PULL = 2.5;
export const ED_G_TAU_S = 2;
// The structural limit reads the raw seat g held ED_G_LIMIT_S (as ED_LIMIT_S): a snatch past +3.8 g is not filtered away.
export const ED_G_LIMIT_S = 0.15;
export const ED_IAS_TAU_S = 2; // as steepTurns.js / slowFlight.js: a gust's spike is not the pilot's speed
// The grade's descent: the bank and the speed are held from ED_SETTLE_S after the start until ED_LEAD_FT above the
// level-off (the roll-in and the level-off are not a held descent); power above ED_IDLE for ED_POWER_S is not idle.
export const ED_SETTLE_S = 5;
export const ED_LEAD_FT = 300;
export const ED_IDLE = 0.1;
export const ED_POWER_S = 3;
export const ED_WARN_S = 1;
// Kid's guide: banks ED_KID_BANK_DEG right and flies the band's middle; Kid and Learner get a ED_ASSIST_BANK_DEG cap
// (assists.js s.bankMaxDeg: full stick asks for 0.85 of it, 40°: their usual 30° and 45° caps would hold Kid under S4's 30°).
export const ED_KID_BANK_DEG = 40;
export const ED_KID_KTS = 100;
// Kid's path starts where the descent settles (~-9° at idle, 40° and 100 KIAS, flightModel.js): from 0 the integral sagged
// through 90 kt for 15 s (physics panel).
export const ED_KID_GAMMA0_DEG = -9;
export const ED_ASSIST_BANK_DEG = 47;
export const ED_PLACE = { name: 'Over Grapevine Lake · down 3,000 ft' };

export const ED_TEXT = {
  edwSmoke: 'Smoke in the cockpit! Emergency descent: power idle, bank 30-45°, nose down to 95-105 kt',
  edwIdle: 'Power to idle: the idling prop is a brake',
  edwBank: 'Bank 30-45°: the turn steepens the descent and you see what\'s below',
  edwSteep: 'Too steep: 45° of bank at most',
  edwNoseDown: 'Nose down: push the stick forward a little until the speed is 95-105 kt',
  edwFast: 'Too fast: over 105 kt. Ease the nose up a little',
  edwPull: 'Gently: don\'t pull hard, ease the nose up',
  edwHold: 'Hold it: idle, 30-45° of bank, 95-105 kt',
  edwLevelOff: 'Level off now: wings level, raise the nose, add power',
  edwLevel: 'Hold your new height',
  edwLow: 'Too low: climb back up',
  edwHigh: 'A little high: ease down',
  edwKidIn: 'Smoke! Let go: the plane goes down fast in a turn',
  edwKid: 'The plane spirals down: watch SEA LVL count down',
  edwKidLevel: 'The plane levels off: down safely',
};
Object.assign(DRILL_TEXT, ED_TEXT);
Object.assign(RANK, { edwSmoke: 2, edwIdle: 2, edwPull: 2, edwBank: 1, edwSteep: 1, edwNoseDown: 1, edwFast: 1, edwHold: 1,
  edwLevelOff: 2, edwLevel: 1, edwLow: 1, edwHigh: 1, edwKidIn: 1, edwKid: 1, edwKidLevel: 1 });
// The level-off's height in the words (the tape shows MSL): rewritten when it is set, in the drill's own DRILL_TEXT.
const ftWords = (ft) => `${Math.round(ft).toLocaleString('en-US')} ft`;
export function descentWords(targetFt) {
  const t = ftWords(targetFt);
  DRILL_TEXT.edwSmoke = `Smoke in the cockpit! Emergency descent to ${t}: power idle, bank 30-45°, nose down to 95-105 kt`;
  DRILL_TEXT.edwHold = `Hold it: idle, 30-45° of bank, 95-105 kt, down to ${t}`;
  DRILL_TEXT.edwKid = `The plane spirals down to ${t}: watch SEA LVL`; // ≤ ~50 characters: 2 lines on a phone held sideways (device panel)
  DRILL_TEXT.edwLevelOff = `Level off at ${t}: wings level, raise the nose, add power`;
  DRILL_TEXT.edwLevel = `Hold ${t}`;
  DRILL_TEXT.edwLow = `Too low: climb back to ${t}`;
  DRILL_TEXT.edwHigh = `A little high: ease down to ${t}`;
  DRILL_TEXT.edwKidIn = `Smoke! Let go: the plane goes down to ${t}`;
  DRILL_TEXT.edwKidLevel = `The plane levels off at ${t}: down safely`;
}

// phase: 'wait' (the start screen: the drill starts when the player does), 'descending', 'leveling' (within
// 100 ft of the level-off: held ED_LEVEL_S), 'complete' (graded), 'failed' (graded D).
export const createEmergencyDescent = () => ({
  phase: 'wait', alt0: 0, targetFt: 0, t: 0, reachS: 0, levelS: 0, iasF: 0, gF: 1, lastIas: null, iasRate: 0,
  heldS: 0, stopS: 0, gOverS: 0, bankOkS: 0, bankLowS: 0, inBandS: 0, overKts: 0, underKts: 0, powerS: 0, limitS: 0, limitKts: 0, flapsOut: false,
  maxG: 1, minG: 1, warnRunS: 0, warned: false, levelDevFt: 0, levelSignFt: 0, lowFt: 0, why: null, kidGamma: 0,
});

// One sub-step. st is mutated (no allocation). s: { dt, started (the player is flying), altFt (MSL), vsFpm, iasKts,
// bankDeg (+ = right), loadFactor (the seat's g), throttle (0-1), limitKts (aero.js speedLimitKts where the flaps are),
// flapsOut, warnKts (the horn's speed), aoaDeg, stalled }.
// Returns the transition: 'descending' | 'leveling' | 'complete' | 'failed' | ''.
export function descentStep(st, s) {
  if (st.phase === 'complete' || st.phase === 'failed') return '';
  if (st.phase === 'wait') {
    // The specified altitude is set from where the player starts.
    st.alt0 = s.altFt; st.targetFt = Math.round((s.altFt - ED_DROP_FT) / 100) * 100; st.iasF = s.iasKts; st.gF = s.loadFactor;
    if (!s.started) return '';
    st.phase = 'descending';
    st.kidGamma = ED_KID_GAMMA0_DEG;
    return 'descending';
  }
  st.t += s.dt;
  if (st.lastIas !== null) st.iasRate += ((s.iasKts - st.lastIas) / s.dt - st.iasRate) * Math.min(1, s.dt / 0.5);
  st.lastIas = s.iasKts;
  st.iasF += (s.iasKts - st.iasF) * Math.min(1, s.dt / ED_IAS_TAU_S);
  st.gF += (s.loadFactor - st.gF) * Math.min(1, s.dt / ED_G_TAU_S);
  st.gOverS = s.loadFactor > ED_G_LIMIT ? st.gOverS + s.dt : 0;
  st.maxG = Math.max(st.maxG, st.gF); st.minG = Math.min(st.minG, st.gF);
  // The airplane's limits: VNE clean, VFE with the flaps out (the raw IAS, held ED_LIMIT_S).
  st.limitS = s.limitKts && s.iasKts > s.limitKts ? st.limitS + s.dt : 0;
  st.warnRunS = s.iasKts < s.warnKts ? st.warnRunS + s.dt : 0;
  if (st.warnRunS >= ED_WARN_S) st.warned = true;
  const above = s.altFt - st.targetFt;
  if (s.stalled || st.limitS >= ED_LIMIT_S || st.gOverS >= ED_G_LIMIT_S || above < -ED_LOW_FT || (st.phase === 'descending' && st.t > ED_FAIL_S)) {
    st.why = s.stalled ? 'stall' : st.limitS >= ED_LIMIT_S ? 'limit' : st.gOverS >= ED_G_LIMIT_S ? 'g' : above < -ED_LOW_FT ? 'low' : Math.abs(s.vsFpm) < ED_LEVEL_VS_FPM ? 'high' : 'time';
    if (st.why === 'limit') { st.limitKts = s.limitKts; st.flapsOut = s.flapsOut; }
    st.lowFt = Math.min(st.lowFt, above);
    st.phase = 'failed';
    return 'failed';
  }
  if (st.phase === 'descending') {
    if (st.t > ED_SETTLE_S && above > ED_LEAD_FT) {
      st.heldS += s.dt;
      const bank = Math.abs(s.bankDeg);
      if (bank >= ED_BANK_MIN_DEG && bank <= ED_BANK_MAX_DEG + ED_BANK_GRACE_DEG) st.bankOkS += s.dt; // 45° is inside: a hold rides 45-45.5
      else if (bank < ED_BANK_MIN_DEG) st.bankLowS += s.dt;
      if (st.iasF <= ED_TARGET_KTS && st.iasF >= ED_TARGET_KTS - ED_KTS_UNDER) st.inBandS += s.dt;
      st.overKts = Math.max(st.overKts, st.iasF - ED_TARGET_KTS);
      st.underKts = Math.max(st.underKts, ED_TARGET_KTS - ED_KTS_UNDER - st.iasF);
      if (s.throttle > ED_IDLE) st.powerS += s.dt;
    }
    // The level-off: within 100 ft of it, or the descent stopped (under ED_LEVEL_VS_FPM for ED_LEVEL_VS_S) within ED_LEVEL_NEAR_FT
    // above it (levelled high: graded as a miss, not as a descent that never finished).
    st.stopS = above < ED_LEVEL_NEAR_FT && Math.abs(s.vsFpm) < ED_LEVEL_VS_FPM ? st.stopS + s.dt : 0;
    if (above > ED_ALT_TOL_FT && st.stopS < ED_LEVEL_VS_S) return '';
    st.phase = 'leveling'; st.reachS = st.t;
    return 'leveling';
  }
  // The hold counts only while level (S5: levelled off, not still sinking through it at a let-down's rate).
  if (Math.abs(s.vsFpm) < ED_LEVEL_VS_FPM) st.levelS += s.dt;
  // The level-off (S5): any height under it, and over it once the round-out has had ED_ROUND_S (the 100 ft it is entered at
  // is the descent's, not a miss).
  if ((above < 0 || st.levelS > ED_ROUND_S) && Math.abs(above) > st.levelDevFt) { st.levelDevFt = Math.abs(above); st.levelSignFt = above; }
  st.lowFt = Math.min(st.lowFt, above);
  if (st.levelS < ED_LEVEL_S) return '';
  st.phase = 'complete';
  return 'complete';
}

// Where to start the level-off: the handbook's lead of ~10% of the vertical speed (FAA-H-8083-3C ch. 3), at least 100 ft.
export const levelLeadFt = (vsFpm) => Math.max(ED_ALT_TOL_FT, 0.1 * Math.abs(vsFpm));

// The coach's word for this moment (coach.js s.ds, rank 1-2). kid: the guide and the autothrottle fly it.
export function descentPrompt(st, s, kid) {
  if (st.phase === 'complete' || st.phase === 'failed') return null;
  const above = s.altFt - st.targetFt;
  const leveling = st.phase === 'leveling' || (st.phase === 'descending' && above < levelLeadFt(s.vsFpm) + ED_ALT_TOL_FT);
  if (kid) return st.phase === 'wait' || st.t < 4 ? 'edwKidIn' : leveling ? 'edwKidLevel' : 'edwKid';
  if (st.phase === 'wait' || st.t < 4) return 'edwSmoke';
  if (st.gF > ED_G_PULL - 0.3) return 'edwPull';
  if (st.phase === 'leveling') return above < -ED_ALT_TOL_FT / 2 ? 'edwLow' : above > 0 && s.vsFpm < -ED_LEVEL_VS_FPM ? 'edwLevelOff' : above > ED_ALT_TOL_FT / 2 ? 'edwHigh' : 'edwLevel';
  if (leveling) return 'edwLevelOff';
  if (s.throttle > ED_IDLE) return 'edwIdle';
  const bank = Math.abs(s.bankDeg);
  if (bank < ED_BANK_MIN_DEG) return 'edwBank';
  if (bank > ED_BANK_MAX_DEG + 2) return 'edwSteep';
  if (st.iasF > ED_TARGET_KTS) return 'edwFast';
  if (st.iasF < ED_TARGET_KTS - ED_KTS_UNDER) return 'edwNoseDown';
  return 'edwHold';
}

// Kid's hands-off guide (main.js applyAssists): banks ED_KID_BANK_DEG right and pitches for ED_KID_KTS (the flight path
// walked by the speed error, damped by its trend: an integral alone drives the phugoid, LESSONS 2026-10-19); from the
// level-off's lead, wings level and the path back to the level-off. kidIdle: main.js holds Kid's throttle at idle.
export function descentKidGuide(st, s, out) {
  if (st.phase === 'wait') return;
  const above = s.altFt - st.targetFt;
  if (st.phase === 'leveling' || above < levelLeadFt(s.vsFpm) + ED_ALT_TOL_FT) {
    out.guideBankDeg = 0;
    out.guideGammaDeg = Math.max(-3, Math.min(3, -above * 0.02));
    return;
  }
  out.guideBankDeg = st.t < 1 ? 0 : ED_KID_BANK_DEG;
  st.kidGamma = Math.max(-20, Math.min(0, st.kidGamma + ((s.iasKts - ED_KID_KTS) * 0.08 + st.iasRate * 0.5) * s.dt));
  out.guideGammaDeg = st.kidGamma;
}
export const descentKidIdle = (st, altFt, vsFpm) => st.phase === 'descending' && altFt - st.targetFt >= levelLeadFt(vsFpm) + ED_ALT_TOL_FT;
export const ED_KID_LEVEL_KTS = 95; // Kid's autothrottle after the level-off: the steep turns' cruise

// The game's adapter: reads the sim (its quaternion's YXZ bank, as steepTurns.js) into one reused input, steps the
// drill and returns its transition. started: the player is flying (main.js cockpitEntered && !modalOpen(): the sim
// flies behind the start screen, docs/LESSONS.md 0174). The altitude is MSL: the tape's (sim.mslOffsetM).
const _s = { dt: 0, started: false, altFt: 0, vsFpm: 0, iasKts: 0, bankDeg: 0, loadFactor: 1, throttle: 0, limitKts: 0, flapsOut: false, warnKts: 0, aoaDeg: 0, stalled: false };
let wordsFt = null, wordsRev = 0;
export function descentSimStep(st, sim, dt, started) {
  const { x, y, z, w } = sim.quat;
  const flapDeg = sim.flapDeg ?? 0, flaps = sim.flapPos ?? sim.flapsIndex;
  _s.dt = dt;
  _s.started = started;
  _s.altFt = (sim.pos.y + (sim.mslOffsetM ?? 0)) * M_TO_FT;
  _s.vsFpm = sim.vel.y * M_TO_FT * 60;
  _s.iasKts = sim.iasKts;
  _s.bankDeg = -Math.atan2(2 * (x * y + w * z), 1 - 2 * (x * x + z * z)) * 180 / Math.PI;
  _s.loadFactor = sim.loadFactor ?? 1;
  _s.throttle = sim.engineFailed ? 0 : sim.throttle ?? 0;
  _s.limitKts = speedLimitKts(sim.spec, flapDeg);
  _s.flapsOut = flapDeg > 0.5;
  _s.warnKts = stallWarningKts(sim.spec, flaps);
  _s.aoaDeg = sim.aoaDeg ?? 0;
  _s.stalled = _s.aoaDeg > stallAoaDeg(sim.spec, flaps);
  const ev = descentStep(st, _s);
  if (st.targetFt !== wordsFt) { wordsFt = st.targetFt; descentWords(st.targetFt); wordsRev++; }
  return ev;
}
export const descentCoach = (st, kid) => descentPrompt(st, _s, kid);
export const descentWordsRev = () => wordsRev;
// kidGuide returns the assists' bank cap in the mission (main.js sets s.bankMaxDeg from it).
export const kidGuide = (st, out) => (descentKidGuide(st, _s, out), ED_ASSIST_BANK_DEG);
export const kidIdle = (st) => descentKidIdle(st, _s.altFt, _s.vsFpm);

const WEIGHTS = { rate: 0.3, speed: 0.3, bank: 0.2, level: 0.2 };
export const ED_ACS_CAP = 84; // the top of a B: outside a test tolerance is not an A
export const ED_WARN_CAP = 69; // the top of a C
export const ED_LOST_CAP = 54; // the top of a D
// The share of the held descent inside S4's bank and S5's band: under ED_SHARE_B is outside the standard (≤ B); under
// ED_BANK_SHARE_C of it in the bank, the rest under 30°, is a straight dive (≤ C). A descent slower than ED_SLOW_FPM is not an emergency descent (≤ D).
export const ED_SHARE_B = 0.8;
export const ED_BANK_SHARE_C = 0.3;
export const ED_SLOW_FPM = 1000;
export const ED_KID_NOTE = 'The plane flew the descent for you';

// The grade from the drill's state at 'complete' or 'failed'.
export function gradeEmergencyDescent(st, kid = false) {
  const failed = st.phase === 'failed';
  const reachS = st.reachS || st.t;
  const droppedFt = st.alt0 - st.targetFt - ED_ALT_TOL_FT;
  const fpm = reachS > 0 && !failed ? droppedFt / reachS * 60 : 0;
  const bankShare = st.heldS > 0 ? st.bankOkS / st.heldS : 0, bandShare = st.heldS > 0 ? st.inBandS / st.heldS : 0;
  const dev = st.levelDevFt;
  const factors = [
    { key: 'rate', label: `Down to ${ftWords(st.targetFt)}`, value: failed ? 'not finished' : `${Math.round(reachS)} s (${Math.round(fpm / 10) * 10} fpm)`,
      score: failed ? 0 : curve(-fpm, [[-1700, 100], [-1400, 85], [-1000, 40], [-600, 0]]) },
    { key: 'speed', label: `Time at ${ED_TARGET_KTS - ED_KTS_UNDER}-${ED_TARGET_KTS} kt (test: +0/-10)`, value: `${Math.round(bandShare * 100)}%`,
      score: curve(1 - bandShare, [[0.1, 100], [0.2, 85], [0.5, 40], [0.8, 0]]) },
    { key: 'bank', label: 'Time at 30-45° of bank (test)', value: `${Math.round(bankShare * 100)}%`,
      score: curve(1 - bankShare, [[0.1, 100], [0.2, 85], [0.5, 40], [0.8, 0]]) },
    { key: 'level', label: 'Level-off (test: ±100 ft)', value: st.phase === 'complete' ? `${Math.round(dev) === 0 ? '' : st.levelSignFt < 0 ? '−' : '+'}${Math.round(dev)} ft at worst` : 'not reached',
      score: st.phase === 'complete' ? curve(dev, [[50, 100], [100, 85], [200, 40], [300, 0]]) : 0 },
  ];
  for (const f of factors) f.score = Math.round(f.score);
  let score = Math.round(factors.reduce((sum, f) => sum + f.score * WEIGHTS[f.key], 0));
  let reason = null;
  // The binding cap's reason: the lowest cap wins, the first of equal ones; a cap above the score adds no "no better than".
  let capAt = Infinity;
  const cap = (c, why) => { if (c < capAt) { capAt = c; reason = why; } score = Math.min(score, c); };
  if (failed) {
    score = Math.min(score, ED_LOST_CAP);
    reason = st.why === 'stall' ? 'Stalled: in a descent the nose stays down. Lower it, then level off gently.'
      : st.why === 'limit' ? (st.flapsOut ? `Past the flaps' ${Math.round(st.limitKts)} kt limit: flaps up for the descent, or keep it slower.`
        : `Past ${Math.round(st.limitKts)} kt, the never-exceed speed: a structural limit. Idle, bank 30-45° and raise the nose a little to hold 95-105 kt.`)
        : st.why === 'g' ? `Over ${ED_G_LIMIT} g, the Cessna's limit: ease out of a dive, never snatch the stick back.`
          : st.why === 'low' ? `Went ${ED_LOW_FT} ft through your level-off: start levelling ~10% of your descent rate early (2,000 fpm: 200 ft).`
            : st.why === 'high' ? `Levelled off too high: the level-off is ${ftWords(st.targetFt)} (SEA LVL on the altitude tape). Keep going down to it.`
              : 'Too slow for an emergency: idle, bank 30-45° and lower the nose to 95-105 kt to get down fast.';
  } else {
    if (fpm < ED_SLOW_FPM) cap(ED_LOST_CAP, `${Math.round(fpm / 10) * 10} fpm is a let-down, not an emergency descent: ${bandShare < ED_SHARE_B && st.underKts > 0
      ? `at ${Math.round(ED_TARGET_KTS - ED_KTS_UNDER - st.underKts)} kt the nose was too high. Push it down to 95-105 kt` : 'idle, bank 30-45°, 95-105 kt'}. Capped at D.`);
    if (dev > 2 * ED_ALT_TOL_FT) cap(ED_LOST_CAP, `${st.levelSignFt < 0 ? 'Went' : 'Stayed'} ${Math.round(dev)} ft ${st.levelSignFt < 0 ? 'under' : 'over'} your level-off: the test allows 100. Capped at D.`);
    if (st.warned) cap(ED_WARN_CAP, 'The stall warning sounded: level off with power, not by pulling the speed away. Capped at C.');
    if (st.heldS > 0 && st.bankLowS / st.heldS > 1 - ED_BANK_SHARE_C) cap(ED_WARN_CAP, 'You stayed in a straight dive: bank 30-45° steepens it, keeps the g positive and shows you the clear air under you. Capped at C.');
    if (st.minG < ED_G_MIN) cap(ED_ACS_CAP, `Pushed to ${st.minG.toFixed(1)} g, below zero: roll into the bank and let the nose fall, don't push. No better than a B.`);
    if (st.maxG > ED_G_PULL) cap(ED_ACS_CAP, `Pulled ${st.maxG.toFixed(1)} g: ease the nose up, never snatch it. No better than a B.`);
    if (st.powerS > ED_POWER_S) cap(ED_ACS_CAP, 'Power left in: idle, the idling prop is a brake. No better than a B.');
    if (st.overKts > 0 && bandShare < ED_SHARE_B) cap(ED_ACS_CAP, `Up to ${Math.round(ED_TARGET_KTS + st.overKts)} kt: the drill's speed is 105 kt (the Cessna's maneuvering speed, for bumpy air and a fire-weakened airframe) and the test allows +0. Ease the nose up. No better than a B.`);
    if (bandShare < ED_SHARE_B) cap(ED_ACS_CAP, `Slow (down to ${Math.round(ED_TARGET_KTS - ED_KTS_UNDER - st.underKts)} kt) for part of it: lower the nose to 95-105 kt. No better than a B.`);
    if (bankShare < ED_SHARE_B) cap(ED_ACS_CAP, 'Bank outside 30-45° for part of it: no better than a B.');
    if (dev > ED_ALT_TOL_FT) cap(ED_ACS_CAP, `Levelled off ${Math.round(dev)} ft ${st.levelSignFt < 0 ? 'low' : 'high'}: the test allows 100. No better than a B.`);
  }
  if (!failed && reason && score < capAt) reason = reason.replace(/ (No better than a B|Capped at [CD])\.$/, '');
  return { kind: 'emergencyDescent', title: failed ? 'Emergency descent not finished' : 'Emergency descent', grade: letterGrade(score), score, factors, reason,
    note: kid && !failed ? ED_KID_NOTE : null };
}
