// Wing-low crosswind landing lesson (ticket 0188, src/wingLow.js), flown headless on both flight models by harness.js
// crosswindLanding: the 0069 card's pilot (70 KIAS, flaps 10 as POH p. 4-34 asks, a 3° path from 500 ft to a 150 ft wide
// runway heading north, the wind straight across from the right). Its wing-low pilot is AFH ch. 9 (pp. 9-15 to 9-17):
// rudder holds the nose on the runway, the ailerons bank just enough to hold the centreline, through the flare to the
// touchdown. Its feet-flat pilot holds the centreline with the ailerons alone, so it arrives crabbed: the crab method
// with the crab never taken out. The lesson's own step and grader (wingLowStep, wingLowResult) watch each flight, as
// main.js does, on the game's landing grade (landing.js gradeLanding). The ticket's test plan: the wing-low pilot grades
// A or B with the upwind wheel first; the crabbed one is capped at B and told why.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Euler } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { M_TO_FT, RAD_TO_DEG } from '../../src/constants.js';
import { gradeLanding } from '../../src/landing.js';
import { createWingLow, lessonWx, wingLowStep, wingLowResult, CAP_B, SCENARIO_KTS } from '../../src/wingLow.js';
import { crosswindLanding, attitude, useFdm } from './harness.js';
import { nodeJsbsim } from './jsbsimNode.js';

const c172 = AIRCRAFT_DATABASE.c172;
// The harness's runway: threshold at the origin, heading north (true 0), 150 ft wide.
const END = { id: 'TEST_36', airport: 'TEST', hdgT: 0, widthM: 150 / M_TO_FT, lengthM: 3000, displacedM: 0 };

function flyLesson(xwKts, wingLow) {
  const wl = createWingLow(END);
  // The wind as the lesson reads it: from the right (east) for +xwKts, a live report that suits.
  lessonWx(wl, { live: true, windDirDeg: xwKts >= 0 ? 90 : 270, windKts: Math.abs(xwKts), gustKts: Math.abs(xwKts) });
  let grade = null;
  const r = crosswindLanding(c172, xwKts, {
    wingLow,
    onStep: (x, touched) => {
      const { pitchDeg, bankRightDeg } = attitude(x);
      const had = wl.td;
      wingLowStep(wl, { aglFt: (x.pos.y - x.groundY - c172.gearHeight) * M_TO_FT, onGround: !!x.onGround || touched, bankRightDeg, pitchDeg,
        noseHdgT: (-attitudeYawLeft(x) + 360) % 360, loads: x.wheelLoads ?? null }, 1 / 120);
      if (!had && wl.td && !grade) {
        grade = gradeLanding({ vsFpm: x.lastAirVsi ?? 0, crossM: x.pos.x, pastThresholdM: -x.pos.z, runwayLengthM: END.lengthM, runwayWidthM: END.widthM,
          pitchDeg, bankDeg: -bankRightDeg, iasKts: x.iasKts, vrefKts: c172.vrefKts });
      }
    },
  });
  return { r, wl, result: grade && wingLowResult(grade, wl), plain: grade };
}
// The nose's yaw (left +), as harness.js reads it (YXZ).
const _e = new Euler(0, 0, 0, 'YXZ');
const attitudeYawLeft = (x) => _e.setFromQuaternion(x.quat, 'YXZ').y * RAD_TO_DEG;

const log = (model, name, f) => console.log(`[c172 wing-low ${model}] ${name}: bank into the wind ${f.wl.td?.bankIntoDeg.toFixed(1)}°, nose ${f.wl.td?.noseOffDeg.toFixed(1)}°, `
  + `first ${f.wl.td?.first}; ${f.plain?.grade} ${f.plain?.score} → ${f.result?.grade} ${f.result?.score} ${f.result?.reason ?? ''}`);

for (const model of ['flightModel', 'jsbsim']) describe(`Cessna 172S wing-low crosswind lesson (0188, ${model})`, () => {
  beforeAll(async () => useFdm(model === 'jsbsim' ? await nodeJsbsim() : null));
  afterAll(() => useFdm(null));

  for (const xw of [SCENARIO_KTS, -SCENARIO_KTS]) {
    it(`wing-low in ${Math.abs(xw)} kt from the ${xw > 0 ? 'right' : 'left'}: the upwind wheel first, the wing ${xw > 0 ? 'right' : 'left'} 2-8° down, the nose straight, A or B, no cap`, () => {
      const f = flyLesson(xw, true);
      log(model, `wing-low ${xw} kt`, f);
      expect(f.wl.side).toBe(xw > 0 ? 'R' : 'L');
      expect(f.wl.td).not.toBe(null);
      expect(f.wl.td.first).toBe('upwind');
      expect(f.wl.td.bankIntoDeg).toBeGreaterThan(2);
      expect(f.wl.td.bankIntoDeg).toBeLessThan(8);
      expect(Math.abs(f.wl.td.noseOffDeg)).toBeLessThan(3);
      expect(['S', 'A', 'B']).toContain(f.result.grade); // the ticket: A/B
      expect(f.result.score).toBeGreaterThanOrEqual(f.plain.score); // the lesson's bank is not a fault on its card
      expect(f.result.reason ?? '').not.toMatch(/crabbed/);
    }, 30000);
  }

  it(`crabbed to the touchdown in ${SCENARIO_KTS} kt from the right: capped at B, and the card says the nose was off the runway`, () => {
    const f = flyLesson(SCENARIO_KTS, false);
    log(model, 'feet flat', f);
    expect(Math.abs(f.wl.td.noseOffDeg)).toBeGreaterThan(3);
    expect(f.result.score).toBeLessThanOrEqual(CAP_B);
    expect(f.result.reason).toMatch(/^Touched down crabbed, the nose \d+° off the runway/);
    expect(f.result.tip).toMatch(/^Left rudder to point the nose down the runway/);
  }, 30000);
});
