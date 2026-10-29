// Aircraft systems: what stands between the pilot's levers and the airframe. Pure (no THREE,
// no DOM): stepFlightModel runs it every sub-step, so tests/flight/ flies it headless.
//
//   Hydraulic actuators: the gear and the flaps take real time to move. The lever is the
//     command (body.gearDown, body.flapsIndex); the surfaces follow at the airframe's rate
//     (body.gearPos 0 up → 1 down and locked, body.flapDeg actual flap angle, body.flapPos
//     the same in notch units, fractional in between, for aero.js). The 737's flap load
//     relief walks flaps 40 back to 30 above the flaps 40 placard.
//   Brakes: body.brakePress 0..1 follows the pedals or the autobrake with a short lag; the
//     tyres turn it into friction (flightModel.js), anti-skid caps it at what the runway
//     gives.
//   Autobrake (airframes with spec.systems.autobrake): body.autobrake 0 OFF, 1, 2, 3, 4 MAX.
//     Armed in the air; on the ground with the thrust levers at idle (or in reverse) it
//     holds the setting's deceleration, and disarms on manual braking, the thrust levers
//     advanced, or a stop.
//   Thrust reversers (spec.systems.reverser): body.reverseCmd deploys the sleeves on the
//     ground only (body.reverserPos 0..1); deployed, the throttle sets reverse thrust.
//
// Seeding: a body without these fields starts with the surfaces where the levers are
// (a spawn in trim, a test card), exactly like engineN.

export const AUTOBRAKE_LABELS = ['OFF', '1', '2', '3', 'MAX'];
export const DEFAULT_FLAP_DETENTS = [0, 10, 25, 40]; // main.js labels for airframes without a table
const FT_S2 = 0.3048;
const KTS = 0.514444;

// Airframes without their own numbers get these (estimates; the F-16's gear cycles in a few
// seconds, its flaps are automatic and fast; its high-pressure tyres and fully modulating
// anti-skid, for a wet runway, 0108).
const DEFAULTS = {
  gear: { extendS: 6, retractS: 5 },
  flaps: { degPerS: 5 },
  brakes: { tauS: 0.3, muMax: 0.45, tirePsi: 300, antiSkid: 0.8 },
};

export const systemsOf = (spec) => ({
  gear: spec.systems?.gear ?? DEFAULTS.gear,
  flaps: spec.systems?.flaps ?? DEFAULTS.flaps,
  brakes: spec.systems?.brakes ?? DEFAULTS.brakes,
  autobrake: spec.systems?.autobrake ?? null,
  reverser: spec.systems?.reverser ?? null,
  hydraulics: spec.systems?.hydraulics ?? null,
});

export const flapDetents = (spec) => spec.flapDetentsDeg ?? DEFAULT_FLAP_DETENTS;

// Flap angle (deg) → notch units, fractional between detents (aero.js interpolates).
export function flapNotch(detents, deg) {
  if (deg <= detents[0]) return 0;
  for (let i = 1; i < detents.length; i++) {
    if (deg <= detents[i]) return i - 1 + (deg - detents[i - 1]) / (detents[i] - detents[i - 1]);
  }
  return detents.length - 1;
}

// Where the flaps are going: the lever's detent, unless the 737's load relief holds them
// back (40 → 30 above the placard, out again once slower: Boeing FCOM 9.20).
export function flapTargetDeg(spec, body) {
  const d = flapDetents(spec);
  const lever = Math.min(body.flapsIndex ?? 0, d.length - 1);
  const flr = systemsOf(spec).flaps.loadRelief;
  if (flr && lever === flr.fromIndex && (body.iasKts ?? 0) > flr.aboveKts) return d[flr.toIndex];
  return d[lever];
}

export const gearLocked = (body) => (body.gearPos ?? (body.gearDown ? 1 : 0)) >= 1;
export const gearInTransit = (body) => { const p = body.gearPos ?? (body.gearDown ? 1 : 0); return p > 0 && p < 1; };

export function seedSystems(spec, body) {
  body.gearPos = spec.fixedGear || body.gearDown ? 1 : 0;
  body.flapDeg = flapDetents(spec)[Math.min(body.flapsIndex ?? 0, flapDetents(spec).length - 1)];
  body.flapPos = flapNotch(flapDetents(spec), body.flapDeg);
  body.brakePress = body.brakesOn ? 1 : 0;
  body.autobrakeActive = false;
  body.reverserPos = 0;
  body.reverseCmd = false;
  body.hydPsi = systemsOf(spec).hydraulics?.psi ?? 0;
  body._gs = null;
  body.decelMps2 = 0;
}

