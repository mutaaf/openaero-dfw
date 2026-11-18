// The autopilot's glideslope mode in turbulence (main.js holdGamma, autopilot.js pitchForPath; turbulence 0195).
// The 737 at Vref + 5 with the landing flaps flies a 4 NM ILS final down the 3° path, coupled as main.js couples it
// (glidepathGammaDeg, the autothrottle on trimThrottle's feed-forward), in the reported air of two METARs: the
// stabilized e2e's IFR day (18005KT, a 5 kt tailwind on a north final) and a gusty headwind day (36015G25KT).
// The gate (aero.js stabilizedGate, FSF ALAR 7.1) wants within 1 dot of the glideslope and no more than 1,000 fpm
// down at 1,000 ft in IMC, read on aero.js gateVsStep (smoothed over ~2 s). Which half of the fix does what: on the
// e2e's IFR day both laws read 695-950 fpm here once smoothed, so there the lag is what closes stabilized.spec's
// failure (its instantaneous reading crossed 1,000 in 5 of 16 runs). The law is pinned on the gusty day: path + α
// chased each gust's α (w / V) and failed the gate (-1,234 fpm, seed 3); the path flown over the ground does not.
// Six turbulence seeds a day, from 1,300 ft (the spawn's height) down through the gate to 500 ft.
import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { KTS_TO_MPS, M_TO_FT, FT_TO_M, RAD_TO_DEG } from '../../src/constants.js';
import { trimThrottle } from '../../src/flightModel.js';
import { airAt } from '../../src/atmosphere.js';
import { landingFlaps, vrefFor, ilsDots, GS_DOT_DEG, gateVsStep } from '../../src/aero.js';
import { glidepathGammaDeg, elevatorForPitch, aileronForBank, autothrottleCommand, pitchForPath } from '../../src/autopilot.js';
import { makeBody, fly, attitude, turbulentAir } from './harness.js';

const spec = AIRCRAFT_DATABASE.b738;
const TAN3 = Math.tan(3 * Math.PI / 180);
const IFR_DAY = { windDirDeg: 180, windKts: 5, gustKts: 0 };
const GUSTY = { windDirDeg: 360, windKts: 15, gustKts: 25 };

// law(gammaCmd, pitch, path, aoa) → pitch command. Returns the worst lagged sink and glideslope dots in the band
// (1,100 ft down to 500 ft: the gate and the final below it), and the lagged sink read crossing 1,000 ft.
function coupledFinal(wx, seed, law) {
  const flaps = landingFlaps(spec), kts = vrefFor(spec, flaps) + 5;
  const distM = 4 * 1852, altM = distM * TAN3; // the threshold (and the path's aim) 4 NM north, at z = −distM
  const b = makeBody(spec, { kts, altM, flaps });
  b.throttle = b.engineN = trimThrottle(spec, kts * KTS_TO_MPS, flaps, -3, true, airAt(altM));
  const air = turbulentAir(spec, wx, { seed });
  air(b, 0);
  b.vel.x += b.windVec.x; b.vel.z += b.windVec.z;
  // On the path: descending at the 3° path's rate over the ground.
  b.vel.y = -Math.hypot(b.vel.x, b.vel.z) * TAN3;
  const at = { trim: 0 };
  let prevIas = null, iasRate = 0, integral = 0, vsLag = null, worstVs = 0, worstDots = 0, gateVs = null;
  fly(b, spec, 200, (x, dt) => {
    air(x, dt);
    const a = attitude(x);
    const toGoM = x.pos.z + distM; // metres still to fly to the aim point (z = −distM; the body flies −z)
    const pathM = Math.max(0, toGoM) * TAN3;
    const hM = x.pos.y - pathM;
    if (Math.abs(hM) < 15) integral = Math.max(-100, Math.min(100, integral + hM * dt));
    const gsMps = Math.max(20, Math.hypot(x.vel.x, x.vel.z));
    const pathDeg = Math.atan2(x.vel.y, gsMps) * RAD_TO_DEG;
    x.elevInput = elevatorForPitch(law(glidepathGammaDeg(hM, integral), a.pitchDeg, pathDeg, x.aoaDeg ?? 0), a.pitchDeg, x.angVel.x);
    x.aileronInput = aileronForBank(0, a.bankRightDeg, -x.angVel.z);
    if (prevIas !== null) iasRate += ((x.iasKts - prevIas) / dt - iasRate) * Math.min(1, dt / 0.5);
    prevIas = x.iasKts;
    x.throttle = autothrottleCommand(trimThrottle(spec, kts * KTS_TO_MPS, flaps, pathDeg, true, airAt(x.pos.y)), at, x.iasKts, kts, iasRate, dt);
    vsLag = gateVsStep(vsLag, x.vel.y * M_TO_FT * 60, dt);
    const ft = x.pos.y * M_TO_FT;
    if (gateVs === null && ft <= 1000) gateVs = vsLag;
    if (ft < 1100 && ft > 500) {
      worstVs = Math.min(worstVs, vsLag);
      worstDots = Math.max(worstDots, Math.abs(ilsDots(hM, Math.max(1, toGoM), GS_DOT_DEG)));
    }
  }, (x) => x.pos.y < 500 * FT_TO_M);
  return { worstVs, worstDots, gateVs, endFt: b.pos.y * M_TO_FT };
}

