// Ambient airliner traffic (ticket 0080): one 737 at a time on a parallel final into DFW, landing
// on its own runway and rolling out, then gone; another follows after a gap. It is flown by the
// same physics and autopilot laws as the player's aircraft (flightModel.js stepFlightModel, the
// autopilot.js ILS, flare and autothrottle laws, systems.js's autobrake 2), not keyframed (pillar 0).
//
// Placement: only while the player's runway end is at KDFW, on another KDFW runway in the same
// flow (within 30° of the player's heading), 2,500 ft or more beside it where there is one, never the player's runway (either end) and never
// within 1 NM of the player (the wake-turbulence lesson's jet is the one exception, below). The first jet of a flight sits 2 NM closer to its runway than the
// player is to theirs (2-8 NM out), so it is ahead, where a pilot on the default 4 NM final looks;
// each one after it starts 4-8 NM out. No collision, no wake, no ATC; one jet at a time.
//
// The wake-turbulence lesson (0115, wake.js): with sim.wake set, the flight's first jet lands on the player's own
// runway end, wake.js WAKE_AHEAD_NM ahead of the player, spawned once the player starts flying (sim.wake.ready)
// and kept whatever the device or the hour (the lesson needs it; one model). Its wheel height along the final and
// its touchdown point are written into sim.wake (no wake force is simulated). Parallel traffic follows it as usual.
//
// The flight model's functions come in as `fm` = { stepFlightModel, trimThrottle, rollHoldScale }
// (main.js sim.fm; the tests pass flightModel.js's): importing flightModel.js here also moved aero.js
// out of boot, whatever else was imported with it.
//
// The game's side: a lazy chunk, loaded by runwayLights.js's touchdown-feel hook when its group
// joins the scene (as buffet.js and fuel.js are), so boot pays nothing. It chains the scene's
// onBeforeRender and runs on the sim's clock (sim.simTime: still behind a menu, the results card
// or a pause). The model is the twin-jet glTF the player's 737 uses (aircraftModel.js, one fetch
// per page, shared). The jet steps the flight model at 1/60 s (once a frame at 60 fps); drawing
// it is one model copy, culled by three off screen. Off for the rest of a flight once the adaptive
// resolution (resScale.js) has fallen to its floor of 1 on a device that started above it: the
// device's own "this phone is struggling" signal. None after dark (nightGround.js uNight over 0.5): no lights yet. Makes no objects per frame (stepFlightModel's own
// number boxing is the player's step's too).
import { Vector3, Quaternion, Euler } from 'three';
import { RUNWAY_ENDS, RUNWAYS_GEOM, approachSpawn, AIM_POINT_M } from './airports.js';
import { AIRCRAFT_DATABASE } from './aircraft.js';
import {
  bankCommandForHeading, aileronForBank, glidepathGammaDeg,
  flareSinkMps, elevatorForPitch, autothrottleCommand, trimAoaDeg,
} from './autopilot.js';
// Imported with autopilot.js on purpose: a lazy chunk that imports autopilot.js (or flightModel.js)
// without it moved aero.js out of the boot chunk into its own modulepreloaded one (+0.6 kB gz; the
// drills' chunks import the pair too). It is also the Kid final's localizer, unused here.
import './assists.js';
// aero.js's headingError and vrefFor, inlined (as the other lazy chunks do with boot helpers).
export const headingError = (target, current) => {
  let d = target - current;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};
export const vrefFor = (spec, flapsIndex) => spec.vrefKtsByFlap?.[flapsIndex] ?? spec.vrefKts;
import { airAt, tasFromIas } from './atmosphere.js';
import { gustFactor, surfaceWindFactor } from './weather.js';
import { seedSystems } from './systems.js';
// Only symbols main.js already imports: a lazy chunk importing one it doesn't grows the boot chunk's exports.
import { KTS_TO_MPS, NM_TO_M, DEG_TO_RAD, RAD_TO_DEG, M_TO_FT } from './constants.js';

export const TRAFFIC_AIRPORT = 'KDFW';
export const TRAFFIC_KEY = 'b738';
export const MIN_SEP_M = NM_TO_M;        // never placed within 1 NM of the player
export const FLOW_DEG = 30;              // a parallel: within this of the player's runway heading
export const AHEAD_NM = 2.5;             // the first jet: this much closer to its runway than the player (1.5 NM at the
                                         // least), so it is ~20° off the nose from the default final, just inside a phone's
                                         // portrait view (±21°; at 2 NM it sat 28° right, off screen: first-timer panel)