export function stepSystems(body, spec, dt) {
  if (body.gearPos === undefined || body.flapDeg === undefined) seedSystems(spec, body);
  const sys = systemsOf(spec);

  // Hydraulic pressure: engine-driven and electric pumps hold it with the engines running
  // (the sim's engines always are); the gauges read it.
  if (sys.hydraulics) body.hydPsi = sys.hydraulics.psi;

  // Gear: fixed gear is always down; retractable gear travels at its rate.
  if (spec.fixedGear) body.gearPos = 1;
  else {
    const down = body.gearDown;
    const rate = 1 / (down ? sys.gear.extendS : sys.gear.retractS);
    body.gearPos = Math.min(1, Math.max(0, body.gearPos + (down ? rate : -rate) * dt));
  }

  // Flaps travel at their rate towards the target angle.
  const target = flapTargetDeg(spec, body);
  const step = sys.flaps.degPerS * dt;
  body.flapDeg += Math.max(-step, Math.min(step, target - body.flapDeg));
  body.flapPos = flapNotch(flapDetents(spec), body.flapDeg);

  // Groundspeed rate (positive = slowing), measured over the step: the autobrake's feedback.
  const gs = Math.hypot(body.vel.x, body.vel.z);
  if (body._gs !== null && dt > 0) body.decelMps2 += ((body._gs - gs) / dt - body.decelMps2) * Math.min(1, dt / 0.15);
  body._gs = gs;

  // Thrust reversers: on the ground only; the sleeves take ~2 s each way.
  if (sys.reverser) {
    if (!body.onGround) body.reverseCmd = false;
    const want = body.reverseCmd ? 1 : 0;
    const r = dt / sys.reverser.deployS;
    body.reverserPos = Math.min(1, Math.max(0, body.reverserPos + (want > body.reverserPos ? r : -r)));
  }

  // Autobrake: a PI loop on deceleration. Disarmed by the pedals, by forward thrust, or at
  // a stop (Boeing: it holds the aircraft stopped until disarmed; a player expects to taxi).
  let cmd = body.brakesOn ? 1 : 0;
  if (sys.autobrake && body.autobrake > 0) {
    const reverseOrIdle = body.throttle < 0.05 || body.reverserPos > 0;
    if (!body.onGround) body.autobrakeActive = false;
    else if (body.brakesOn || !reverseOrIdle) { body.autobrake = 0; body.autobrakeActive = false; }
    else if (!body.autobrakeActive && gs > 30 * KTS) { body.autobrakeActive = true; body._abI = body.autobrake === 4 ? 1 : 0.3; }
    if (body.autobrakeActive) {
      if (gs < 3 * KTS) { body.autobrakeActive = false; body.autobrake = 0; }
      else {
        const targetMps2 = sys.autobrake.decelFtS2[body.autobrake] * FT_S2;
        const err = targetMps2 - body.decelMps2;
        body._abI = Math.min(1, Math.max(0, body._abI + err * 0.5 * dt));
        cmd = Math.max(cmd, Math.min(1, Math.max(0, body._abI + err * 0.06)));
      }
    }
  } else body.autobrakeActive = false;

  body.brakePress += (cmd - body.brakePress) * Math.min(1, dt / sys.brakes.tauS);
}

// Wet runway (ticket 0108): 14 CFR 25.109(c)(1)'s maximum tyre-to-ground braking coefficient
// on a wet runway, a cubic in V/100 (V = true groundspeed, kt) per maximum tyre pressure,
// linear between the listed pressures (as the rule allows); below 50 psi its 50 psi row.
const WET_MU_ROWS = [
  [50, -0.0350, 0.306, -0.851, 0.883],
  [100, -0.0437, 0.320, -0.805, 0.804],
  [200, -0.0331, 0.252, -0.658, 0.692],
  [300, -0.0401, 0.263, -0.611, 0.614],
];
const wetRow = (r, v) => ((r[1] * v + r[2]) * v + r[3]) * v + r[4];
export function wetRunwayMuMax(tirePsi, gsKts) {
  const v = Math.min(2, Math.max(0, gsKts / 100));
  const psi = Math.min(300, Math.max(50, tirePsi));
  let i = 0;
  while (i < WET_MU_ROWS.length - 2 && psi > WET_MU_ROWS[i + 1][0]) i++;
  const a = WET_MU_ROWS[i], b = WET_MU_ROWS[i + 1];
  return wetRow(a, v) + (wetRow(b, v) - wetRow(a, v)) * (psi - a[0]) / (b[0] - a[0]);
}

// Tyre friction for the brake pressure (flightModel.js): rolling μ, plus the brakes up to
// what anti-skid lets the runway give (dry concrete). Wet (body.wetRunway: the METAR's rain),
// the most is 25.109(c)(1)'s coefficient at this groundspeed times (c)(2)'s anti-skid
// efficiency (spec.systems.brakes.antiSkid: on-off 0.30, quasi-modulating 0.50, fully
// modulating 0.80), never more than dry.
export const ROLLING_MU = 0.03;
export function brakeMu(spec, brakePress, wet = false, gsKts = 0) {
  const br = spec.systems?.brakes ?? DEFAULTS.brakes;
  let muMax = br.muMax;
  if (wet) muMax = Math.min(muMax, wetRunwayMuMax(br.tirePsi ?? DEFAULTS.brakes.tirePsi, gsKts) * (br.antiSkid ?? DEFAULTS.brakes.antiSkid));
  return ROLLING_MU + (muMax - ROLLING_MU) * Math.min(1, Math.max(0, brakePress));
}

// Net thrust after the reversers: deployed sleeves turn the fan stream forward at the
// cascade's effectiveness (a fraction of the forward thrust at the same spool).
export function reversedThrust(spec, thrustN, reverserPos) {
  const rev = systemsOf(spec).reverser;
  if (!rev || !(reverserPos > 0)) return thrustN;
  return thrustN * (1 - reverserPos * (1 + rev.effectiveness));
}
