import { describe, it, expect } from 'vitest';
import { airAt, isaPressure, isaDeviationC, iasFromTas } from '../../src/atmosphere.js';

const near = (got, want, tol) => expect(Math.abs(got - want) / want).toBeLessThanOrEqual(tol);

// ICAO Standard Atmosphere (Doc 7488 / U.S. Standard Atmosphere 1976) table values.
describe('ISA', () => {
  it.each([
    [0, 288.15, 101325, 1.2250],
    [5000, 255.65, 54048, 0.73643],
    [11000, 216.65, 22632, 0.36392],
    [20000, 216.65, 5474.9, 0.088035],
  ])('at %i m: T %f K, p %f Pa, rho %f', (h, t, p, rho) => {
    const a = airAt(h);
    near(a.tempK, t, 0.001);
    near(a.pressurePa, p, 0.005);
    near(a.rho, rho, 0.005);
  });

  it('speed of sound 340.3 m/s at sea level, 295.1 m/s in the stratosphere', () => {
    near(airAt(0).speedOfSoundMps, 340.29, 0.001);
    near(airAt(12000).speedOfSoundMps, 295.07, 0.001);
  });

  it('FL100 standard day: TAS ≈ IAS × 1.16', () => {
    const { sigma } = airAt(3048);
    near(1 / iasFromTas(1, sigma), 1.16, 0.02);
  });

  it('a hot day is thinner air: +15 °C at the field cuts density ~5%', () => {
    expect(airAt(185, 15).sigma).toBeLessThan(airAt(185, 0).sigma * 0.96);
  });

  it('a high altimeter setting means denser air at the same true altitude', () => {
    expect(airAt(185, 0, 30.40).rho).toBeGreaterThan(airAt(185, 0, 29.92).rho);
    near(isaPressure(0), 101325, 1e-9);
  });

  it('METAR 33 °C at DFW (185 m) is ISA +19 °C', () => {
    expect(isaDeviationC(33, 185)).toBeCloseTo(19.2, 1);
    expect(isaDeviationC(undefined, 185)).toBe(0);
  });
});
