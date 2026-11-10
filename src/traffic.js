// Ambient airliner traffic (ticket 0080): one 737 at a time on a parallel final into DFW, landing
// on its own runway and rolling out, then gone; another follows after a gap. It is flown by the
// same physics and autopilot laws as the player's aircraft (flightModel.js stepFlightModel, the
// autopilot.js ILS, flare and autothrottle laws, systems.js's autobrake 2), not keyframed (pillar 0).
//
// Placement: only while the player's runway end is at KDFW, on another KDFW runway in the same
// flow (within 30° of the player's heading), 2,500 ft or more beside it where there is one, never the player's runway (either end) and never
// within 1 NM of the player. The first jet of a flight sits 2 NM closer to its runway than the
// player is to theirs (2-8 NM out), so it is ahead, where a pilot on the default 4 NM final looks;
// each one after it starts 4-8 NM out. No collision, no wake, no ATC; one jet at a time.
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
// device's own "this phone is struggling" signal. Allocates nothing per frame.
import { Vector3, Quaternion, Euler } from 'three';
import { RUNWAY_ENDS, RUNWAYS_GEOM, approachSpawn, AIM_POINT_M } from './airports.js';
import { AIRCRAFT_DATABASE } from './aircraft.js';
import {
  localizerInterceptDeg, bankCommandForHeading, aileronForBank, glidepathGammaDeg,
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
import { seedSystems } from './systems.js';
// Only symbols main.js already imports: a lazy chunk importing one it doesn't grows the boot chunk's exports.
import { KTS_TO_MPS, NM_TO_M, DEG_TO_RAD, RAD_TO_DEG, M_TO_FT } from './constants.js';

export const TRAFFIC_AIRPORT = 'KDFW';
export const TRAFFIC_KEY = 'b738';
export const MIN_SEP_M = NM_TO_M;        // never placed within 1 NM of the player
export const FLOW_DEG = 30;              // a parallel: within this of the player's runway heading
export const AHEAD_NM = 2;               // the first jet: this much closer to its runway than the player
export const SPAWN_NM = [4, 8];          // every jet after it
export const FIRST_SPAWN_S = 1;          // after a flight starts
export const GAP_S = [40, 90];           // after one jet leaves, before the next
export const VACATE_KTS = 30;            // slowed to this on the rollout: it turns off (despawns)
export const SHORT_RWY_M = 2835;         // 9,300 ft: shorter than this, autobrake 3 (17L/35R's 8,500 ft), else 2
export const MAX_GROUND_S = 120;
export const STEP_S = 1 / 60;
const FLAPS = 2;                          // flaps 30, the player's final's setting (main.js loadScenario)
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
export function trafficEnds(playerEnd, ends = RUNWAY_ENDS) {
  if (!playerEnd || playerEnd.airport !== TRAFFIC_AIRPORT) return [];
  const key = (e) => { const l = lateralM(e, playerEnd); return l < PARALLEL_MIN_M ? 1e6 + l : l; };
  return ends
    .filter((e) => e.airport === TRAFFIC_AIRPORT && !sameRunway(e, playerEnd)
      && Math.abs(headingError(e.hdgT, playerEnd.hdgT)) <= FLOW_DEG)
    .sort((a, b) => key(a) - key(b));
}

// Distance (NM) to an end's threshold along its extended centreline, + before it.
export function distToThresholdNm(end, pos) {
  const r = end.hdgT * DEG_TO_RAD;
  return -((pos.x - end.thrX) * Math.sin(r) + (pos.z - end.thrZ) * -Math.cos(r)) / NM_TO_M;
}

// Where the next jet starts: { end, distNm } on one of trafficEnds, at least MIN_SEP_M from the
// player (3D), or null. `first`: the flight's first jet, AHEAD_NM closer than the player (2-8 NM);
// else `rand()` (0..1) picks 4-8 NM. If that spot is too close it tries the rest of 2-8 NM by
// half miles, nearest the wanted distance first, then the next parallel. Allocates (a spawn, not a frame).
export function pickTrafficSpawn(playerEnd, playerPos, { first = false, rand = Math.random } = {}) {
  const ends = trafficEnds(playerEnd);
  if (!ends.length) return null;
  const want = first
    ? Math.min(8, Math.max(2, distToThresholdNm(playerEnd, playerPos) - AHEAD_NM))
    : SPAWN_NM[0] + rand() * (SPAWN_NM[1] - SPAWN_NM[0]);
  const tries = [want];
  for (let d = 2; d <= 8; d += 0.5) tries.push(d);
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
// autobrake 2 armed (the player's final's spawn, main.js loadScenario; 3 on a runway under 9,300 ft). `air`: { mslOffsetM,
// isaDevC, altimInHg, windVec? } (the player's sim; its wind is the jet's). Allocates (a spawn).
export function createTrafficJet(end, distNm, air, fm, spec = AIRCRAFT_DATABASE[TRAFFIC_KEY]) {
  const mslOffsetM = air.mslOffsetM ?? 0, isaDevC = air.isaDevC ?? 0, altimInHg = air.altimInHg ?? 29.92;
  const vApp = (vrefFor(spec, FLAPS) + 5) * KTS_TO_MPS;
  const thrAir = airAt(end.thrY + mslOffsetM, isaDevC, altimInHg);
  const s = approachSpawn(end, distNm, tasFromIas(vApp, thrAir.sigma));
  const r = end.hdgT * DEG_TO_RAD;
  const body = {
    pos: new Vector3(s.pos.x, s.pos.y, s.pos.z),
    vel: new Vector3(s.vel.x, s.vel.y, s.vel.z),
    quat: new Quaternion().setFromEuler(new Euler((trimAoaDeg(spec, vApp, FLAPS) - 3) * DEG_TO_RAD, s.yawRad, 0, 'YXZ')),
    angVel: new Vector3(),
    windVec: new Vector3(),
    elevInput: 0, aileronInput: 0, rudderInput: 0,
    throttle: fm.trimThrottle(spec, vApp, FLAPS, -3, true, thrAir),
    flapsIndex: FLAPS, gearDown: true, brakesOn: false, apMaster: true, autobrake: end.lengthM < SHORT_RWY_M ? 3 : 2,
    autoTrim: true, trimAlphaDeg: trimAoaDeg(spec, vApp, FLAPS),
    onGround: false, groundY: end.thrY, iasKts: vApp / KTS_TO_MPS, tasKts: 0, aoaDeg: trimAoaDeg(spec, vApp, FLAPS),
    mslOffsetM, isaDevC, altimInHg,
  };
  body.engineN = body.throttle;
  seedSystems(spec, body);
  if (air.windVec) { body.windVec.copy(air.windVec); body.vel.add(body.windVec); }
  return {
    spec, fm, end, rwy: runwayOf(end), body,
    dx: Math.sin(r), dz: -Math.cos(r),
    phase: 'final', // final → flare → rollout → done
    at: { trim: 0 }, prevIas: null, iasRate: 0, gsInt: 0, groundS: 0, t: 0,
    touchdown: null, // { alongM, crossM, vsFpm, iasKts } at the first main-wheel contact
    _air: {},
  };
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
// autothrottle, flown here on the jet's own state). Scalars only: allocates nothing.
export function stepTrafficJet(j, dt) {
  const b = j.body, spec = j.spec, e = j.end;
  if (j.phase === 'done') return;
  const rx = b.pos.x - e.thrX, rz = b.pos.z - e.thrZ;
  const along = rx * j.dx + rz * j.dz, crossM = rx * -j.dz + rz * j.dx;
  const heightAbovePathM = b.pos.y - e.thrY - (AIM_POINT_M - along) * TAN_GLIDE;
  b.groundY = j.rwy ? runwayY(j.rwy, b.pos.x, b.pos.z) : e.thrY;

  _e.setFromQuaternion(b.quat, 'YXZ');
  const hdg = (-_e.y * RAD_TO_DEG + 360) % 360, pitchDeg = _e.x * RAD_TO_DEG, bankRightDeg = -_e.z * RAD_TO_DEG;
  const tasMps = (b.tasKts || b.iasKts) * KTS_TO_MPS;
  const hdgCmd = e.hdgT + localizerInterceptDeg(crossM);
  if (j.prevIas !== null && Math.abs(b.iasKts - j.prevIas) < 5) j.iasRate += ((b.iasKts - j.prevIas) / dt - j.iasRate) * Math.min(1, dt / 0.5);
  j.prevIas = b.iasKts;

  const wheelH = b.pos.y - b.groundY - spec.gearHeight;
  if (!b.onGround && j.phase !== 'rollout') {
    b.aileronInput = aileronForBank(bankCommandForHeading(headingError(hdgCmd, hdg), tasMps), bankRightDeg, -b.angVel.z, j.fm.rollHoldScale(spec, tasMps));
    b.rudderInput = 0;
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
      j.touchdown = { alongM: along, crossM, vsFpm: b.lastAirVsi ?? b.vel.y * M_TO_FT * 60, iasKts: b.iasKts };
    }
    b.throttle = 0;
    b.elevInput = 0.3;
    b.aileronInput = aileronForBank(0, bankRightDeg, -b.angVel.z);
    b.rudderInput = Math.max(-1, Math.min(1, headingError(e.hdgT - Math.max(-5, Math.min(5, crossM * 0.5)), hdg) * 0.15));
    j.groundS += dt;
    if (b.gsKts <= VACATE_KTS || j.groundS > MAX_GROUND_S) j.phase = 'done';
  }
  j.fm.stepFlightModel(b, spec, dt);
  j.t += dt;
}

// Whether traffic may fly: off once the adaptive resolution sits on its floor (resScale.js
// RES_STEPS' last rung, 1) on a device that started above it.
export const trafficAllowed = (pixelRatio, deviceRatio) => !(deviceRatio > 1 && pixelRatio <= 1);

// The scheduler: spawns, flies and retires jets on the sim's clock. `sim` is main.js's (or a
// test's) state: simTime, activeEnd, loadedMission, pos, windVec, mslOffsetM, isaDevC, altimInHg, fm.
// Pure apart from the jet objects it makes at a spawn; tick() allocates nothing otherwise.
export function createTrafficScheduler(sim, { rand = Math.random } = {}) {
  const st = { jet: null, nextAt: null, first: true, mission: undefined, endId: null, off: false, lastT: null, acc: 0, spawned: 0, px: NaN, pz: NaN };
  const retire = (gapS) => { st.jet = null; st.nextAt = sim.simTime + gapS; };
  st.tick = (allowed = true) => {
    const t = sim.simTime ?? 0;
    const dt = st.lastT === null ? 0 : Math.min(0.25, Math.max(0, t - st.lastT));
    st.lastT = t;
    // A new flight (or runway): start over, the first jet ahead of the player. FLY AGAIN reloads the
    // same mission object, so a jump of over 1 km between two frames is a new flight too (a respawn).
    const p = sim.pos, jumped = Math.hypot(p.x - st.px, p.z - st.pz) > 1000;
    st.px = p.x; st.pz = p.z;
    if (jumped || sim.loadedMission !== st.mission || (sim.activeEnd?.id ?? null) !== st.endId) {
      const newFlight = jumped || sim.loadedMission !== st.mission;
      st.mission = sim.loadedMission;
      st.endId = sim.activeEnd?.id ?? null;
      if (newFlight) { st.first = true; st.off = false; }
      if (newFlight || (st.jet && (!sim.activeEnd || sameRunway(st.jet.end, sim.activeEnd) || sim.activeEnd.airport !== TRAFFIC_AIRPORT))) {
        st.jet = null;
        st.nextAt = t + FIRST_SPAWN_S;
      }
    }
    if (!allowed) st.off = true;
    if (st.off) { st.jet = null; return st; }
    if (!st.jet) {
      if (st.nextAt === null) st.nextAt = t + FIRST_SPAWN_S;
      if (t < st.nextAt || !(dt > 0)) return st;
      const s = pickTrafficSpawn(sim.activeEnd, sim.pos, { first: st.first, rand });
      if (!s) { st.nextAt = t + 5; return st; }
      st.jet = createTrafficJet(s.end, s.distNm, sim, sim.fm);
      st.first = false;
      st.spawned++;
      st.acc = 0;
      return st;
    }
    st.jet.body.windVec.copy(sim.windVec ?? st.jet.body.windVec);
    st.acc += dt;
    while (st.acc >= STEP_S) {
      stepTrafficJet(st.jet, STEP_S);
      st.acc -= STEP_S;
    }
    if (st.jet.phase === 'done') retire(GAP_S[0] + rand() * (GAP_S[1] - GAP_S[0]));
    return st;
  };
  return st;
}

// The game's side: `scene` is main.js's THREE.Scene (its onBeforeRender chained, as fuel.js's).
export function createTraffic(scene, sim, base = import.meta.env?.BASE_URL ?? '/') {
  const sched = createTrafficScheduler(sim);
  // The jet is the loaded model itself, added to the scene (no Group of our own: importing three's
  // Group here split Object3D out of the boot chunk, +0.4 kB gz).
  let model = null, loading = false;
  const before = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer, sc, camera, target) {
    before.call(this, renderer, sc, camera, target);
    sched.tick(!!sim.fm && trafficAllowed(renderer.getPixelRatio(), globalThis.devicePixelRatio || 1));
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
    if (j) { model.position.copy(j.body.pos); model.quaternion.copy(j.body.quat); }
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
