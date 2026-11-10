// Ambient traffic (ticket 0080, src/traffic.js): the 737 that lands on the parallel is flown by the
// flight model and the autopilot's ILS, flare and autothrottle laws, not keyframed. Each card flies
// it headless from its spawn to the turn-off and checks the touchdown against the touchdown zone:
// "the first 3,000 feet of the runway beginning at the threshold" (FAA Pilot/Controller Glossary,
// TOUCHDOWN ZONE), a sink under landing.js's 600 fpm crash line, on the centreline, stopped on
// the pavement.
import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { createTrafficJet, stepTrafficJet, STEP_S, VACATE_KTS } from '../../src/traffic.js';
import { RUNWAY_ENDS } from '../../src/airports.js';
import { REF_ELEV_M } from '../../src/terrain.js';
import { stepFlightModel, trimThrottle, rollHoldScale } from '../../src/flightModel.js';

const FM = { stepFlightModel, trimThrottle, rollHoldScale }; // main.js sim.fm

const TDZ_M = 3000 * 0.3048;

function flyJet(end, distNm, windVec = null) {
  const j = createTrafficJet(end, distNm, { mslOffsetM: REF_ELEV_M, windVec }, FM);
  let t = 0, maxRollCrossM = 0, maxBankDeg = 0;
  while (j.phase !== 'done' && t < 600) {
    stepTrafficJet(j, STEP_S);
    t += STEP_S;
    if (j.phase === 'rollout') {
      const rx = j.body.pos.x - end.thrX, rz = j.body.pos.z - end.thrZ;
      maxRollCrossM = Math.max(maxRollCrossM, Math.abs(rx * -j.dz + rz * j.dx));
    }
  }
  const rx = j.body.pos.x - end.thrX, rz = j.body.pos.z - end.thrZ;
  return { j, t, maxRollCrossM, maxBankDeg, stopAlongM: rx * j.dx + rz * j.dz };
}

const DFW = RUNWAY_ENDS.filter((e) => e.airport === 'KDFW');

describe('the traffic 737 lands on its runway (0080)', () => {
  for (const end of DFW) {
    for (const nm of [2, 8]) {
      it(`${end.ident} from ${nm} NM, calm: in the touchdown zone, on the centreline, stopped on the runway`, () => {
        const r = flyJet(end, nm);
        const td = r.j.touchdown;
        console.log(`[traffic] ${end.ident} ${nm} NM: touchdown ${td.alongM.toFixed(0)} m past the threshold, ${td.crossM.toFixed(1)} m, ${td.vsFpm} fpm, ${td.iasKts.toFixed(0)} KIAS; turned off ${r.stopAlongM.toFixed(0)} of ${end.lengthM.toFixed(0)} m after ${r.t.toFixed(0)} s`);
        expect(r.j.phase).toBe('done');
        expect(td.alongM).toBeGreaterThan(0);
        expect(td.alongM).toBeLessThan(TDZ_M);
        expect(Math.abs(td.crossM)).toBeLessThan(3);
        expect(td.vsFpm).toBeGreaterThan(-600);
        expect(r.j.body.gsKts).toBeLessThanOrEqual(VACATE_KTS);
        expect(r.stopAlongM).toBeLessThan(end.lengthM - end.displacedM);
        expect(r.maxRollCrossM).toBeLessThan(5);
      });
    }
  }
  // The player's wind is the jet's (main.js sim.windVec): 12 kt across 35R and a 10 kt tailwind component on 17C.
  for (const [ident, wind, label] of [['35R', new Vector3(6, 0, 0), '12 kt from the west'], ['17C', new Vector3(0, 0, 5), '10 kt tailwind'], ['31L', new Vector3(-4, 0, 4), '11 kt quartering']]) {
    it(`${ident} from 6 NM, ${label}: in the touchdown zone, on the centreline`, () => {
      const end = DFW.find((e) => e.ident === ident);
      const r = flyJet(end, 6, wind);
      const td = r.j.touchdown;
      console.log(`[traffic wind] ${ident} ${label}: ${td.alongM.toFixed(0)} m, ${td.crossM.toFixed(1)} m, ${td.vsFpm} fpm; rollout max ${r.maxRollCrossM.toFixed(1)} m; stop ${r.stopAlongM.toFixed(0)}/${end.lengthM.toFixed(0)} m`);
      expect(td.alongM).toBeGreaterThan(0);
      expect(td.alongM).toBeLessThan(TDZ_M);
      expect(Math.abs(td.crossM)).toBeLessThan(5);
      expect(td.vsFpm).toBeGreaterThan(-600);
      expect(r.maxRollCrossM).toBeLessThan(8);
      expect(r.stopAlongM).toBeLessThan(end.lengthM);
    });
  }
});
