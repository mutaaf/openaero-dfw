// Ticket 0194: the Cessna's propeller torque rolls it left (flightModel.js propTorqueAileron). The size
// is cited, not fitted: the POH's 180 hp at 2,700 rpm is 475 N·m (POH Section 1, Lycoming IO-360-L2A),
// and our JSBSim C172's prop (public/jsbsim/engine/prop76.xml, CP/CT 0.745 at J 0-0.5) puts 474 N·m on
// its 2,070 N static thrust. Both models fly wings level at full power, speed held by pitch, the ball
// centred (a PI rudder on sideslip), and the aileron it takes to hold the wings is read over the last
// 10 s: the torque's share of full aileron. Clockwise prop seen from the seat: right aileron (+).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { propTorqueNm } from '../../src/flightModel.js';
import { makeBody, fly, speedHoldPilot, attitude, useFdm } from './harness.js';
import { nodeJsbsim } from './jsbsimNode.js';

const c172 = AIRCRAFT_DATABASE.c172;
const ALT_M = 4500 * 0.3048;

function wingsLevelAileron(kts, throttle) {
  const b = makeBody(c172, { kts, altM: ALT_M, flaps: 0, throttle });
  const hold = speedHoldPilot(() => kts);
  let integ = 0, sumAil = 0, sumBeta = 0, n = 0;
  const pilot = (x, dt) => {
    x.throttle = throttle;
    hold(x, dt);
    integ += (x.betaDeg ?? 0) * 0.1 * dt;
    x.rudderInput = Math.max(-1, Math.min(1, integ + (x.betaDeg ?? 0) * 0.05));
  };
  fly(b, c172, 40, pilot);
  fly(b, c172, 10, (x, dt) => { pilot(x, dt); sumAil += x.aileronInput; sumBeta += Math.abs(x.betaDeg ?? 0); n++; });
  return { ail: sumAil / n, beta: sumBeta / n };
}

// Hands off the ailerons and pedals (the speed still held with the elevator) at full power from wings
// level: the bank 10 s on (+ = right).
function handsOffBank(kts) {
  const b = Object.assign(makeBody(c172, { kts, altM: 300, throttle: 1 }), { apMaster: false });
  const hold = speedHoldPilot(() => kts);
  fly(b, c172, 10, (x, dt) => { x.throttle = 1; hold(x, dt); x.aileronInput = 0; x.rudderInput = 0; });
  return attitude(b).bankRightDeg;
}

describe('Cessna 172S propeller torque (ticket 0194)', () => {
  it('the torque arm puts the POH\'s 475 N·m (180 hp at 2,700 rpm) on the static thrust', () => {
    const pohNm = (180 * 745.7) / (2700 * 2 * Math.PI / 60);
    expect(propTorqueNm(c172, 2070)).toBeGreaterThan(pohNm * 0.97);
    expect(propTorqueNm(c172, 2070)).toBeLessThan(pohNm * 1.03);
    expect(propTorqueNm(c172, -300)).toBe(0); // a windmilling prop drives the engine: no reaction
    expect(propTorqueNm(AIRCRAFT_DATABASE.b738, 100000)).toBe(0); // no propeller
  });

  const runs = {};
  for (const model of ['jsbsim', 'flightModel']) describe(model, () => {
    beforeAll(async () => {
      useFdm(model === 'jsbsim' ? await nodeJsbsim() : null);
      runs[model] = { 55: wingsLevelAileron(55, 1), 74: wingsLevelAileron(74, 1), 90: wingsLevelAileron(90, 1), 110: wingsLevelAileron(110, 1), idle: wingsLevelAileron(65, 0), handsOff: handsOffBank(74) };
      const r = runs[model];
      console.log(`[c172 ${model}] wings-level aileron, full power: 55 KIAS ${r[55].ail.toFixed(3)}, 110 KIAS ${r[110].ail.toFixed(3)}, 74 KIAS ${r[74].ail.toFixed(3)} (|β| ${r[74].beta.toFixed(2)}°), 90 KIAS ${r[90].ail.toFixed(3)}; idle 65 KIAS ${r.idle.ail.toFixed(3)}; `
        + `hands off at Vy, full power: bank ${r.handsOff.toFixed(1)}° in 10 s`);
    }, 120000);
    afterAll(() => useFdm(null));

    it('full power takes right aileron to hold the wings level, less the faster it flies; idle takes none', () => {
      const r = runs[model];
      expect(r[74].ail).toBeGreaterThan(0.03);
      expect(r[90].ail).toBeGreaterThan(0.015);
      expect(r[90].ail).toBeLessThan(r[74].ail);
      expect(Math.abs(r.idle.ail)).toBeLessThan(0.01);
      // The ball centred: flightModel.js holds β 0; JSBSim's PI rudder hunts about ±1-2° around 0 (mean ~0).
      expect(r[74].beta).toBeLessThan(model === 'jsbsim' ? 2 : 0.5);
    });
  });

  // Hands off, JSBSim's C172 spirals away to the left (-22° in 10 s; its spiral mode diverges); flightModel.js
  // rolls the same way and settles into a shallow left bank (~-9° in 10 s). Same direction; ours the gentler.
  it('hands off at Vy and full power the Cessna rolls left on both models, flightModel.js no faster than JSBSim', () => {
    expect(runs.flightModel.handsOff).toBeLessThan(-3);
    expect(runs.jsbsim.handsOff).toBeLessThan(-3);
    expect(runs.flightModel.handsOff).toBeGreaterThanOrEqual(runs.jsbsim.handsOff);
  });

  // Agreement is close at the climb speeds and looser at the ends: the arm is fixed at CP/CT 0.745 (J 0-0.5) and
  // the aileron needed goes as 1/q, which runs steeper at lift-off speed than JSBSim's (prop rpm falls) and
  // leaves out CP/CT's rise past J 0.6 at cruise. Measured: 55 KIAS 0.090 vs 0.070 (+29%), 110 KIAS 0.018 vs 0.021.
  it('at lift-off speed (55 KIAS) and cruise (110 KIAS) within 35% of JSBSim\'s aileron', () => {
    for (const k of [55, 110]) expect(Math.abs(runs.flightModel[k].ail / runs.jsbsim[k].ail - 1)).toBeLessThan(0.35);
  });

  it('flightModel.js takes JSBSim\'s aileron within 0.01 of full throw at 74 and 90 KIAS', () => {
    for (const k of [74, 90]) expect(Math.abs(runs.flightModel[k].ail - runs.jsbsim[k].ail)).toBeLessThan(0.01);
  });
});
