// Wake-turbulence lesson (ticket 0115): the traffic 737 (src/traffic.js, flown by the flight model and the
// autopilot's ILS, flare and autobrake laws) lands on 35C ahead of the Cessna and records its path and its
// touchdown point (src/wake.js). AIM 7-4-6: "Stay at or above the larger aircraft's final approach flight path -
// note its touchdown point - land beyond it." These cards fly the real jet and check what the drill grades against:
// a Cessna on the PAPI's 3° path or above it (read by the CG as main.js updatePapi does) is never "below" the jet's
// path; one on the lower edge of the PAPI's on-path band (2 white, 2 red down to 2.83°: 3° -10', AC 150/5340-30J
// Table 7-2) or lower is, as it really is ~30 ft under the jet at 2 NM.
import { describe, it, expect } from 'vitest';
import { createTrafficJet, stepTrafficJet, STEP_S } from '../../src/traffic.js';
import { createWake, wakeStep, jetPathY, wakeResult, CHECK_NM, BELOW_FT } from '../../src/wake.js';
import { runwayEnd, AIM_POINT_M } from '../../src/airports.js';
import { REF_ELEV_M } from '../../src/terrain.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { gradeLanding } from '../../src/landing.js';
import { stepFlightModel, trimThrottle, rollHoldScale } from '../../src/flightModel.js';
import { NM_TO_M, M_TO_FT, DEG_TO_RAD } from '../../src/constants.js';

const FM = { stepFlightModel, trimThrottle, rollHoldScale };
const END = runwayEnd('KDFW', '35C');
const C172 = AIRCRAFT_DATABASE.c172;
const TDZ_M = 3000 * 0.3048;

function flyJet(distNm, wx = null) {
  const w = createWake(END);
  const j = createTrafficJet(END, distNm, { mslOffsetM: REF_ELEV_M, wx }, FM);
  j.wake = w;
  for (let t = 0; j.phase !== 'done' && t < 400; t += STEP_S) stepTrafficJet(j, STEP_S);
  return { w, j };
}
// The Cessna's CG on a path `deg` steep to the PAPI's aim point, from 3 NM to the threshold at ~65 kt: the wake
// check's verdict and its deepest point under the jet's wheels.
function flyPath(w, deg) {
  const tan = Math.tan(deg * DEG_TO_RAD);
  for (let a = -3 * NM_TO_M; a < 0; a += 33 / 60) wakeStep(w, a, END.thrY + (AIM_POINT_M - a) * tan - C172.gearHeight, false, 1 / 60);
  return w;
}
const fresh = (w) => Object.assign(createWake(END), { path: w.path, tdAlongM: w.tdAlongM });

describe('the jet ahead on the same runway records its path and touchdown point (0115)', () => {
  for (const [name, wx] of [['calm', null], ['15 kt headwind', { windDirDeg: 350, windKts: 15, gustKts: null }], ['18 kt from the right', { windDirDeg: 80, windKts: 18, gustKts: null }]]) {
    it(`${name}: down the 3° path inside ${CHECK_NM} NM, the touchdown point is its first main-wheel contact, in the touchdown zone`, () => {
      const { w, j } = flyJet(3, wx);
      expect(j.touchdown).not.toBeNull();
      expect(w.tdAlongM).toBe(j.touchdown.alongM);
      expect(w.tdAlongM).toBeGreaterThan(AIM_POINT_M);
      expect(w.tdAlongM).toBeLessThan(TDZ_M);
      let worst = 0, n = 0;
      for (let a = -CHECK_NM * NM_TO_M; a < -300; a += 50) {
        const y = jetPathY(w, a);
        expect(Number.isNaN(y), `${a} m`).toBe(false);
        const pathWheels = END.thrY + (AIM_POINT_M - a) * Math.tan(3 * DEG_TO_RAD) - j.spec.gearHeight;
        worst = Math.max(worst, Math.abs(y - pathWheels) * M_TO_FT);
        n++;
      }
      console.log(`[wake jet] ${name}: touchdown ${w.tdAlongM.toFixed(0)} m (${(w.tdAlongM * M_TO_FT).toFixed(0)} ft) past the threshold; wheels within ${worst.toFixed(1)} ft of the 3° path over ${n} samples`);
      expect(worst).toBeLessThan(10);
    });
  }
});

describe('a Cessna on the PAPI\'s 3° path or above is at or above the jet\'s path; at the band\'s lower edge or under it is not (0115)', () => {
  const { w } = flyJet(3);
  // The on-path band: 3° ±10' (2 white, 2 red), the PAPI read by the CG; the Cessna's wheels sit 1.65 m under it, the
  // 737's 3.4 m: on the same path the Cessna's wheels are higher.
  for (const deg of [3, 3 + 10 / 60, 3.5]) {
    it(`CG on a ${deg.toFixed(2)}° path: never below`, () => {
      const r = flyPath(fresh(w), deg);
      console.log(`[wake path] ${deg.toFixed(2)}°: deepest ${r.worstFt.toFixed(1)} ft under the jet's wheels`);
      expect(r.below).toBe(false);
      expect(r.worstFt).toBeLessThan(BELOW_FT);
    });
  }
  // The band's lower edge (still 2 white, 2 red) and under it (1 white, 3 red: slightly low): under the jet's path.
  for (const deg of [3 - 10 / 60, 2.7, 2.5]) {
    it(`CG on a ${deg.toFixed(2)}° path: below, capped`, () => {
      const r = flyPath(fresh(w), deg);
      console.log(`[wake path] ${deg.toFixed(2)}°: deepest ${r.worstFt.toFixed(1)} ft under the jet's wheels`);
      expect(r.below).toBe(true);
      const g = gradeLanding({ vsFpm: -150, crossM: 0, pastThresholdM: w.tdAlongM + 150, runwayLengthM: END.lengthM - END.displacedM, runwayWidthM: END.widthM, pitchDeg: 4, bankDeg: 0, iasKts: 62, vrefKts: 61 });
      expect(wakeResult(g, r, w.tdAlongM + 150).grade).toBe('C');
    });
  }
});
