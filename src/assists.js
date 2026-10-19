// Assist levels (ticket 0042): Kid · Learner · Pilot over the same physics. Pure: no THREE,
// no DOM (storage is passed in). Assists only shape the pilot's input before
// stepFlightModel; Pilot is the raw airplane and never calls in here.
// Tested in tests/unit/assists.test.js (headless, on the real flight model).
//
// Kid and Learner fly a simplified "normal law" (Airbus-style envelope protection):
//   - the stick commands a bank angle (release = wings level), never past bankMaxDeg;
//   - fore/aft stick moves a held pitch attitude (release = hold it: auto-trim), capped;
//   - angle-of-attack protection keeps the wing below its stall angle: a stall becomes a
//     gentle nose-drop;
//   - auto-coordination: the rudder cancels sideslip unless the pilot is using it.
// Kid adds hands-off guidance (let go of the stick and the airplane eases back to level
// flight, or onto the localizer and glidepath when it is on a final), a no-dive floor
// below ~500 ft and an auto-flare near the ground, and main.js adds the autothrottle, automatic
// gear/flaps and a hard landing that resets instead of crashing (see ASSIST_CONFIG).
import { aileronForBank, elevatorForPitch, flareSinkMps, bankCommandForHeading } from './autopilot.js';
import { headingError } from './aero.js';

export const ASSIST_KEY = 'openaero_assist_v1';
export const ASSIST_LEVELS = ['kid', 'learner', 'pilot'];
// Pilot by default: a returning player keeps today's airplane until they pick a level.
export const DEFAULT_ASSIST = 'pilot';

export const ASSIST_CONFIG = {
  kid: {
    bankMaxDeg: 30, pitchUpMaxDeg: 15, pitchDownMaxDeg: -10, aoaMarginDeg: 4,
    autoThrottle: true, autoConfig: true, autoFlare: true, softLanding: true, groundFloor: true, handsOff: true,
  },
  learner: {
    bankMaxDeg: 45, pitchUpMaxDeg: 20, pitchDownMaxDeg: -15, aoaMarginDeg: 4,
    autoThrottle: false, autoConfig: false, autoFlare: false, softLanding: false, groundFloor: false, handsOff: false,
  },
  pilot: null,
};

export const assistConfig = (level) => ASSIST_CONFIG[level] ?? null;
export const isAssistLevel = (level) => ASSIST_LEVELS.includes(level);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DEAD = 0.05;
const PITCH_RATE_DEG_S = 8;   // full fore/aft stick moves the held pitch this fast
const PITCH_LEAD_DEG = 4;     // the held pitch never runs further than this ahead of the nose
const COORD_GAIN = 0.1;       // rudder per degree of sideslip
const CMD_SHARE = 0.85;       // full stick commands this share of a limit; the rest is overshoot room
const FLARE_FROM_M = 12;      // Kid auto-flare: wheel height where it starts…
const FLARE_BANK_DEG = 5;     // …and the most bank it allows there (wingtip strike is > 10°)
const FLOOR_BELOW_M = 150;    // Kid ground floor: below ~500 ft no dive steeper than…
const FLOOR_GAMMA_DEG = -4;   // …a 4° descent (a 3° glidepath still fits)
const TAIL_MARGIN_DEG = 2;    // Kid auto-flare keeps the tail this far off the runway
const GUIDE_RATE_DEG_S = 2;   // Kid hands-off: the held pitch eases toward the guide this fast

// departing: Kid left the ground (takeoff or touch-and-go) and has not yet reached 1,000 ft:
// main.js climbs at full power instead of flying the approach speed and the flare retard.
export const createAssistState = () => ({ pitchHoldDeg: null, departing: false });
export const resetAssistState = (st) => { st.pitchHoldDeg = null; st.departing = false; return st; };
export const KID_CLIMB_GAMMA_DEG = 5;
export function updateDeparture(st, onGround, aglFt) {
  if (onGround) st.departing = true;
  else if (aglFt > 1000) st.departing = false;
  return st.departing;
}

