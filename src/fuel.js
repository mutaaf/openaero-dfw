// The Cessna's fuel (0162, in runwayLights.js's lazy chunk like buffet.js): the IO-360 burns its
// tanks at the POH's lean-mixture rate for the power it makes, and an empty tank stops it through
// the dead-stick drill's path (sim.engineFailed: no power whatever the throttle). Pilot only: Kid
// and Learner have no fuel to manage. Pure parts tested in tests/unit/fuel.test.js; the burn flown
// headless in tests/flight/c172.test.js against the POH's range and endurance.
//
// Source: Cessna 172S POH (July 8/98, Rev. 4; https://www.befa.org/wp-content/uploads/2019/12/POH-Cessna-172S.pdf):
//  - Section 1 / 2: 53.0 US gal usable.
//  - Fig. 5-8 Cruise Performance (2,550 lb, recommended lean mixture at all altitudes): % BHP, KTAS
//    and GPH by altitude, rpm and temperature. Across its 2,000-12,000 ft rows and all three
//    temperature columns the lean fuel flow is one function of the power (every row within ~0.3 GPH
//    of the line below, the unit card), as a constant-BSFC piston engine's is. FLOW is that line:
//    Fig. 5-8's standard-temperature column at 8,000 ft, with its 83% (20 °C below) and 40% (4,000 ft,
//    20 °C above) rows for the ends.
//  - Fig. 5-7 Time, Fuel and Distance to Climb (full throttle, standard temperature): the fuel used
//    from sea level to each altitude, and note 1, 1.4 gal for engine start, taxi and takeoff.
// Outside Fig. 5-8's 40-83% the line is extended along its end segments (our extrapolation, not a POH
// figure: ~0.8 GPH at no power, ~13 GPH at 100%; the readout shows no endurance there). The model's
// brake power is torque × rpm (brakePowerPct below), the torque from engine.js's piston power lapse
// (inlined with the ISA so this chunk imports nothing from boot; the unit card pins it to engine.js
// pistonPowerLapse over atmosphere.js airAt).

export const USABLE_GAL = 53;
export const RATED_RPM = 2700; // 180 hp at 2700 rpm (POH Section 2, IO-360-L2A)
export const START_TAXI_TAKEOFF_GAL = 1.4;
export const RESERVE_MIN = 45; // the POH's range and endurance profiles keep 45 minutes at the cruise power
const FLOW = [[40, 6.1], [43, 6.5], [48, 7.1], [54, 7.8], [61, 8.6], [68, 9.4], [72, 9.9], [77, 10.4], [83, 11.1]];
const CLIMB_GAL = [[0, 0], [1000, 0.4], [2000, 0.8], [3000, 1.2], [4000, 1.5], [5000, 1.9], [6000, 2.2], [7000, 2.6], [8000, 3.0], [9000, 3.4], [10000, 3.9], [11000, 4.4], [12000, 5.0]];