export const FIRST_MIN_NM = 1.5;
export const SPAWN_NM = [4, 8];          // every jet after it
export const FIRST_SPAWN_S = 5;          // after a flight starts: past resScale's 1 s grace and its first windows, so a
                                         // struggling phone is off before it fetches the model (device panel)
export const GAP_S = [40, 90];           // after one jet leaves, before the next
export const VACATE_KTS = 30;            // slowed to this on the rollout: it turns off (despawns)
// Autobrake 3 on a landing distance of 9,300 ft or less (17L/35R's 8,500 ft, 13R/31L's 9,300), else 2.
// A game choice, not a published rule: at 2 the jet's long float on downhill 35R left it under 30 kt
// only a few metres from the end (an airline crew picks the setting from runway length and conditions).
export const SHORT_RWY_M = 9300 * 0.3048;
// The 737-800's tailwind landing limit, 10 kt (the certified limit for most operators; 15 kt is an
// option). No jet lands on an end with more tailwind than that (physics panel: 15 kt floated it off 35R's end).
export const MAX_TAILWIND_KTS = 10;
export const MAX_GROUND_S = 120;
export const STEP_S = 1 / 60;
const FLAPS = 3;                          // flaps 30, the player's final's setting (main.js loadScenario, b738.landingFlapsIndex)
const TAN_GLIDE = Math.tan(3 * DEG_TO_RAD); // airports.js GLIDE_DEG, the path approachGeometry flies

// The physical runway (RUNWAYS_GEOM entry) an end belongs to.
export const runwayOf = (end) => RUNWAYS_GEOM.find((r) => r.ends.includes(end.id)) ?? null;
export const sameRunway = (a, b) => !!a && !!b && (a.id === b.id || runwayOf(a) === runwayOf(b));

// Centrelines at least 2,500 ft apart: the least spacing for simultaneous dependent approaches
// (FAA JO 7110.65 §5-9-6; closer runways, such as 17C/35C and 17R/35L 1,200 ft apart, are closely
// spaced parallels with their own rules, JO 7110.308). Those go first, so the jet is on the next
// runway's final as a real DFW flow would put it, not 360 m off the player's wing.
export const PARALLEL_MIN_M = 2500 * 0.3048;
// Metres between an end's threshold and the player's runway's centreline.
export function lateralM(end, playerEnd) {
  const r = playerEnd.hdgT * DEG_TO_RAD;
  return Math.abs((end.thrX - playerEnd.thrX) * Math.cos(r) + (end.thrZ - playerEnd.thrZ) * Math.sin(r));
}
// KDFW ends traffic may land on with the player on `playerEnd`: the same flow, another runway;
// those PARALLEL_MIN_M or more away first, then the closer ones, each nearest first. [] away from KDFW.
export function trafficEnds(playerEnd, ends = RUNWAY_ENDS, wx = null) {
  if (!playerEnd || playerEnd.airport !== TRAFFIC_AIRPORT) return [];
  if (wx && tailwindKts(wx, playerEnd.hdgT) > MAX_TAILWIND_KTS) return [];
  const key = (e) => { const l = lateralM(e, playerEnd); return l < PARALLEL_MIN_M ? 1e6 + l : l; };
  return ends
    .filter((e) => e.airport === TRAFFIC_AIRPORT && !sameRunway(e, playerEnd)
      && Math.abs(headingError(e.hdgT, playerEnd.hdgT)) <= FLOW_DEG
      && !(wx && tailwindKts(wx, e.hdgT) > MAX_TAILWIND_KTS))
    .sort((a, b) => key(a) - key(b));
}

// The METAR's tailwind component (kt, + = from behind) on a runway heading, gusts counted
// (weather.js runwayWindComponents' headwind, negated; calm or variable: 0).
export function tailwindKts(wx, hdgT) {
  if (wx?.windDirDeg == null || !wx.windKts) return 0;
  return -Math.max(wx.windKts, wx.gustKts || 0) * Math.cos((wx.windDirDeg - hdgT) * DEG_TO_RAD);
}

