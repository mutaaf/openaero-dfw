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
//   - auto-coordination: the rudder cancels sideslip unless the pilot is using it; when they
//     do, the aileron the sideslip's dihedral effect asks for is fed forward (0081).
// Kid adds hands-off guidance (let go of the stick and the airplane eases back to level
// flight, or onto the localizer and glidepath when it is on a final), a no-dive floor
// below ~500 ft and an auto-flare near the ground, and main.js adds the autothrottle, automatic
// gear/flaps and a hard landing that resets instead of crashing (see ASSIST_CONFIG).
import { aileronForBank, elevatorForPitch, flareSinkMps, bankCommandForHeading, glidepathGammaDeg } from './autopilot.js';
import { headingError, vrefFor } from './aero.js';

export const ASSIST_KEY = 'openaero_assist_v1';
export const ASSIST_LEVELS = ['kid', 'learner', 'pilot'];
// A first visit (nothing stored, or storage that throws) flies Learner (ticket 0059); a
// stored level always wins, and the default itself is never written. A player who has
// already landed on Pilot without ever picking a card (a plain-key best) keeps Pilot.
export const DEFAULT_ASSIST = 'learner';

export const ASSIST_CONFIG = {
  kid: {
    bankMaxDeg: 30, pitchUpMaxDeg: 15, pitchDownMaxDeg: -10, aoaMarginDeg: 4, flareAoaMarginDeg: 3,
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
//      pitchDeg, bankRightDeg, pitchRateUp, rollRateRight (rad/s), aoaDeg, betaDeg, dihedralAil,
//      stallAoaDeg, tailstrikeDeg, onGround, wheelHeightM, airspeedMps (true),
//      guideBankDeg, guideGammaDeg (Kid hands-off targets: 0/0 for level flight, the
//      localizer bank and glidepath angle on a final), rwyHdgDeg, noseHdgDeg, crossM, crossVelMps,
//      yawRateRightDegS (on the runway: its true heading or null off it, the nose's, the offset
//      and drift right of its centreline, the yaw rate; 0110), noFloor (no engine, 0036: the glide is
//      steeper than the floor, and holding the floor would only slow it to a mush) }
// Writes out.elev, out.ail, out.rud (surface commands, -1..1); returns out. No allocation.
export function shapeControls(cfg, st, s, dt, out) {
  if (s.onGround) {
    // On the runway the stick is the pilot's (rotation, taxi): the envelope starts at lift-off.
    // The pedals too, when they use them; when they don't, the nose wheel holds the centreline
    // of the runway it is on (0110), never the sideslip's coordination (it would steer into the wind).
    st.pitchHoldDeg = null;
    out.elev = s.pitchIn; out.ail = s.rollIn;
    out.rud = Math.abs(s.yawIn) > DEAD || s.rwyHdgDeg == null ? s.yawIn
      : groundSteerRudder(s.rwyHdgDeg, s.noseHdgDeg, s.crossM, s.crossVelMps, s.yawRateRightDegS);
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
  if (cfg.groundFloor && !s.noFloor && s.wheelHeightM < FLOOR_BELOW_M) {
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
  // Kid's auto-flare may use more of the wing (flareAoaMarginDeg, 0102): with a stiff nose the
  // limit holds exactly, and 4° under the stall left no lift to stop a slow glide's sink.
  const flaring = cfg.autoFlare && s.wheelHeightM < FLARE_FROM_M;
  const aoaMax = s.stallAoaDeg - (flaring ? cfg.flareAoaMarginDeg : cfg.aoaMarginDeg);
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
  // Plus the aileron that cancels the sideslip's rolling moment (s.dihedralAil, flightModel.js
  // dihedralAileron), fed forward like trim: a held rudder must not out-roll the bank hold.
  out.ail = clamp(aileronForBank(bankCmd, s.bankRightDeg, s.rollRateRight) - (s.dihedralAil ?? 0), -1, 1);
  // A bank past the cap (gust, upset) is rolled back at full authority.
  if (Math.abs(s.bankRightDeg) > bankLimit) out.ail = -Math.sign(s.bankRightDeg);

  // Yaw: the pilot's rudder if they use it, else coordinate (rudder + = yaw right cancels
  // a positive, from-the-right sideslip).
  out.rud = Math.abs(s.yawIn) > DEAD ? s.yawIn : clamp(s.betaDeg * COORD_GAIN, -1, 1);
  return out;
}

// Kid and Learner on the runway with the pedals free (0110): the rudder (and the nose wheel on
// it) points the nose at most 3° off the runway heading back towards the centreline, by the
// offset right of it (crossM, m) and the drift across it (crossVelMps), damped by the yaw rate
// (°/s, + = right). The harness's crosswind pilot's gains (tests/flight), in metres.
export function groundSteerRudder(rwyHdgDeg, noseHdgDeg, crossM, crossVelMps, yawRateRightDegS) {
  const target = rwyHdgDeg - clamp(crossM * 0.5 + crossVelMps, -3, 3);
  return clamp(headingError(target, noseHdgDeg) * 0.3 - yawRateRightDegS * 0.15, -1, 1);
}

// Kid hands-off line-up on a final: bank (deg, + = right) toward a 20°-max intercept of the
// centreline (crossM + = right of it). Softer than the autopilot's localizer (0.5°/m, full
// heading gain), which S-turned a hand-flown airplane with no roll-rate feedback of its own;
// tuned on the flight model (tests/unit/assists.test.js) for the 737 and the 172 (0.8 of the
// heading bank since the sideslip side force, 0081: at 0.7 the 737 overshot 31 m). curHdgDeg
// is the ground track (0097; main.js, pattern.js, deadStick.js): fed the nose heading, a
// crosswind's crab left a steady offset of drift / 0.15°/m, ~50 m at 10 kt in the Cessna.
export const kidLocalizerBankDeg = (runwayHdgDeg, curHdgDeg, crossM) =>
  0.8 * bankCommandForHeading(headingError(runwayHdgDeg + clamp(-crossM * 0.15, -20, 20), curHdgDeg));

// Kid's hands-off final (main.js applyAssists): `ap` is airports.js approachGeometry for `end`.
// Captured on the nose (within 45°), flown on the ground track so a crab holds the centreline
// (0097), the 3° path to its aim point and on over the runway, under the auto-flare's floor, so
// it lands (0098: stopped at the threshold, level flight floated the runway). Past the threshold
// only a landing: under ~100 ft over the first third of the runway, never steeper than 2° (an
// airplane let go higher, later or climbing away is not dived at the runway). Leaves out.guide*
// alone (level flight) off the final.
export function kidFinalGuide(end, ap, noseDeg, trackDeg, out) {
  const past = ap.distM < 0;
  if (past && (ap.heightAbovePathM + ap.pathHeightM > 30 || -ap.distM > (end.lengthM - end.displacedM) / 3)) return;
  if (ap.distM < 20000 && Math.abs(ap.crossM) < 1500 && Math.abs(headingError(end.hdgT, noseDeg)) < 45) {
    out.guideBankDeg = kidLocalizerBankDeg(end.hdgT, trackDeg, ap.crossM);
    out.guideGammaDeg = glidepathGammaDeg(ap.heightAbovePathM);
    if (past) out.guideGammaDeg = Math.max(out.guideGammaDeg, -2);
  }
}

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
export const kidTargetKts = (spec, flapsIndex) => (flapsIndex > 0 ? vrefFor(spec, flapsIndex) + 5 : spec.vrefKts + 30);

// Personal bests are kept per level; Pilot keeps the mission's own key (save-data compatible).
export const assistBestKey = (key, level) => (level === 'pilot' || !isAssistLevel(level) ? key : `${key}@${level}`);

export function loadAssist(storage) {
  try {
    const data = JSON.parse(storage.getItem(ASSIST_KEY) || 'null');
    if (data && data.v === 1 && isAssistLevel(data.level)) return data.level;
  } catch { /* storage unavailable or junk: fall through */ }
  return flownPilot(storage) ? 'pilot' : DEFAULT_ASSIST;
}

// Pilot's bests keep the plain mission key (assistBestKey); Kid's and Learner's carry '@'.
function flownPilot(storage) {
  try {
    const best = JSON.parse(storage.getItem('openaero_best') || 'null');
    return !!best && best.v === 1 && !!best.missions && Object.keys(best.missions).some((k) => !k.includes('@'));
  } catch {
    return false;
  }
}

export function saveAssist(storage, level, now = Date.now()) {
  if (!isAssistLevel(level)) return;
  try { storage.setItem(ASSIST_KEY, JSON.stringify({ v: 1, level, at: now })); } catch { /* private mode */ }
}
