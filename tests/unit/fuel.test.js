// The Cessna's fuel (0162, src/fuel.js) against its own source, the Cessna 172S POH (July 8/98,
// Rev. 4): Fig. 5-8 Cruise Performance and Fig. 5-7 Time, Fuel and Distance to Climb.
import { describe, it, expect } from 'vitest';
import { fuelFlowGph, climbFuelGal, startFuelGal, powerLapseAt, brakePowerPct, fuelStep, fuelText, fuelLevel, USABLE_GAL } from '../../src/fuel.js';
import { pistonPowerLapse } from '../../src/engine.js';
import { airAt } from '../../src/atmosphere.js';

// Every row of Fig. 5-8 (2,550 lb, recommended lean mixture): [ft, rpm, then % BHP and GPH at
// 20 °C below standard, standard and 20 °C above] (KTAS left out).
const FIG_5_8 = [
  [2000, 2550, 83, 11.1, 77, 10.5, 72, 9.9], [2000, 2500, 78, 10.6, 73, 9.9, 68, 9.4], [2000, 2400, 69, 9.6, 64, 9.0, 60, 8.5],
  [2000, 2300, 61, 8.6, 57, 8.1, 53, 7.7], [2000, 2200, 53, 7.7, 50, 7.3, 47, 6.9], [2000, 2100, 47, 6.9, 44, 6.6, 42, 6.3],
  [4000, 2600, 83, 11.1, 77, 10.4, 72, 9.8], [4000, 2550, 79, 10.6, 73, 9.9, 68, 9.4], [4000, 2500, 74, 10.1, 69, 9.5, 64, 8.9],
  [4000, 2400, 65, 9.1, 61, 8.5, 57, 8.1], [4000, 2300, 58, 8.2, 54, 7.7, 51, 7.3], [4000, 2200, 51, 7.4, 48, 7.0, 45, 6.7],
  [4000, 2100, 45, 6.6, 42, 6.4, 40, 6.1],
  [6000, 2650, 83, 11.1, 77, 10.4, 72, 9.8], [6000, 2600, 78, 10.6, 73, 9.9, 68, 9.4], [6000, 2500, 70, 9.6, 65, 9.0, 60, 8.5],
  [6000, 2400, 62, 8.6, 57, 8.2, 54, 7.7], [6000, 2300, 54, 7.8, 51, 7.4, 48, 7.0], [6000, 2200, 48, 7.1, 45, 6.7, 43, 6.4],
  [8000, 2700, 83, 11.1, 77, 10.4, 71, 9.7], [8000, 2650, 78, 10.5, 72, 9.9, 67, 9.3], [8000, 2600, 74, 10.0, 68, 9.4, 64, 8.9],
  [8000, 2500, 65, 9.1, 61, 8.6, 57, 8.1], [8000, 2400, 58, 8.2, 54, 7.8, 51, 7.4], [8000, 2300, 52, 7.5, 48, 7.1, 46, 6.8],
  [8000, 2200, 46, 6.8, 43, 6.5, 41, 6.2],
  [10000, 2700, 78, 10.5, 72, 9.8, 67, 9.3], [10000, 2650, 73, 10.0, 68, 9.4, 63, 8.9], [10000, 2600, 69, 9.5, 64, 9.0, 60, 8.5],
  [10000, 2500, 62, 8.7, 57, 8.2, 54, 7.8], [10000, 2400, 55, 7.9, 51, 7.5, 49, 7.1], [10000, 2300, 49, 7.2, 46, 6.8, 44, 6.5],
  [12000, 2650, 69, 9.5, 64, 8.9, 60, 8.5], [12000, 2600, 65, 9.1, 61, 8.5, 57, 8.1], [12000, 2500, 58, 8.3, 54, 7.8, 51, 7.4],
  [12000, 2400, 52, 7.5, 49, 7.1, 46, 6.8], [12000, 2300, 47, 6.9, 44, 6.6, 41, 6.3],
];