// Distance (NM) to an end's threshold along its extended centreline, + before it.
export function distToThresholdNm(end, pos) {
  const r = end.hdgT * DEG_TO_RAD;
  return -((pos.x - end.thrX) * Math.sin(r) + (pos.z - end.thrZ) * -Math.cos(r)) / NM_TO_M;
}

// Where the next jet starts: { end, distNm } on one of trafficEnds, at least MIN_SEP_M from the
// player (3D), or null. `first`: the flight's first jet, AHEAD_NM closer than the player (1.5-8 NM);
// else `rand()` (0..1) picks 4-8 NM. If that spot is too close it tries the rest of 1.5-8 NM by
// half miles, nearest the wanted distance first, then the next parallel: so the first jet is ahead
// where there is room (on a 1-3 NM final it may start behind the player). Allocates (a spawn, not a frame).
export function pickTrafficSpawn(playerEnd, playerPos, { first = false, rand = Math.random, wx = null } = {}) {
  const ends = trafficEnds(playerEnd, RUNWAY_ENDS, wx);
  if (!ends.length) return null;
  const want = first
    ? Math.min(8, Math.max(FIRST_MIN_NM, distToThresholdNm(playerEnd, playerPos) - AHEAD_NM))
    : SPAWN_NM[0] + rand() * (SPAWN_NM[1] - SPAWN_NM[0]);
  const tries = [want];
  for (let d = FIRST_MIN_NM; d <= 8; d += 0.5) tries.push(d);
  tries.sort((a, b) => Math.abs(a - want) - Math.abs(b - want));
  for (const end of ends) {
    for (const distNm of tries) {
      const p = approachSpawn(end, distNm).pos;
      if (Math.hypot(p.x - playerPos.x, p.y - playerPos.y, p.z - playerPos.z) >= MIN_SEP_M) return { end, distNm };
    }
  }
  return null;
}

// The runway's surface height (sim Y) under (x, z): its two surveyed ends' line (a 51 ft slope on
// 17L/35R), held at the nearer end's height off its ends. Scalars only.
export function runwayY(rwy, x, z) {
  const lx = rwy.bx - rwy.ax, lz = rwy.bz - rwy.az;
  const t = Math.min(1, Math.max(0, ((x - rwy.ax) * lx + (z - rwy.az) * lz) / (lx * lx + lz * lz)));
  return rwy.ay + t * (rwy.by - rwy.ay);
}

const _e = new Euler(0, 0, 0, 'YXZ');

// A jet on `end`'s final distNm out, in trim at Vref + 5 on the 3° path, gear down, flaps 30,
// autobrake armed (SHORT_RWY_M), as the player's final spawns (main.js loadScenario). `air`: { mslOffsetM,
// isaDevC, altimInHg, wx? } (the player's sim; wx is the field's METAR, weather.js). The jet flies its
// own wind from that METAR (trafficWind), never the player's windVec, which carries the windshear
// drill's microburst and the log law at the player's height. Allocates (a spawn).
export function createTrafficJet(end, distNm, air, fm, spec = AIRCRAFT_DATABASE[TRAFFIC_KEY]) {
  const mslOffsetM = air.mslOffsetM ?? 0, isaDevC = air.isaDevC ?? 0, altimInHg = air.altimInHg ?? 29.92;
  const vApp = (vrefFor(spec, FLAPS) + 5) * KTS_TO_MPS;
  const y0 = approachSpawn(end, distNm).pos.y; // the spawn's own air, not the threshold's (151 → 155 KIAS)
  const spawnAir = airAt(y0 + mslOffsetM, isaDevC, altimInHg);
  const s = approachSpawn(end, distNm, tasFromIas(vApp, spawnAir.sigma));
  const r = end.hdgT * DEG_TO_RAD;
  const body = {
    pos: new Vector3(s.pos.x, s.pos.y, s.pos.z),
    vel: new Vector3(s.vel.x, s.vel.y, s.vel.z),
    quat: new Quaternion().setFromEuler(new Euler((trimAoaDeg(spec, vApp, FLAPS) - 3) * DEG_TO_RAD, s.yawRad, 0, 'YXZ')),
    angVel: new Vector3(),
    windVec: new Vector3(),
    elevInput: 0, aileronInput: 0, rudderInput: 0,
    throttle: fm.trimThrottle(spec, vApp, FLAPS, -3, true, spawnAir),
    flapsIndex: FLAPS, gearDown: true, brakesOn: false, apMaster: true, autobrake: end.lengthM - end.displacedM <= SHORT_RWY_M ? 3 : 2,
    autoTrim: true, trimAlphaDeg: trimAoaDeg(spec, vApp, FLAPS),
    onGround: false, groundY: end.thrY, iasKts: vApp / KTS_TO_MPS, tasKts: 0, aoaDeg: trimAoaDeg(spec, vApp, FLAPS),
    // Every field stepFlightModel writes, present from the start: one object shape for its lookups.
    gsKts: 0, mach: 0, betaDeg: 0, accelY: 0, loadFactor: 1, sigma: 1, lastAirVsi: 0, spoilers: 0,
    mslOffsetM, isaDevC, altimInHg,
  };
  body.engineN = body.throttle;
  seedSystems(spec, body);
  const j = {
    spec, fm, end, rwy: runwayOf(end), body,
    dx: Math.sin(r), dz: -Math.cos(r),
    phase: 'final', // final → flare → rollout → done
    at: { trim: 0 }, prevIas: NaN, iasRate: 0, gsInt: 0, locInt: 0, groundS: 0, t: 0,
    touchdown: null, // { alongM, crossM, vsFpm, iasKts } at the first main-wheel contact
    _air: {},
    wx: air.wx ?? null,
  };
  trafficWind(j);
  body.vel.add(body.windVec); // in trim through the air, as main.js spawns a final
  return j;
}

