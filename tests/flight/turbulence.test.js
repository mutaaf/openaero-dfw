// Ticket 0195: a gusty METAR shakes the airplane (src/turbulence.js, Dryden in MIL-F-8785C's
// low-altitude form, added to the wind as main.js updateWind does: harness.js turbulentAir).
// The air is the same for every type; the response is the flight model's: a vertical gust w
// changes α by w / V and the load by Δn = ρ V CLα w / (2 W/S), and turbulence.js's span lag
// (4b / πV) averages the small eddies low down over the 737's 35.8 m wing more than the
// Cessna's 11 m. Kid's hands-off landings on the same day: tests/flight/kidFinal.test.js.
import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { KTS_TO_MPS, FT_TO_M } from '../../src/constants.js';
import { trimThrottle } from '../../src/flightModel.js';
import { landingFlaps } from '../../src/aero.js';
import { airAt } from '../../src/atmosphere.js';
import { aileronForBank, elevatorForPitch } from '../../src/autopilot.js';
import { makeBody, fly, attitude, vsFpm, turbulentAir, loadFactorMeter } from './harness.js';

const GUSTY = { windDirDeg: 360, windKts: 25, gustKts: 38 }; // 25G38 straight down a north final
const CALM = { windDirDeg: null, windKts: 0, gustKts: 0 };

// The 10 NM final: from the 3° path's ~3,200 ft at Vref + 5 and the landing flaps, the power for a 3°
// descent, down to 500 ft. flightModel.js commands a pitch rate, so a test pilot holding the attitude
// (the descent's pitch) and the wings level shows the gusts where a pilot feels them: the seat's load
// factor, the bank and the vertical speed (the pitch stays held). Standard deviations after 10 s.
function finalStats(acKey, wx, seed, scale = 1) {
  const spec = AIRCRAFT_DATABASE[acKey], kts = spec.vrefKts + 5, flaps = landingFlaps(spec);
  const altM = 10 * 1852 * Math.tan(3 * Math.PI / 180);
  const b = makeBody(spec, { kts, altM, flaps });
  b.throttle = b.engineN = trimThrottle(spec, kts * KTS_TO_MPS, flaps, -3, true, airAt(altM));
  const air = turbulentAir(spec, wx, { seed, scale });
  air(b, 0);
  b.vel.x += b.windVec.x; b.vel.z += b.windVec.z;
  const pitch0 = attitude(b).pitchDeg - 3;
  const meter = loadFactorMeter();
  const acc = { r: [], v: [], n: [] };
  fly(b, spec, 900, (x, dt) => {
    air(x, dt);
    const a = attitude(x);
    x.elevInput = elevatorForPitch(pitch0, a.pitchDeg, x.angVel.x);
    x.aileronInput = aileronForBank(0, a.bankRightDeg, -x.angVel.z) + (x.propAil ?? 0); // the hold trims the prop's torque, as main.js's does (0194)
  }, (x) => {
    const n = meter(x);
    if (x.pos.y < 500 * FT_TO_M) return true;
    if (x.t > 10) { acc.r.push(attitude(x).bankRightDeg); acc.v.push(vsFpm(x)); acc.n.push(n); }
    return false;
  });
  const sd = (xs) => { const m = xs.reduce((s, x) => s + x, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length); };
  return { bank: sd(acc.r), vs: sd(acc.v), g: sd(acc.n), endFt: b.pos.y / FT_TO_M, t: b.t };
}
const mean = (ac, wx) => {
  const runs = [1, 2, 3].map((seed) => finalStats(ac, wx, seed));
  const m = (k) => runs.reduce((s, r) => s + r[k], 0) / runs.length;
  return { bank: m('bank'), vs: m('vs'), g: m('g'), endFt: m('endFt'), t: m('t') };
};
const f = (s) => `load factor ±${s.g.toFixed(3)} g, bank ±${s.bank.toFixed(2)}°, VS ±${s.vs.toFixed(0)} fpm (to ${s.endFt.toFixed(0)} ft in ${s.t.toFixed(0)} s)`;

describe('turbulence: the Cessna shakes more than the 737 in the same 25G38 air, and calm air is still (0195)', () => {
  it('10 NM final to 500 ft, three seeds each: the Cessna\'s load factor, bank and VS spread beat the 737\'s; calm shakes neither', () => {
    const c = mean('c172', GUSTY), j = mean('b738', GUSTY);
    const c0 = finalStats('c172', CALM, 1), j0 = finalStats('b738', CALM, 1);
    const cCycle = finalStats('c172', GUSTY, 1, 0); // the same day with weather.js's gust cycle alone (no turbulence)
    console.log(`[turbulence] 25G38 c172 ${f(c)}`);
    console.log(`[turbulence] 25G38 b738 ${f(j)}`);
    console.log(`[turbulence] 25G38, gust cycle only, c172 ${f(cCycle)}`);
    console.log(`[turbulence] calm c172 ${f(c0)}; b738 ${f(j0)}`);
    for (const s of [c, j, c0, j0]) expect(s.endFt).toBeLessThan(510); // both flew the whole final
    expect(c.g).toBeGreaterThan(1.15 * j.g);
    expect(c.bank).toBeGreaterThan(1.5 * j.bank);
    expect(c.vs).toBeGreaterThan(j.vs);
    // Calm: no gusts at all (turbulence.js gives 0); what is left is the hold settling.
    for (const s of [c0, j0]) { expect(s.g).toBeLessThan(0.002); expect(s.bank).toBeLessThan(0.01); }
    expect(c.g).toBeGreaterThan(20 * c0.g);
    expect(c.g).toBeGreaterThan(1.5 * cCycle.g); // the shaking is the turbulence, not the slow gust swing
    expect(cCycle.bank).toBeLessThan(0.01);
    expect(c.vs).toBeGreaterThan(4 * c0.vs);
    expect(j.vs).toBeGreaterThan(4 * j0.vs);
  }, 30000);
});
