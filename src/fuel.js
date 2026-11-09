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
// figure: ~0.8 GPH at no power, ~13 GPH at 100%). The model's brake power is engine.js's: the spool
// (engineN) times the piston power lapse, the share of the rated 180 hp full throttle makes at that
// air (inlined below with the ISA so this chunk imports nothing from boot; the unit card pins it to
// engine.js pistonPowerLapse over atmosphere.js airAt).

export const USABLE_GAL = 53;
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

// ISA at a height (m MSL) with a temperature deviation, then engine.js's lapse: (10·δ/√θ − 1) / 9.
export function powerLapseAt(altM, isaDevC = 0) {
  const t = 288.15 - 0.0065 * altM;
  const delta = Math.pow(t / 288.15, 5.25588);
  return (10 * delta / Math.sqrt((t + isaDevC) / 288.15) - 1) / 9;
}

// Brake power (% of 180 hp) the engine makes now: none when it has failed or its tank is dry.
export const brakePowerPct = (body) => (body.engineFailed ? 0
  : 100 * (body.engineN ?? body.throttle ?? 0) * powerLapseAt(body.pos.y + (body.mslOffsetM ?? 0), body.isaDevC ?? 0));

// Burn dt seconds of fuel from body.fuelGal at the engine's power; at empty the engine quits
// (engineFailed) and body.fuelOut says why. Returns the flow (GPH) burned at.
export function fuelStep(body, dt) {
  const gph = body.engineFailed ? 0 : fuelFlowGph(brakePowerPct(body));
  body.fuelGal = Math.max(0, body.fuelGal - (gph * dt) / 3600);
  if (body.fuelGal === 0 && !body.engineFailed) { body.engineFailed = true; body.fuelOut = true; }
  return gph;
}

// The readout: gallons and the time they last at this burn (h:mm), or why there is none.
export function fuelText(gal, gph) {
  if (gal <= 0) return 'FUEL EXHAUSTED';
  if (!(gph > 0)) return `FUEL ${gal.toFixed(1)} GAL`;
  const min = Math.floor((gal / gph) * 60);
  return `FUEL ${gal.toFixed(1)} GAL ${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

// Amber once the tank holds less than the 45-minute reserve at this burn; red when it is dry.
export const fuelLevel = (gal, gph) => (gal <= 0 ? 'out' : gph > 0 && (gal / gph) * 60 < RESERVE_MIN ? 'low' : 'ok');

// scene: the THREE.Scene main.js renders (its onBeforeRender is chained, as buffet.js's); sim: the shared
// state. It owns sim.fuelGal and sim.fuelOut; main.js loadScenario sets both null for a new flight.
export function createFuel(scene, sim) {
  const els = ['txtFuel', 'txtTouchFuel'].map((id) => document.getElementById(id)).filter(Boolean);
  let lastT = null, shown = null, level = null, gph = 0;
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
  scene.onBeforeRender = function (...args) {
    before.apply(this, args);
    const t = sim.simTime ?? 0;
    const dt = lastT === null ? 0 : Math.min(1, Math.max(0, t - lastT));
    lastT = t;
    if (sim.spec?.engine?.type !== 'piston-prop' || sim.assist !== 'pilot') {
      // No fuel to manage here: an engine the tank stopped (this flight) runs again; a drill's stays out.
      if (sim.fuelOut) sim.engineFailed = false;
      sim.fuelGal = sim.fuelOut = null;
      show(null, null);
      return;
    }
    sim.fuelGal ??= startFuelGal(sim.onGround, (sim.pos.y + (sim.mslOffsetM ?? 0)) * 3.28084);
    if (dt > 0) gph = fuelStep(sim, dt);
    show(fuelText(sim.fuelGal, gph), fuelLevel(sim.fuelGal, gph));
  };
  const api = { debug: () => ({ gal: sim.fuelGal, gph, out: !!sim.fuelOut, text: shown }), set: (gal) => { sim.fuelGal = gal; } };
  if (globalThis.location && new URLSearchParams(location.search).has('debug')) window.openaeroFuel = api; // e2e
  return api;
}