// The jet's wind (m/s, body.windVec) from the field's METAR at its own wheel height: main.js
// updateWind's gusts and log-law surface layer, without the windshear drill's microburst. No objects.
export function trafficWind(j) {
  const b = j.body, wx = j.wx;
  if (wx?.windDirDeg == null || !wx.windKts) { b.windVec.set(0, 0, 0); return; }
  const mps = gustFactor(j.t, wx.windKts, wx.gustKts) * KTS_TO_MPS * surfaceWindFactor(b.pos.y - b.groundY);
  const r = wx.windDirDeg * DEG_TO_RAD; // weather.js windVector: it blows towards dir + 180°
  b.windVec.set(-Math.sin(r) * mps, 0, Math.cos(r) * mps);
}

// Fly a flight-path angle: pitch = path + angle of attack, capped at 9.5° (main.js holdGamma).
function holdGamma(b, gammaDeg, pitchDeg) {
  b.elevInput = elevatorForPitch(Math.min(9.5, gammaDeg + b.aoaDeg), pitchDeg, b.angVel.x);
}
// main.js autoThrottle: the flight model's trim throttle for the path, plus the PI correction.
function autoThrottle(j, kts, gammaDeg, dt) {
  const b = j.body;
  airAt(b.pos.y + b.mslOffsetM, b.isaDevC, b.altimInHg, j._air);
  const ff = j.fm.trimThrottle(j.spec, kts * KTS_TO_MPS, b.flapsIndex, gammaDeg, true, j._air);
  return autothrottleCommand(ff, j.at, b.iasKts, kts, j.iasRate, dt);
}

