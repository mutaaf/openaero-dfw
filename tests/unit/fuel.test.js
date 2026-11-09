// The Cessna's fuel (0162, src/fuel.js) against its own source, the Cessna 172S POH (July 8/98,
// Rev. 4): Fig. 5-8 Cruise Performance and Fig. 5-7 Time, Fuel and Distance to Climb.
import { describe, it, expect } from 'vitest';
import { fuelFlowGph, climbFuelGal, startFuelGal, powerLapseAt, brakePowerPct, fuelStep, fuelText, fuelLevel, RESERVE_GAL, USABLE_GAL } from '../../src/fuel.js';
import { pistonPowerLapse } from '../../src/engine.js';
import { airAt } from '../../src/atmosphere.js';
import { engineRpm } from '../../src/engineSound.js';

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

  it('its inlined power lapse is engine.js pistonPowerLapse over atmosphere.js airAt (0 to 14,000 ft, ISA −20 to +20 °C, 29.42-30.42 inHg)', () => {
    for (const ft of [0, 2000, 4500, 8000, 10000, 14000]) {
      for (const dev of [-20, 0, 20]) {
        for (const inHg of [29.42, 29.92, 30.42]) {
          const air = airAt(ft * 0.3048, dev, inHg);
          expect(powerLapseAt(ft * 0.3048, dev, inHg)).toBeCloseTo(pistonPowerLapse(air.pressurePa, air.tempK), 4);
        }
      }
    }
  });

  it('brake power is torque × rpm, read as the physics reads the body: the spooled engineN (not the lever), the height above MSL (pos.y + mslOffsetM), the METAR air, the prop\'s rpm at this TAS', () => {
    const air = airAt(2000, 10, 30.2);
    const body = { engineN: 0.6, throttle: 1, pos: { y: 1800 }, mslOffsetM: 200, isaDevC: 10, altimInHg: 30.2, tasKts: 100, sigma: air.sigma };
    const rpm = engineRpm(0.6, 100 * 0.514444, air.sigma, true);
    expect(rpm).toBeGreaterThan(1500);
    expect(rpm).toBeLessThan(2700);
    expect(brakePowerPct(body, engineRpm)).toBeCloseTo(60 * pistonPowerLapse(air.pressurePa, air.tempK) * (rpm / 2700), 4);
  });

  it('burns at the engine\'s brake power; a dry tank stops the engine and says why; a failed engine burns nothing', () => {
    const body = { engineN: 1, pos: { y: 0 }, fuelGal: 20, tasKts: 126, sigma: 1 };
    const bhp = brakePowerPct(body, engineRpm);
    expect(bhp).toBeGreaterThan(95); // full throttle at the 126 KTAS maximum: ~2700 rpm, ~180 hp
    expect(bhp).toBeLessThanOrEqual(101);
    const gph = fuelStep(body, 3600, engineRpm);
    expect(gph).toBeCloseTo(fuelFlowGph(bhp), 6);
    expect(body.fuelGal).toBeCloseTo(20 - gph, 6);
    expect(body.engineFailed).toBeUndefined();
    fuelStep(body, 3600, engineRpm);
    expect(body.fuelGal).toBe(0);
    expect(body.engineFailed).toBe(true);
    expect(body.fuelOut).toBe(true);
    const dead = { engineN: 1, pos: { y: 0 }, fuelGal: 5, engineFailed: true, tasKts: 100, sigma: 1 };
    expect(fuelStep(dead, 3600, engineRpm)).toBe(0);
    expect(dead.fuelGal).toBe(5);
    expect(dead.fuelOut).toBeUndefined();
  });

  it('the readout: gallons and the hours they last at a Fig. 5-8 power (5h00, never a clock\'s 5:00); gallons alone outside 40-83%', () => {
    expect(fuelText(53, 75, 10.6)).toBe('FUEL 53.0 GAL 5h00');
    expect(fuelText(7, 60, 10)).toBe('FUEL 7.0 GAL 0h42');
    expect(fuelText(50.2, 5, 0.9)).toBe('FUEL 50.2 GAL'); // idle: the flow is our extrapolation
    expect(fuelText(50.2, 100, 13)).toBe('FUEL 50.2 GAL'); // full power at sea level, past the table
    expect(fuelText(12.3, 0, 0)).toBe('FUEL 12.3 GAL'); // a dead engine
    expect(fuelText(0, 0, 0)).toBe('FUEL EXHAUSTED');
  });

  it('amber under a fixed reserve, 45 minutes at 75% power (~7.6 gal), whatever the throttle does; red and EXHAUSTED when dry', () => {
    expect(RESERVE_GAL).toBeCloseTo(0.75 * fuelFlowGph(75), 6);
    expect(RESERVE_GAL).toBeGreaterThan(7.3);
    expect(RESERVE_GAL).toBeLessThan(7.9);
    expect(fuelLevel(53)).toBe('ok');
    expect(fuelLevel(7)).toBe('low');
    expect(fuelLevel(0)).toBe('out');
  });
});
