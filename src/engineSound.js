// The engine's voice (0148, lazy chunk: audio.js imports it on init, after a user gesture).
// Pure; tests/unit/engineSound.test.js. audio.js drives its oscillator from what the engine
// is doing (flightModel.js's spooled sim.engineN, the airspeed), not from the lever.
//
// Piston (the C172): a fixed-pitch prop turns where the engine's torque meets the prop's.
// Our JSBSim prop (public/jsbsim/engine/prop76.xml: McCauley 76 in, 2 blades, C_POWER vs
// J = V/(nD), pinned to the POH) absorbs P = Cp(J)·ρ·n³·D⁵; the IO-360-L2A (io360.xml) makes
// 180 hp at 2700 rpm, taken as a constant torque per throttle (power ∝ rpm at a fixed
// manifold pressure), scaled by the Gagg-Farrar altitude lapse σ − (1 − σ)/7.55 (engine.js
// cites it). Balance: Cp(J)·ρ·n²·D⁵ = 2π·Q, solved by bisection (no allocation). Static full
// power lands on ~2300 rpm (POH Section 4: 2300-2420 at full throttle) and the prop unloads
// to ~2700 at the 126 KTAS maximum (POH Section 1). A running engine never turns below its
// 650 rpm idle; a dead one windmills where Cp crosses zero (J ≈ 1.1) and stops with the air.
// The voice is the blade-pass tone, rpm × 2 blades / 60 (a 2-blade prop on a 4-cylinder
// four-stroke: the firing rate is the same, two a revolution).
//
// Turbofan: thrust goes roughly as N1² (fan speed), so N1 = √(idle + (1 − idle)·n): 20% at
// the 737's and F-16's 4% idle thrust, 100% at full. The whine's pitch and its low-pass
// open with N1, so the spool lag (engine.js spoolEngine) is audible; the 737 lower and
// rounder, the F-16 higher with a brighter rasp. Those two voicings are tuning, not data.

const D = 1.9304; // m, 76 in
const D5 = D ** 5;
const Q_FULL = (180 * 745.7) / ((2 * Math.PI * 2700) / 60); // N·m at 2700 rpm, ~475
const IDLE_RPM = 650;
// prop76.xml C_POWER (J, Cp)
const CP = [[0, 0.0616], [0.2, 0.06], [0.4, 0.057], [0.5, 0.0545], [0.6, 0.051], [0.7, 0.047], [0.75, 0.0448], [0.8, 0.041], [0.9, 0.03], [1, 0.016], [1.1, 0], [1.2, -0.018], [1.4, -0.055], [2, -0.15]];

function cpAt(j) {
  if (j <= 0) return CP[0][1];
  for (let i = 1; i < CP.length; i++) {
    if (j <= CP[i][0]) {
      const a = CP[i - 1], b = CP[i];
      return a[1] + ((b[1] - a[1]) * (j - a[0])) / (b[0] - a[0]);
    }
  }
  return CP[CP.length - 1][1];
}

// Prop rpm at spool n ∈ [0, 1], true airspeed (m/s), density ratio σ, engine running or not.
export function engineRpm(n, tasMps, sigma, running) {
  const rho = 1.225 * sigma;
  const q = running ? Q_FULL * n * Math.max(0, sigma - (1 - sigma) / 7.55) : 0;
  const v = Math.max(0, tasMps);
  // f(rps) = Cp(J)·ρ·rps²·D⁵ − 2πQ rises with rps (Cp falls with J = V/(rps·D)).
  let lo = 0, hi = 70; // rps; 4200 rpm is past any dive
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (cpAt(v / (mid * D)) * rho * mid * mid * D5 < 2 * Math.PI * q) lo = mid;
    else hi = mid;
  }
  const rpm = lo * 60;
  return running ? Math.max(IDLE_RPM, rpm) : rpm < 1 ? 0 : rpm;
}

export const fanN1 = (e, n) => Math.sqrt((e.idleFraction ?? 0) + (1 - (e.idleFraction ?? 0)) * n);

// The voice for this frame into `out` ({ hz, gain, filterHz }), returned.
export function engineVoice(sim, out) {
  const e = sim.spec.engine;
  const n = sim.engineN ?? 0;
  if (e.type === 'piston-prop') {
    const rpm = engineRpm(n, (sim.tasKts || 0) * 0.514444, sim.sigma ?? 1, !sim.engineFailed);
    out.hz = (rpm * 2) / 60;
    out.gain = 0.04 + (sim.engineFailed ? 0 : n) * 0.08;
    out.filterHz = 450;
    return out;
  }
  const n1 = sim.engineFailed ? Math.sqrt(n) : fanN1(e, n);
  const raspy = sim.spec.pitchFbw; // the F-16
  out.hz = raspy ? 80 + 320 * n1 : 60 + 220 * n1;
  out.gain = 0.03 + 0.09 * n1 * n1;
  out.filterHz = raspy ? 400 + 1400 * n1 : 300 + 500 * n1;
  return out;
}