// Piecewise linear through `t`, carried on along the end segments.
function line(t, x) {
  let i = 1;
  while (i < t.length - 1 && x > t[i][0]) i++;
  const [x0, y0] = t[i - 1], [x1, y1] = t[i];
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

// Lean fuel flow (US gal/h) at a brake power (% of 180 hp).
export const fuelFlowGph = (bhpPct) => Math.max(0, line(FLOW, bhpPct));

// Fuel used climbing from sea level to `ft` at full throttle (Fig. 5-7).
export const climbFuelGal = (ft) => Math.max(0, line(CLIMB_GAL, ft));

// The tanks at a spawn: full on the ground; in the air, less the start, taxi and takeoff allowance and
// the climb to the spawn's height (the POH's own planning), so an airborne mission has flown there.
export const startFuelGal = (onGround, altFtMsl) => (onGround ? USABLE_GAL
  : USABLE_GAL - START_TAXI_TAKEOFF_GAL - climbFuelGal(altFtMsl));

// ISA at a height (m MSL) with a temperature deviation and the altimeter setting (atmosphere.js
// airAt's pressure altitude), then engine.js's lapse: (10·δ/√θ − 1) / 9.
export function powerLapseAt(altM, isaDevC = 0, altimInHg = 29.92) {
  const t = 288.15 - 0.0065 * (altM + (29.92 - altimInHg) * 304.8);
  const delta = Math.pow(t / 288.15, 5.25588);
  return (10 * delta / Math.sqrt((t + isaDevC) / 288.15) - 1) / 9;
}

// Brake power (% of 180 hp) the engine makes now: none when it has failed or its tank is dry. Torque ×
// rpm: the throttle sets a torque (engineN × the full-throttle lapse), and the fixed-pitch prop turns
// where that torque meets its own (engineSound.js engineRpm, prop76.xml's Cp(J)), so a part throttle
// makes less power at a lower rpm. At each Fig. 5-8 row's own KTAS the model turns the row's rpm
// within ~1% and makes its % BHP within ~4 points (tests/flight/c172.test.js); the lever's share
// alone (engineN × lapse) read 8-16 points high at part throttle and starved the 45% cruise.
// `engineRpm` is engineSound.js's (passed in: a static import here put that chunk on the boot chunk's
// preload list for this one, +20 B over the 201 kB line; createFuel fetches it lazily).
export function brakePowerPct(body, engineRpm) {
  if (body.engineFailed) return 0;
  const n = body.engineN ?? body.throttle ?? 0;
  const altM = body.pos.y + (body.mslOffsetM ?? 0);
  const rpm = engineRpm(n, (body.tasKts ?? 0) * 0.514444, body.sigma ?? 1, true);
  return 100 * n * powerLapseAt(altM, body.isaDevC ?? 0, body.altimInHg ?? 29.92) * (rpm / RATED_RPM);
}

// Burn dt seconds of fuel from body.fuelGal at the engine's power; at empty the engine quits
// (engineFailed) and body.fuelOut says why. Returns the flow (GPH) burned at.
export function fuelStep(body, dt, engineRpm) {
  const gph = body.engineFailed ? 0 : fuelFlowGph(brakePowerPct(body, engineRpm));
  body.fuelGal = Math.max(0, body.fuelGal - (gph * dt) / 3600);
  if (body.fuelGal === 0 && !body.engineFailed) { body.engineFailed = true; body.fuelOut = true; }
  return gph;
}

// The readout: gallons, and the time they last at this burn ("5h31", not a clock's 5:31) while the
// engine makes a power Fig. 5-8 covers (40-83%); outside it (idle, a takeoff's full power) the flow is
// our extrapolation, so gallons alone.
export function fuelText(gal, bhpPct, gph) {
  if (gal <= 0) return 'FUEL EXHAUSTED';
  if (!(bhpPct >= 40 && bhpPct <= 83) || !(gph > 0)) return `FUEL ${gal.toFixed(1)} GAL`;
  const min = Math.floor((gal / gph) * 60);
  return `FUEL ${gal.toFixed(1)} GAL ${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

// The reserve in gallons: 45 minutes at 75% power, as the POH's range and endurance profiles keep it
// (~7.6 gal). A fixed line, so the amber doesn't come and go with the throttle.
export const RESERVE_GAL = (RESERVE_MIN / 60) * fuelFlowGph(75);
// Amber under the reserve; red when the tank is dry.
export const fuelLevel = (gal) => (gal <= 0 ? 'out' : gal < RESERVE_GAL ? 'low' : 'ok');

// scene: the THREE.Scene main.js renders (its onBeforeRender is chained, as buffet.js's); sim: the shared
// state. It owns sim.fuelGal and sim.fuelOut; main.js loadScenario sets both null for a new flight.
export function createFuel(scene, sim) {
  const els = ['txtFuel', 'txtTouchFuel'].map((id) => document.getElementById(id)).filter(Boolean);
  let lastT = null, shown = null, level = null, gph = 0, key = NaN, rpmAt = null;
  import('./engineSound.js').then((m) => { rpmAt = m.engineRpm; }).catch(console.warn); // no burn until it lands (ms)
  const show = (text, lvl) => {
    if (text === shown && lvl === level) return; // the DOM is written only when the line changes
    shown = text; level = lvl;
    for (const el of els) {
      el.textContent = text ?? '';
      el.classList.toggle('hidden', text === null);
      el.dataset.fuel = lvl ?? '';
    }
  };
  const before = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer, sc, camera, target) {
    before.call(this, renderer, sc, camera, target);
    const t = sim.simTime ?? 0;
    const dt = lastT === null ? 0 : Math.min(1, Math.max(0, t - lastT));
    lastT = t;
    if (sim.spec?.engine?.type !== 'piston-prop' || sim.assist !== 'pilot') {
      // No fuel to manage here: an engine the tank stopped (this flight) runs again; a drill's stays out.
      if (sim.fuelOut) sim.engineFailed = false;
      sim.fuelGal = sim.fuelOut = null;
      show(null, null);
      key = NaN;
      return;
    }
    sim.fuelGal ??= startFuelGal(sim.onGround, (sim.pos.y + (sim.mslOffsetM ?? 0)) * 3.28084);
    if (!rpmAt) return;
    if (dt > 0) gph = fuelStep(sim, dt, rpmAt);
    // The line is built only when what it shows changes (tenths of a gallon, the minute, in or out of
    // Fig. 5-8's powers): no string per frame.
    const bhp = brakePowerPct(sim, rpmAt);
    const k = Math.round(sim.fuelGal * 10) * 1e6 + (bhp >= 40 && bhp <= 83 && gph > 0 ? Math.floor((sim.fuelGal / gph) * 60) + 1 : 0);
    if (k !== key || shown === null) { key = k; show(fuelText(sim.fuelGal, bhp, gph), fuelLevel(sim.fuelGal)); }
  };
  const api = { debug: () => ({ gal: sim.fuelGal, gph, out: !!sim.fuelOut, text: shown }), set: (gal) => { sim.fuelGal = gal; } };
  if (globalThis.location && new URLSearchParams(location.search).has('debug')) window.openaeroFuel = api; // e2e
  return api;
}