// One sub-step of the jet's autopilot and flight model (main.js's ILS coupling, autoland and
// autothrottle, flown here on the jet's own state). Scalars only: makes no objects.
export function stepTrafficJet(j, dt) {
  const b = j.body, spec = j.spec, e = j.end;
  if (j.phase === 'done') return;
  const w = j.wake;
  const rx = b.pos.x - e.thrX, rz = b.pos.z - e.thrZ;
  const along = rx * j.dx + rz * j.dz, crossM = rx * -j.dz + rz * j.dx;
  const heightAbovePathM = b.pos.y - e.thrY - (AIM_POINT_M - along) * TAN_GLIDE;
  b.groundY = j.rwy ? runwayY(j.rwy, b.pos.x, b.pos.z) : e.thrY;

  _e.setFromQuaternion(b.quat, 'YXZ');
  const hdg = (-_e.y * RAD_TO_DEG + 360) % 360, pitchDeg = _e.x * RAD_TO_DEG, bankRightDeg = -_e.z * RAD_TO_DEG;
  const tasMps = (b.tasKts || b.iasKts) * KTS_TO_MPS;
  // The localizer flown as a track (physics panel): main.js's heading law (localizerInterceptDeg) has no
  // drift term and weaved ±170 m in an 18 kt crosswind. The ground track closes the centreline in ~12 s
  // of flight (up to 25°), and the heading law below banks for the track error, so the crab comes by itself.
  const gsH = Math.max(20, Math.hypot(b.vel.x, b.vel.z));
  const trk = (Math.atan2(b.vel.x, -b.vel.z) * RAD_TO_DEG + 360) % 360;
  // Plus a slow integral (~20 s), as the glidepath has: in a crosswind the bank and the fin's weathervane
  // settle into a slip that holds a standing offset (16-30 m at 18-35 kt) the proportional term alone keeps.
  if (!b.onGround) j.locInt = Math.max(-600, Math.min(600, j.locInt + crossM * dt));
  const locM = crossM + j.locInt / 20;
  const trkCmd = e.hdgT + Math.max(-25, Math.min(25, Math.asin(Math.max(-1, Math.min(1, -locM / (12 * gsH)))) * RAD_TO_DEG));
  if (!Number.isNaN(j.prevIas) && Math.abs(b.iasKts - j.prevIas) < 5) j.iasRate += ((b.iasKts - j.prevIas) / dt - j.iasRate) * Math.min(1, dt / 0.5);
  j.prevIas = b.iasKts;

  const wheelH = b.pos.y - b.groundY - spec.gearHeight;
  // The wake lesson (0115): the jet's wheels (sim Y) along its final, in wake.js's bins (no objects).
  if (w && !b.onGround && j.phase !== 'rollout') {
    const i = Math.floor((along - w.fromM) / w.binM);
    if (i >= 0 && i < w.path.length) w.path[i] = b.pos.y - spec.gearHeight;
  }
  if (!b.onGround && j.phase !== 'rollout') {
    b.aileronInput = aileronForBank(bankCommandForHeading(headingError(trkCmd, trk), tasMps), bankRightDeg, -b.angVel.z, j.fm.rollHoldScale(spec, tasMps));
    // The de-crab (an autoland's align mode): in the last 2 m the rudder (up to half) yaws the nose onto
    // the runway and the track law banks into the wind, so the wheels meet the runway nearly straight.
    // Earlier or harder (8 m, full rudder) it slipped 16 m downwind in the flare (tests/flight/traffic.test.js).
    b.rudderInput = wheelH < 2 ? Math.max(-0.5, Math.min(0.5, headingError(e.hdgT, hdg) * 0.1)) : 0;
    if (wheelH > 15 && j.phase === 'final') {
      if (Math.abs(heightAbovePathM) < 15) j.gsInt = Math.max(-100, Math.min(100, j.gsInt + heightAbovePathM * dt));
      holdGamma(b, glidepathGammaDeg(heightAbovePathM, j.gsInt), pitchDeg);
      b.throttle = autoThrottle(j, vrefFor(spec, b.flapsIndex) + 5, -3, dt);
    } else {
      j.phase = 'flare';
      const gs = Math.max(20, Math.hypot(b.vel.x, b.vel.z));
      holdGamma(b, Math.atan2(flareSinkMps(wheelH), gs) * RAD_TO_DEG, pitchDeg);
      if (wheelH > 8) b.throttle = autoThrottle(j, vrefFor(spec, b.flapsIndex) + 3, -1.5, dt);
      else b.throttle = Math.max(0, b.throttle - dt * 0.5);
    }
  } else {
    // On the runway: idle (the ground spoilers deploy), autobrake 2, the nose lowered, wings level,
    // and the pedals hold the centreline (rudder + = yaw right: back towards it, along the runway).
    if (j.phase !== 'rollout') {
      j.phase = 'rollout';
      j.touchdown = { alongM: along, crossM, vsFpm: b.lastAirVsi ?? b.vel.y * M_TO_FT * 60, iasKts: b.iasKts, driftDeg: Math.abs(headingError(e.hdgT, hdg)) };
      if (w) w.tdAlongM = along;
      // A long float (a tailwind, downhill 35R, a hot day): under 1,800 m of runway left, MAX autobrake,
      // as a crew would brake harder (physics panel: a 10 kt tailwind at ISA+25 on 35R ran past the end at 3).
      if (e.lengthM - e.displacedM - along < 1800) b.autobrake = 4;
    }
    b.throttle = 0;
    b.elevInput = 0; // main.js's autoland: the nose comes down by itself (gear.js tailVsMainsAccel)
    b.aileronInput = aileronForBank(0, bankRightDeg, -b.angVel.z);
    b.rudderInput = Math.max(-1, Math.min(1, headingError(e.hdgT - Math.max(-5, Math.min(5, crossM * 0.5)), hdg) * 0.15));
    j.groundS += dt;
    if (b.gsKts <= VACATE_KTS || j.groundS > MAX_GROUND_S) j.phase = 'done';
  }
  trafficWind(j);
  j.fm.stepFlightModel(b, spec, dt);
  j.t += dt;
}

