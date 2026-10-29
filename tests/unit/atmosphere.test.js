import { describe, it, expect } from 'vitest';
import { airAt, isaPressure, isaDeviationC, iasFromTas, densityAltitudeFt, thinAir } from '../../src/atmosphere.js';
import { FT_TO_M } from '../../src/constants.js';

const G0 = 9.80665, R = 287.05287;

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

// Density altitude (0111): FAA-H-8083-25 ch. 11; PA = elev + (29.92 − altimeter) × 1,000,
// DA = PA + 118.8 × (OAT − ISA at PA), ISA at PA = 15 − 1.98 °C per 1,000 ft.
describe('density altitude', () => {
  it('a standard day is the field elevation', () => {
    expect(densityAltitudeFt(0, 29.92, 15)).toBeCloseTo(0, 6);
    // KDFW 607 ft: ISA there is 15 − 1.98 × 0.607 = 13.80 °C.
    expect(Math.abs(densityAltitudeFt(607, 29.92, 15 - 1.98 * 0.607) - 607)).toBeLessThan(1);
  });

  it('a 38 °C, 29.80 inHg afternoon at KDFW (607 ft) is ~3,630 ft', () => {
    // By hand: PA = 607 + 0.12 × 1,000 = 727 ft; ISA at 727 ft = 15 − 1.44 = 13.56 °C;
    // DA = 727 + 118.8 × (38 − 13.56) = 727 + 2,903 = 3,630 ft.
    expect(Math.abs(densityAltitudeFt(607, 29.80, 38) - 3630)).toBeLessThanOrEqual(50);
    expect(thinAir(densityAltitudeFt(607, 29.80, 38), 607)).toBe(true);
  });

  it('a cold, high-pressure morning is below the field', () => {
    // −5 °C, 30.42 inHg: PA = 107 ft, ISA 14.79 °C, DA = 107 − 118.8 × 19.79 ≈ −2,244 ft.
    expect(Math.abs(densityAltitudeFt(607, 30.42, -5) - -2244)).toBeLessThanOrEqual(50);
    expect(thinAir(densityAltitudeFt(607, 30.42, -5), 607)).toBe(false);
  });

  it('a low altimeter alone raises it 1,000 ft per inch', () => {
    expect(densityAltitudeFt(607, 28.92)).toBeCloseTo(1607, 6);
  });

  it('agrees with the density the physics flies: ISA at the DA has airAt()\'s density', () => {
    // The rule of thumb is the pilot's number; the airplane feels airAt(). Over Texas
    // weather they agree within 300 ft: the 118.8 ft/°C rule reads high (pessimistic) on a hot
    // day, +173 ft at 38 °C and +260 ft at 43 °C, and up to ~100 ft low in the cold (the
    // line rounds to 100 ft for this reason).
    for (const [tempC, altim] of [[38, 29.80], [43, 29.70], [25, 30.02], [0, 30.40], [-10, 30.60]]) {
      // (KDAL, 476 ft, at 0 °C reads −96 ft; same bound.)
      const elevM = 607 * FT_TO_M;
      const { rho } = airAt(elevM, isaDeviationC(tempC, elevM), altim);
      // Invert ISA density for the altitude with this rho (troposphere).
      const expo = 1 / (G0 / (R * 0.0065) - 1);
      const hM = (288.15 / 0.0065) * (1 - Math.pow(rho / 1.225, expo));
      expect(Math.abs(densityAltitudeFt(607, altim, tempC) - hM / FT_TO_M)).toBeLessThan(300);
      if (tempC > 30) expect(densityAltitudeFt(607, altim, tempC)).toBeGreaterThan(hM / FT_TO_M);
    }
  });
});
