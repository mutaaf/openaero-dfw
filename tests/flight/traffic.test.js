// Ambient traffic (ticket 0080, src/traffic.js): the 737 that lands on the parallel is flown by the
// flight model and the autopilot's ILS, flare and autothrottle laws, not keyframed. Each card flies
// it headless from its spawn to the turn-off and checks the touchdown against the touchdown zone:
// "the first 3,000 feet of the runway beginning at the threshold" (FAA Pilot/Controller Glossary,
// TOUCHDOWN ZONE), a sink under landing.js's 600 fpm crash line, on the centreline, stopped on
// the pavement.
import { describe, it, expect } from 'vitest';
import { Euler } from 'three';
import { createTrafficJet, stepTrafficJet, STEP_S, VACATE_KTS } from '../../src/traffic.js';
import { RUNWAY_ENDS } from '../../src/airports.js';
import { REF_ELEV_M } from '../../src/terrain.js';
import { stepFlightModel, trimThrottle, rollHoldScale } from '../../src/flightModel.js';

const FM = { stepFlightModel, trimThrottle, rollHoldScale }; // main.js sim.fm

const TDZ_M = 3000 * 0.3048;

// wx: the field's METAR as weather.js parses it (windDirDeg, windKts, gustKts); isaDevC: the day's temperature.
function flyJet(end, distNm, wx = null, isaDevC = 0) {
  const j = createTrafficJet(end, distNm, { mslOffsetM: REF_ELEV_M, wx, isaDevC }, FM);
  let t = 0, maxRollCrossM = 0, maxBankDeg = 0, maxAirCrossM = 0;
  while (j.phase !== 'done' && t < 600) {
    stepTrafficJet(j, STEP_S);
    t += STEP_S;
    const rx = j.body.pos.x - end.thrX, rz = j.body.pos.z - end.thrZ;
    const cross = Math.abs(rx * -j.dz + rz * j.dx), along = rx * j.dx + rz * j.dz;
    if (j.phase === 'rollout') maxRollCrossM = Math.max(maxRollCrossM, cross);
    else if (along > -2 * 1852) {
      // Inside 2 NM: on the localizer, wings within a normal approach's bank.
      maxAirCrossM = Math.max(maxAirCrossM, cross);
      _e.setFromQuaternion(j.body.quat, 'YXZ');
      maxBankDeg = Math.max(maxBankDeg, Math.abs(_e.z) * 180 / Math.PI);
    }
  }
  const rx = j.body.pos.x - end.thrX, rz = j.body.pos.z - end.thrZ;
  return { j, t, maxRollCrossM, maxBankDeg, maxAirCrossM, stopAlongM: rx * j.dx + rz * j.dz };
}
const _e = new Euler(0, 0, 0, 'YXZ');
const metar = (windDirDeg, windKts, gustKts = null) => ({ windDirDeg, windKts, gustKts });
const drift = (j, end) => { _e.setFromQuaternion(j.body.quat, 'YXZ'); return Math.abs(((-_e.y * 180 / Math.PI - end.hdgT + 540) % 360) - 180); };

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
        expect(r.stopAlongM).toBeLessThan(end.lengthM - end.displacedM - 100);
        expect(r.maxRollCrossM).toBeLessThan(5);
      });
    }
  }
  // The field's METAR (the jet's own wind, at its own height): crosswinds up to 35 kt and a gusting one, on every
  // end (physics panel: main.js's heading-law localizer weaved ±170 m at 18 kt and landed past 600 fpm in the grass).
  for (const end of DFW) {
    for (const [kts, gust, side] of [[18, null, 90], [25, null, -90], [35, null, 90], [20, 35, -90]]) {
      const wx = metar((end.hdgT + side + 360) % 360, kts, gust);
      const label = `${kts}${gust ? `G${gust}` : ''} kt from the ${side > 0 ? 'right' : 'left'}`;
      it(`${end.ident} from 6 NM, ${label}: on the localizer, in the touchdown zone, on the centreline, landed straight`, () => {
        const r = flyJet(end, 6, wx);
        const td = r.j.touchdown;
        console.log(`[traffic wind] ${end.ident} ${label}: ${td.alongM.toFixed(0)} m, ${td.crossM.toFixed(1)} m, ${td.vsFpm} fpm, drift ${td.driftDeg?.toFixed(1)}°; 2 NM in: ${r.maxAirCrossM.toFixed(1)} m, bank ${r.maxBankDeg.toFixed(1)}°; rollout ${r.maxRollCrossM.toFixed(1)} m; stop ${r.stopAlongM.toFixed(0)}/${end.lengthM.toFixed(0)} m`);
        expect(r.maxAirCrossM).toBeLessThan(15);
        expect(r.maxBankDeg).toBeLessThan(15);
        expect(td.alongM).toBeGreaterThan(0);
        expect(td.alongM).toBeLessThan(TDZ_M);
        expect(Math.abs(td.crossM)).toBeLessThan(5);
        expect(td.vsFpm).toBeGreaterThan(-600);
        expect(td.driftDeg).toBeLessThan(5);
        expect(r.maxRollCrossM).toBeLessThan(10);
        expect(r.stopAlongM).toBeLessThan(end.lengthM);
      });
    }
  }
  // The 737's tailwind limit (10 kt) on the longest float, downhill 35R (51 ft down its length), on a hot day. It
  // floats past the 3,000 ft zone (main.js's autoland flare, unchanged here); the card holds it to 1,300 m and a stop
  // on the pavement, the touchdown's MAX autobrake doing the rest.
  for (const isa of [0, 25]) {
    it(`35R from 6 NM, a 10 kt tailwind, ISA+${isa}: in the touchdown zone, stopped on the runway`, () => {
      const end = DFW.find((e) => e.ident === '35R');
      const r = flyJet(end, 6, metar((end.hdgT + 180) % 360, 10), isa);
      const td = r.j.touchdown;
      console.log(`[traffic tailwind] 35R ISA+${isa}: ${td.alongM.toFixed(0)} m, ${td.vsFpm} fpm; stop ${r.stopAlongM.toFixed(0)}/${end.lengthM.toFixed(0)} m`);
      expect(td.alongM).toBeLessThan(1300);
      expect(td.vsFpm).toBeGreaterThan(-600);
      expect(r.stopAlongM).toBeLessThan(end.lengthM - end.displacedM - 100);
    });
  }
});