// The wake lesson's jet (0115): on the player's own end, wake.js WAKE_AHEAD_NM (2) closer in than the player and
// at least 1.5 NM out, never with a tailwind over MAX_TAILWIND_KTS. wake.js wakeSpawnNm's rule, inlined (this chunk
// doesn't import the lesson's): { distNm, reason } with distNm null when there is no room or the wind says no.
export const WAKE_AHEAD_NM = 2, WAKE_MIN_NM = 1.5;
export function wakeSpawnFor(end, sim) {
  const tw = tailwindKts(sim.wx, end.hdgT);
  if (tw > MAX_TAILWIND_KTS) return { distNm: null, reason: `a ${Math.round(tw)} kt tailwind, over the 737's ${MAX_TAILWIND_KTS} kt limit` };
  const d = Math.min(8, distToThresholdNm(end, sim.pos) - WAKE_AHEAD_NM);
  return d >= WAKE_MIN_NM ? { distNm: d, reason: null } : { distNm: null, reason: 'too close to the runway to fit it in ahead of you' };
}

// Whether traffic may fly: off once the adaptive resolution sits on its floor (resScale.js
// RES_STEPS' last rung, 1) on a device whose ladder started above it. `topRatio` is the renderer's
// ratio at the first tick (the ladder's top: resScale doesn't step behind the start screen), not the
// live devicePixelRatio, which a browser zoom or a move to another monitor changes (device panel).
export const trafficAllowed = (pixelRatio, topRatio) => !(topRatio > 1 && pixelRatio <= 1);

// The scheduler: spawns, flies and retires jets on the sim's clock. `sim` is main.js's (or a
// test's) state: simTime, activeEnd, loadedMission, pos, wx, mslOffsetM, isaDevC, altimInHg, fm.
// Pure apart from the jet objects it makes at a spawn; tick() allocates nothing otherwise.
export function createTrafficScheduler(sim, { rand = Math.random } = {}) {
  const st = { jet: null, nextAt: null, first: true, mission: undefined, endId: null, off: false, lastT: null, acc: 0, spawned: 0, px: NaN, pz: NaN };
  const retire = (gapS) => { st.jet = null; st.nextAt = sim.simTime + gapS; };
  // dark: no jet at all (it has no lights yet: a real one on final shows its landing lights for miles,
  // ours would be an unlit speck; first-timer panel). Not latched like a slow device: dusk-to-day comes back.
  st.tick = (allowed = true, dark = false) => {
    const t = sim.simTime ?? 0;
    const dt = st.lastT === null ? 0 : Math.min(0.25, Math.max(0, t - st.lastT));
    st.lastT = t;
    // A new flight (or runway): start over, the first jet ahead of the player. FLY AGAIN reloads the
    // same mission object, so a jump of over 1 km between two frames is a new flight too (a respawn).
    const p = sim.pos, jumped = Math.hypot(p.x - st.px, p.z - st.pz) > 1000;
    st.px = p.x; st.pz = p.z;
    const wake = sim.wake ?? null, wakeWanted = !!wake && !wake.spawned;
    if (jumped || sim.loadedMission !== st.mission || (sim.activeEnd?.id ?? null) !== st.endId) {
      const newFlight = jumped || sim.loadedMission !== st.mission;
      st.mission = sim.loadedMission;
      st.endId = sim.activeEnd?.id ?? null;
      if (newFlight) { st.first = true; st.off = false; }
      if (newFlight || (st.jet && !st.jet.wake && (!sim.activeEnd || sameRunway(st.jet.end, sim.activeEnd) || sim.activeEnd.airport !== TRAFFIC_AIRPORT))) {
        st.jet = null;
        st.nextAt = t + FIRST_SPAWN_S;
      }
    }
    if (!allowed) st.off = true;
    // The wake lesson's jet flies whatever the device or the hour; nothing else does.
    if ((st.off || dark) && !wakeWanted && !st.jet?.wake) { st.jet = null; if (dark) st.nextAt = null; return st; }
    if (!st.jet && wakeWanted) {
      if (!wake.ready || !(dt > 0)) return st;
      wake.spawned = true;
      const s = wakeSpawnFor(wake.end, sim);
      if (s.distNm === null) { wake.noJet = s.reason; return st; }
      st.jet = createTrafficJet(wake.end, s.distNm, sim, sim.fm);
      st.jet.wake = wake;
      st.first = false;
      st.spawned++;
      st.acc = 0;
      return st;
    }
    if (!st.jet && (st.off || dark)) { if (dark) st.nextAt = null; return st; }
    if (!st.jet) {
      if (st.nextAt === null) st.nextAt = t + FIRST_SPAWN_S;
      if (t < st.nextAt || !(dt > 0)) return st;
      const s = pickTrafficSpawn(sim.activeEnd, sim.pos, { first: st.first, rand, wx: sim.wx });
      if (!s) { st.nextAt = t + 5; return st; }
      st.jet = createTrafficJet(s.end, s.distNm, sim, sim.fm);
      st.first = false;
      st.spawned++;
      st.acc = 0;
      return st;
    }
    st.jet.wx = sim.wx ?? null; // the field's METAR (a new observation mid-flight too)
    st.acc += dt;
    while (st.acc >= STEP_S) {
      stepTrafficJet(st.jet, STEP_S);
      st.acc -= STEP_S;
    }
    if (st.jet.phase === 'done' && st.jet.wake) st.jet.wake.jetDone = true;
    if (st.jet.phase === 'done') retire(GAP_S[0] + rand() * (GAP_S[1] - GAP_S[0]));
    return st;
  };
  return st;
}