const OVER_GROUND = (g, pitch, path) => pitchForPath(g, pitch, path);
const PATH_PLUS_AOA = (g, pitch, path, aoa) => Math.min(9.5, g + aoa); // the law before this card

const SEEDS = [1, 2, 3, 4, 5, 6];
const fmt = (rs) => rs.map((r) => `${r.gateVs.toFixed(0)}/${r.worstVs.toFixed(0)} fpm ${r.worstDots.toFixed(2)} dot`).join(', ');
const avg = (rs, k) => rs.reduce((t, r) => t + r[k], 0) / rs.length;

describe('737 autopilot on the ILS in turbulence: the 1,000 ft gate is met (0020, 0195)', () => {
  it.each([['the stabilized e2e\'s IFR day, 18005KT', IFR_DAY], ['a gusty headwind, 36015G25KT', GUSTY]])('%s: six seeds, ≤ 1,000 fpm at the gate, within 1 dot from 1,100 to 500 ft', (_, wx) => {
    const runs = SEEDS.map((seed) => coupledFinal(wx, seed, OVER_GROUND));
    const old = SEEDS.map((seed) => coupledFinal(wx, seed, PATH_PLUS_AOA));
    console.log(`[ap glideslope] ${wx.windDirDeg}/${wx.windKts}G${wx.gustKts} over the ground (gate/worst): ${fmt(runs)}`);
    console.log(`[ap glideslope] ${wx.windDirDeg}/${wx.windKts}G${wx.gustKts} path + α, before (gate/worst): ${fmt(old)}`);
    for (const r of runs) {
      expect(r.endFt).toBeLessThan(510);
      expect(r.gateVs).toBeGreaterThan(-1000);
      expect(r.worstDots).toBeLessThan(1);
    }
  }, 60000);

  it('on the gusty day the path over the ground holds the glideslope tighter than path + α did, and sinks less at worst', () => {
    const runs = SEEDS.map((seed) => coupledFinal(GUSTY, seed, OVER_GROUND));
    const old = SEEDS.map((seed) => coupledFinal(GUSTY, seed, PATH_PLUS_AOA));
    expect(avg(runs, 'worstDots')).toBeLessThan(0.7 * avg(old, 'worstDots'));
    expect(avg(runs, 'worstVs')).toBeGreaterThan(avg(old, 'worstVs') + 100);
    expect(Math.min(...old.map((r) => r.gateVs))).toBeLessThan(-1000); // the old law failed the gate on this day
  }, 60000);
});