// One sub-step of input shaping. cfg = assistConfig(level) (never null here).
// s: { pitchIn, rollIn, yawIn (raw stick targets: pitch + = nose down, roll + = right),
//      pitchDeg, bankRightDeg, pitchRateUp, rollRateRight (rad/s), aoaDeg, betaDeg,
//      stallAoaDeg, tailstrikeDeg, onGround, wheelHeightM, airspeedMps (true),
//      guideBankDeg, guideGammaDeg (Kid hands-off targets: 0/0 for level flight, the
//      localizer bank and glidepath angle on a final) }
// Writes out.elev, out.ail, out.rud (surface commands, -1..1); returns out. No allocation.
export function shapeControls(cfg, st, s, dt, out) {
  if (s.onGround) {
    // On the runway the airplane is the pilot's (rotation, taxi): the envelope starts at lift-off.
    st.pitchHoldDeg = null;
    out.elev = s.pitchIn; out.ail = s.rollIn; out.rud = s.yawIn;
    return out;
  }
  if (st.pitchHoldDeg === null) st.pitchHoldDeg = s.pitchDeg;

  // Pitch: the stick moves the held attitude; letting go holds it (auto-trim).
  if (Math.abs(s.pitchIn) > DEAD) {
    st.pitchHoldDeg = clamp(st.pitchHoldDeg - s.pitchIn * PITCH_RATE_DEG_S * dt,
      s.pitchDeg - PITCH_LEAD_DEG, s.pitchDeg + PITCH_LEAD_DEG);
  } else if (cfg.handsOff) {
    // Kid let go: ease toward the guide's flight path (pitch = path + angle of attack).
    const step = GUIDE_RATE_DEG_S * dt;
    st.pitchHoldDeg += clamp(s.guideGammaDeg + s.aoaDeg - st.pitchHoldDeg, -step, step);
  }
  st.pitchHoldDeg = clamp(st.pitchHoldDeg, cfg.pitchDownMaxDeg * CMD_SHARE, cfg.pitchUpMaxDeg * CMD_SHARE);
  // Kid ground floor: a dive held from higher up is shallowed out before the ground.
  if (cfg.groundFloor && s.wheelHeightM < FLOOR_BELOW_M) {
    st.pitchHoldDeg = Math.max(st.pitchHoldDeg, FLOOR_GAMMA_DEG + s.aoaDeg);
  }
  // Kid auto-flare: near the ground, never less nose-up than the flare's sink-rate profile.
  if (cfg.autoFlare && s.wheelHeightM < FLARE_FROM_M) {
    // Air-relative path (true airspeed), to match the air-relative angle of attack added to it.
    const flareGammaDeg = Math.atan2(flareSinkMps(Math.max(0, s.wheelHeightM)), Math.max(20, s.airspeedMps)) * 180 / Math.PI;
    st.pitchHoldDeg = Math.min(Math.max(st.pitchHoldDeg, flareGammaDeg + s.aoaDeg), s.tailstrikeDeg - TAIL_MARGIN_DEG);
  }
  // Angle-of-attack protection: the pitch that would put the wing at its limit on the
  // current flight path (pitch − α + α_max). Over the limit, the nose comes down.
  const aoaMax = s.stallAoaDeg - cfg.aoaMarginDeg;
  // The loop overshoots α by ~1.5–2° as an idle airplane slows (headless runs), so the
  // margins are 4°: ~2° of real margin left at worst.
  const pitchAtAoaMax = s.pitchDeg - s.aoaDeg + aoaMax;
  const pitchCmd = Math.min(st.pitchHoldDeg, pitchAtAoaMax);
  if (pitchCmd < st.pitchHoldDeg) st.pitchHoldDeg = Math.max(pitchCmd, cfg.pitchDownMaxDeg * CMD_SHARE);
  out.elev = elevatorForPitch(pitchCmd, s.pitchDeg, s.pitchRateUp);

  // Roll: the stick commands a bank angle, capped; release = wings level.
  const bankLimit = cfg.autoFlare && s.wheelHeightM < FLARE_FROM_M ? FLARE_BANK_DEG : cfg.bankMaxDeg;
  const bankShare = bankLimit * CMD_SHARE;
  const bankCmd = Math.abs(s.rollIn) <= DEAD && cfg.handsOff
    ? clamp(s.guideBankDeg, -bankShare, bankShare)
    : clamp(s.rollIn, -1, 1) * bankShare;
  out.ail = aileronForBank(bankCmd, s.bankRightDeg, s.rollRateRight);
  // A bank past the cap (gust, upset) is rolled back at full authority.
  if (Math.abs(s.bankRightDeg) > bankLimit) out.ail = -Math.sign(s.bankRightDeg);

  // Yaw: the pilot's rudder if they use it, else coordinate (rudder + = yaw right cancels
  // a positive, from-the-right sideslip).
  out.rud = Math.abs(s.yawIn) > DEAD ? s.yawIn : clamp(s.betaDeg * COORD_GAIN, -1, 1);
  return out;
}

// Kid hands-off line-up on a final: bank (deg, + = right) toward a 20°-max intercept of the
// centreline (crossM + = right of it). Softer than the autopilot's localizer (0.5°/m, full
// heading gain), which S-turned a hand-flown airplane with no roll-rate feedback of its own;
// tuned on the flight model (tests/unit/assists.test.js) for the 737 and the 172.
export const kidLocalizerBankDeg = (runwayHdgDeg, curHdgDeg, crossM) =>
  0.7 * bankCommandForHeading(headingError(runwayHdgDeg + clamp(-crossM * 0.15, -20, 20), curHdgDeg));

// Kid's automatic gear and flaps from height and vertical speed. Mutates and returns cfgOut
// { gearDown, flapsIndex } (seeded with the current values). Hysteresis: down/out when
// descending low, up/in when climbing higher; in between nothing changes.
export function autoConfigure(spec, s, cfgOut) {
  if (s.onGround) return cfgOut;
  const descending = s.vsiFpm < -300, climbing = s.vsiFpm > 300;
  if (!spec.fixedGear) {
    if (descending && s.aglFt < 1000) cfgOut.gearDown = true;
    else if (climbing && s.aglFt > 500) cfgOut.gearDown = false;
  }
  if (descending && s.aglFt < 1500 && s.iasKts < spec.vrefKts + 40) cfgOut.flapsIndex = Math.max(cfgOut.flapsIndex, 2);
  else if (climbing && s.aglFt > 1000) cfgOut.flapsIndex = 0;
  return cfgOut;
}

// Kid's autothrottle target (kt): approach speed with flaps out, a cruise margin without.
export const kidTargetKts = (spec, flapsIndex) => spec.vrefKts + (flapsIndex > 0 ? 5 : 30);

// Personal bests are kept per level; Pilot keeps the mission's own key (save-data compatible).
export const assistBestKey = (key, level) => (level === 'pilot' || !isAssistLevel(level) ? key : `${key}@${level}`);

export function loadAssist(storage) {
  try {
    const data = JSON.parse(storage.getItem(ASSIST_KEY) || 'null');
    return data && data.v === 1 && isAssistLevel(data.level) ? data.level : DEFAULT_ASSIST;
  } catch {
    return DEFAULT_ASSIST;
  }
}

export function saveAssist(storage, level, now = Date.now()) {
  if (!isAssistLevel(level)) return;
  try { storage.setItem(ASSIST_KEY, JSON.stringify({ v: 1, level, at: now })); } catch { /* private mode */ }
}
