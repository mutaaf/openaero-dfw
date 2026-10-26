// JSBSim adapter: flies a `body` (main.js's `sim`, or a tests/flight harness body) with
// JSBSim compiled to WebAssembly, under the same contract as stepFlightModel
// (flightModel.js): read the controls, advance dt, write back pos, vel, quat, angVel and the
// telemetry fields. Pure apart from the JSBSim instance it is handed: no DOM, no fetch.
// Loaders: src/fdm/loadJsbsim.js (browser, lazy) and tests/flight/jsbsimNode.js (Node).
//
// JSBSim is LGPL-2.1 and loads as its own replaceable .wasm (public/CREDITS.md); the
// aircraft it flies (public/jsbsim/) is our own MIT data, written from the POH.
//
// Frames: the sim is +X east, +Y up, −Z north, metres; JSBSim reports NED velocities and
// Euler angles (φ roll right, θ nose up, ψ heading). JSBSim keeps its own lat/lon; we
// integrate pos from its velocity, take height from its altitude, and feed it the terrain
// height under the aircraft every step, so terrain contact stays owned by ground.heightAt.
import { Vector3, Quaternion, Euler } from 'three';
import { M_TO_FT, FT_TO_M, RAD_TO_DEG, DFW_ORIGIN_LAT, DFW_ORIGIN_LON } from '../constants.js';

// The data files the adapter needs, relative to public/jsbsim/.
export const JSBSIM_FILES = ['aircraft/c172/c172.xml', 'engine/io360.xml', 'engine/prop76.xml'];
// Airframes with a JSBSim model; the others keep flightModel.js.
export const JSBSIM_MODELS = { c172: 'c172' };

export const JSBSIM_DT = 1 / 120;
// c172.xml puts the wheels 48 in below the CG; the sim's origin sits spec.gearHeight above
// the ground, so the CG is this much below the origin (plus strut compression).
const CG_ABOVE_WHEELS_M = 48 * 0.0254;
const KTS_PER_FPS = 0.592484;
const FPS = M_TO_FT; // m/s → ft/s
const RHO0_SLUG_FT3 = 0.0023769;
const PSF_PER_INHG = 70.7262;
// Brakes on: both main-wheel brakes at the C172's maximum (POH maximum braking). JSBSim
// blends rolling friction towards static friction (0.8) by the command, the tyres' grip; a
// Skyhawk's small disc brakes are torque-limited well below it, so full pedal is 0.42,
// fitted to POH Fig. 5-11's 575 ft roll (tests/flight/c172.test.js, ticket 0082).
const BRAKE_CMD = 0.42;
// Lean for best power (POH: lean above 3,000 ft for climb): a slow loop on the fuel/air
// ratio, as a pilot leaning to peak RPM would. JSBSim's piston model makes most power near
// AFR 11.3 (full rich at sea level, measured); thinner air richens it, so it leans aloft.
const BEST_POWER_AFR = 11.3;
// The game's throttle is a power lever (0 idle … 1 full, ~linear in thrust: autothrottle and
// trimThrottle assume it); JSBSim's is the throttle plate, whose power is very nonlinear (40%
// plate is idle). Lever → plate, measured at 80 KIAS, sea level: thrust share vs plate.
const LEVER_TO_PLATE = [[0, 0], [0.004, 0.4], [0.069, 0.5], [0.166, 0.6], [0.316, 0.7], [0.554, 0.8], [0.84, 0.9], [1, 1]];
// Pitch trim on the ground: POH "trim TAKEOFF"; JSBSim's own trim for Vy, 74 KIAS clean.
const TAKEOFF_TRIM = -0.11;
// JSBSim's propagation integrators (0 = none: the state holds still while the rest runs).
const INTEGRATORS = ['simulation/integrator/rate/rotational', 'simulation/integrator/rate/translational',
  'simulation/integrator/position/rotational', 'simulation/integrator/position/translational'];
// The engine has settled when the propeller and the power change less than this over half a
// second (the manifold pressure lags, so the rpm alone can pause before it falls).
const SETTLE_WINDOW_STEPS = 60;
const SETTLE_RPM = 1;
const SETTLE_HP = 0.2;
const SETTLE_MAX_STEPS = 1800;

const interp = (table, x, from, to) => {
  if (x <= table[0][from]) return table[0][to];
  for (let i = 1; i < table.length; i++) {
    const a = table[i - 1], b = table[i];
    if (x <= b[from]) return a[to] + ((x - a[from]) / (b[from] - a[from])) * (b[to] - a[to]);
  }
  return table[table.length - 1][to];
};
export const plateForLever = (lever) => interp(LEVER_TO_PLATE, lever, 0, 1);

const _e = new Euler(0, 0, 0, 'YXZ');
const _zero = new Vector3();