// The game's side: `scene` is main.js's THREE.Scene (its onBeforeRender chained, as fuel.js's).
// isDark: () => true after dark (runwayLights.js passes nightGround.js's uNight > 0.5; importing nightGround.js
// here split three's Color out of the boot chunk, +0.3 kB gz).
export function createTraffic(scene, sim, isDark = () => false, base = import.meta.env?.BASE_URL ?? '/') {
  const sched = createTrafficScheduler(sim);
  // The jet is the loaded model itself, added to the scene (no Group of our own: importing three's
  // Group here split Object3D out of the boot chunk, +0.4 kB gz).
  let model = null, loading = false, top = null;
  const before = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer, sc, camera, target) {
    before.call(this, renderer, sc, camera, target);
    const ratio = renderer.getPixelRatio();
    top ??= ratio;
    sched.tick(!!sim.fm && trafficAllowed(ratio, top), isDark());
    const j = sched.jet;
    if (j && !model && !loading) {
      loading = true; // the model the player's 737 uses: one fetch per page, shared (aircraftModel.js)
      import('./aircraftModel.js').then((m) => m.loadAircraftModel(TRAFFIC_KEY, base)).then((m) => {
        if (!m) return;
        model = m;
        model.name = 'traffic';
        model.visible = false;
        scene.add(model);
      }).catch(console.warn); // no model: no traffic drawn (never retried: a failure costs one fetch)
    }
    if (!model) return;
    model.visible = !!j;
    if (j) {
      model.position.copy(j.body.pos);
      model.quaternion.copy(j.body.quat);
      // three updates the scene's matrices before onBeforeRender: without this it draws (and culls)
      // last frame's pose, at the origin on its first frame and at the last jet's turn-off after a respawn.
      model.updateMatrixWorld();
    }
  };
  const api = { sched, get model() { return model; } };
  if (globalThis.location && new URLSearchParams(location.search).has('debug')) {
    // e2e: where the jet is (allocates; not per frame).
    window.openaeroTraffic = () => {
      const j = sched.jet;
      return {
        spawned: sched.spawned, off: sched.off, visible: !!model?.visible, model: !!model,
        jet: j && { endId: j.end.id, phase: j.phase, pos: { x: j.body.pos.x, y: j.body.pos.y, z: j.body.pos.z }, iasKts: j.body.iasKts, distNm: distToThresholdNm(j.end, j.body.pos), touchdown: j.touchdown },
      };
    };
  }
  return api;
}