describe('fuel.js vs the C172S POH (0162)', () => {
  it('the lean flow is one line of the power: every Fig. 5-8 row (all altitudes, all three temperatures) within 0.3 GPH', () => {
    let worst = 0;
    for (const [, , ...cols] of FIG_5_8) {
      for (let i = 0; i < 6; i += 2) worst = Math.max(worst, Math.abs(fuelFlowGph(cols[i]) - cols[i + 1]));
    }
    expect(worst).toBeLessThanOrEqual(0.3);
  });

  it('keeps rising with power and stays positive past the table (its end segments carried on)', () => {
    expect(fuelFlowGph(100)).toBeGreaterThan(fuelFlowGph(83));
    expect(fuelFlowGph(100)).toBeLessThan(14);
    expect(fuelFlowGph(0)).toBeGreaterThan(0);
    expect(fuelFlowGph(0)).toBeLessThan(fuelFlowGph(40));
  });

  it('the climb fuel is Fig. 5-7\'s and an airborne spawn has paid for its start, taxi, takeoff and climb', () => {
    expect(climbFuelGal(0)).toBe(0);
    expect(climbFuelGal(8000)).toBeCloseTo(3.0, 5);
    expect(climbFuelGal(8500)).toBeCloseTo(3.2, 5);
    expect(climbFuelGal(12000)).toBeCloseTo(5.0, 5);
    expect(startFuelGal(true, 600)).toBe(USABLE_GAL);
    expect(startFuelGal(false, 8000)).toBeCloseTo(53 - 1.4 - 3.0, 5);
  });

  it('its inlined power lapse is engine.js pistonPowerLapse over atmosphere.js airAt (0 to 14,000 ft, ISA −20 to +20 °C)', () => {
    for (const ft of [0, 2000, 4500, 8000, 10000, 14000]) {
      for (const dev of [-20, 0, 20]) {
        const air = airAt(ft * 0.3048, dev);
        expect(powerLapseAt(ft * 0.3048, dev)).toBeCloseTo(pistonPowerLapse(air.pressurePa, air.tempK), 4);
      }
    }
  });

  it('burns at the engine\'s brake power; a dry tank stops the engine and says why; a failed engine burns nothing', () => {
    const body = { engineN: 1, pos: { y: 0 }, fuelGal: 20 };
    const gph = fuelStep(body, 3600);
    expect(brakePowerPct({ engineN: 1, pos: { y: 0 } })).toBeCloseTo(100, 6);
    expect(gph).toBeCloseTo(fuelFlowGph(100), 6);
    expect(body.fuelGal).toBeCloseTo(20 - gph, 6);
    expect(body.engineFailed).toBeUndefined();
    fuelStep(body, 3600);
    expect(body.fuelGal).toBe(0);
    expect(body.engineFailed).toBe(true);
    expect(body.fuelOut).toBe(true);
    const dead = { engineN: 1, pos: { y: 0 }, fuelGal: 5, engineFailed: true };
    expect(fuelStep(dead, 3600)).toBe(0);
    expect(dead.fuelGal).toBe(5);
    expect(dead.fuelOut).toBeUndefined();
  });

  it('the readout: gallons and h:mm at this burn; amber under the 45-minute reserve, red and EXHAUSTED when dry', () => {
    expect(fuelText(53, 10.6)).toBe('FUEL 53.0 GAL 5:00');
    expect(fuelText(7, 10)).toBe('FUEL 7.0 GAL 0:42');
    expect(fuelText(12.3, 0)).toBe('FUEL 12.3 GAL');
    expect(fuelText(0, 0)).toBe('FUEL EXHAUSTED');
    expect(fuelLevel(53, 10)).toBe('ok');
    expect(fuelLevel(7, 10)).toBe('low');
    expect(fuelLevel(0, 0)).toBe('out');
  });
});