export function createJsbsimFdm(sdk, model = 'c172') {
  if (!sdk.loadModel(model)) throw new Error(`JSBSim could not load ${model}`);
  sdk.setDt(JSBSIM_DT);
  const set = (k, v) => sdk.setPropertyValue(k, v);
  const get = (k) => sdk.getPropertyValue(k);
  // Where the adapter last left the body: anything else moved it (a spawn, a reset, a
  // teleport), and JSBSim restarts from the body's new state.
  const last = { pos: new Vector3(), vel: new Vector3(), quat: new Quaternion(), valid: false };
  let carry = 0;
  let mixture = 1;
  let originOffsetM = 0;

  const air = (body) => {
    set('atmosphere/delta-T', (body.isaDevC ?? 0) * 1.8);
    set('atmosphere/P-sl-psf', (body.altimInHg ?? 29.92) * PSF_PER_INHG);
    const w = body.windVec;
    set('atmosphere/wind-north-fps', -w.z * FPS);
    set('atmosphere/wind-east-fps', w.x * FPS);
    set('atmosphere/wind-down-fps', -w.y * FPS);
  };
  const terrainFt = (body) => (body.groundY + (body.mslOffsetM ?? 0)) * M_TO_FT;

  function init(body, spec) {
    originOffsetM = spec.gearHeight - CG_ABOVE_WHEELS_M;
    set('fcs/pitch-trim-cmd-norm', TAKEOFF_TRIM);
    // Airborne, trim the elevator for the speed it starts at, as a pilot would before letting
    // go (a stable aircraft with neutral trim noses over toward its ~105 kt trim speed). Only
    // the pitch trim is kept: the trim also moves throttle and attitude, so the run starts
    // again from the body's state. JSBSim's trim ignores the wind, so it trims in still air
    // on the air-relative velocity.
    const airborne = body.pos.y - body.groundY - spec.gearHeight > 3;
    if (airborne) {
      setIc(body, true);
      set('atmosphere/wind-north-fps', 0);
      set('atmosphere/wind-east-fps', 0);
      set('atmosphere/wind-down-fps', 0);
      start();
      try {
        set('simulation/do_simple_trim', 0);
      } catch {
        set('fcs/pitch-trim-cmd-norm', TAKEOFF_TRIM); // no trim at this state: keep takeoff trim
      }
    }
    setIc(body);
    start();
    if (airborne) settleEngine();
    carry = 0;
  }

  function setIc(body, stillAir = false) {
    _e.setFromQuaternion(body.quat, 'YXZ');
    air(body);
    set('ic/lat-geod-deg', DFW_ORIGIN_LAT);
    set('ic/long-gc-deg', DFW_ORIGIN_LON);
    set('ic/terrain-elevation-ft', terrainFt(body));
    set('ic/h-sl-ft', (body.pos.y - originOffsetM + (body.mslOffsetM ?? 0)) * M_TO_FT);
    set('ic/psi-true-deg', ((-_e.y * RAD_TO_DEG) % 360 + 360) % 360);
    set('ic/theta-deg', _e.x * RAD_TO_DEG);
    set('ic/phi-deg', -_e.z * RAD_TO_DEG);
    // JSBSim's state velocity is ground-relative and the wind comes from atmosphere/ (air());
    // `stillAir` hands it the air-relative velocity instead, for the trim.
    const w = stillAir ? body.windVec : _zero;
    set('ic/vn-fps', -(body.vel.z - w.z) * FPS);
    set('ic/ve-fps', (body.vel.x - w.x) * FPS);
    set('ic/vd-fps', -(body.vel.y - w.y) * FPS);
    set('ic/p-rad_sec', -body.angVel.z);
    set('ic/q-rad_sec', body.angVel.x);
    set('ic/r-rad_sec', -body.angVel.y);
    controls(body);
    // Flaps start where the body has them, not travelling there.
    set('fcs/flap-pos-deg', (body.flapsIndex ?? 0) * 10);
  }

  function start() {
    sdk.runIc();
    set('propulsion/set-running', -1);
  }

  // set-running leaves the engine where its own steady-state search ends (2,283 rpm and
  // ~135 hp with the throttle closed, measured at 61 KIAS; ~150 hp by the first step), and the propeller then takes ~3 s
  // to wind down, pushing the aircraft along: the short-field landing floated ~180 ft on it
  // (ticket 0085). With JSBSim's integrators off the airframe holds still while the engine
  // and propeller run to their own steady state at the body's throttle.
  function settleEngine() {
    const was = INTEGRATORS.map(get);
    for (const k of INTEGRATORS) set(k, 0);
    try {
      let rpm = get('propulsion/engine/propeller-rpm'), hp = get('propulsion/engine/power-hp');
      for (let i = 1; i <= SETTLE_MAX_STEPS; i++) {
        sdk.run();
        if (i % SETTLE_WINDOW_STEPS) continue;
        const nowRpm = get('propulsion/engine/propeller-rpm'), nowHp = get('propulsion/engine/power-hp');
        // A non-finite engine won't settle: stop, and step()'s blow-up guard takes it from there.
        if (!Number.isFinite(nowRpm + nowHp)) break;
        if (Math.abs(nowRpm - rpm) < SETTLE_RPM && Math.abs(nowHp - hp) < SETTLE_HP) break;
        rpm = nowRpm;
        hp = nowHp;
      }
    } finally {
      INTEGRATORS.forEach((k, i) => set(k, was[i]));
    }
  }

  // A non-finite command (a NaN from a control law) would poison JSBSim's state: centre it.
  const cmd = (v) => (Number.isFinite(v) ? v : 0);
  function controls(body) {
    set('fcs/elevator-cmd-norm', cmd(body.elevInput));
    set('fcs/aileron-cmd-norm', cmd(body.aileronInput));
    set('fcs/rudder-cmd-norm', cmd(body.rudderInput));
    set('fcs/steer-cmd-norm', cmd(body.rudderInput));
    set('fcs/throttle-cmd-norm', plateForLever(body.engineFailed ? 0 : cmd(body.throttle))); // 0036: idle, not a stopped engine
    set('fcs/mixture-cmd-norm', mixture);
    set('fcs/flap-cmd-norm', (body.flapsIndex ?? 0) / 3);
    const brake = body.brakesOn ? BRAKE_CMD : 0;
    set('fcs/left-brake-cmd-norm', brake);
    set('fcs/right-brake-cmd-norm', brake);
  }

  function moved(body) {
    return !last.valid || body.pos.distanceToSquared(last.pos) > 0.25
      || body.vel.distanceToSquared(last.vel) > 0.25 || Math.abs(body.quat.dot(last.quat)) < 0.99995;
  }

  function step(body, spec, dt) {
    if (!Number.isFinite(body.pos.y + body.vel.x + body.vel.y + body.vel.z)) return;
    if (moved(body)) init(body, spec);
    air(body);
    set('position/terrain-elevation-asl-ft', terrainFt(body));
    controls(body);
    carry += dt;
    const n = Math.floor(carry / JSBSIM_DT + 1e-6);
    carry -= n * JSBSIM_DT;
    const vy0 = body.vel.y;
    for (let i = 0; i < n; i++) {
      sdk.run();
      const afr = get('propulsion/engine/AFR');
      if (afr > 0) mixture = Math.min(1, Math.max(0.3, mixture + (afr - BEST_POWER_AFR) * 0.02 * JSBSIM_DT));
      set('fcs/mixture-cmd-norm', mixture);
    }
    // A numerical blow-up (seen once while probing propeller loads) must not reach the
    // scene: keep the last good state and restart JSBSim from it.
    if (!Number.isFinite(get('position/h-sl-ft')) || !Number.isFinite(get('velocities/vc-kts'))) {
      last.valid = false;
      return;
    }
    read(body, n * JSBSIM_DT, vy0);
  }

  function read(body, ran, vy0) {
    body.vel.set(get('velocities/v-east-fps'), -get('velocities/v-down-fps'), -get('velocities/v-north-fps')).multiplyScalar(FT_TO_M);
    body.pos.x += body.vel.x * ran;
    body.pos.z += body.vel.z * ran;
    body.pos.y = get('position/h-sl-ft') * FT_TO_M - (body.mslOffsetM ?? 0) + originOffsetM;
    body.quat.setFromEuler(_e.set(get('attitude/theta-rad'), -get('attitude/psi-rad'), -get('attitude/phi-rad'), 'YXZ'));
    body.angVel.set(get('velocities/q-rad_sec'), -get('velocities/r-rad_sec'), -get('velocities/p-rad_sec'));

    body.onGround = get('gear/unit[0]/WOW') + get('gear/unit[1]/WOW') + get('gear/unit[2]/WOW') > 0;
    body.iasKts = get('velocities/vc-kts');
    body.tasKts = get('velocities/vtrue-kts');
    body.gsKts = Math.round(get('velocities/vg-fps') * KTS_PER_FPS);
    body.mach = get('velocities/mach');
    body.aoaDeg = get('aero/alpha-deg');
    body.betaDeg = get('aero/beta-deg');
    body.sigma = get('atmosphere/rho-slugs_ft3') / RHO0_SLUG_FT3;
    body.accelY = ran > 0 ? (body.vel.y - vy0) / ran : 0;
    body.engineN = Math.max(0, get('propulsion/engine/power-hp') / 180);
    body.rpm = get('propulsion/engine/engine-rpm');
    if (!body.onGround) body.lastAirVsi = Math.round(body.vel.y * M_TO_FT * 60);

    last.pos.copy(body.pos);
    last.vel.copy(body.vel);
    last.quat.copy(body.quat);
    last.valid = true;
  }

  return { step, init, get, set, dispose: () => sdk.destroy?.() };
}
