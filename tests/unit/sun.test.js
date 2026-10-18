import { describe, it, expect } from 'vitest';
import { sunPosition, sunDirection, sunPreset, skyForSun, TIME_MODES } from '../../src/sun.js';

// KDFW (32.8998 N, -97.0403 W).
const LAT = 32.8998;
const LON = -97.0403;

// Elevation at minute resolution over a UTC window, to find the day's peak.
function peak(fromUtc, hours) {
  let best = { elevationDeg: -90 };
  for (let m = 0; m <= hours * 60; m++) {
    const s = sunPosition(new Date(fromUtc + m * 60000), LAT, LON);
    if (s.elevationDeg > best.elevationDeg) best = { ...s, at: new Date(fromUtc + m * 60000) };
  }
  return best;
}

describe('sunPosition (NOAA)', () => {
  it('solar noon on the June solstice in Dallas is ~80.6° high, due south', () => {
    // Independent: 90 − 32.90 + 23.44 (solstice declination) = 80.54°; refraction adds ~0.003°.
    const p = peak(Date.UTC(2026, 5, 21, 17), 3);
    expect(p.elevationDeg).toBeGreaterThan(80.1);
    expect(p.elevationDeg).toBeLessThan(81.1);
    expect(p.azimuthDeg).toBeGreaterThan(170);
    expect(p.azimuthDeg).toBeLessThan(190);
    // Solar noon at 97.04° W is ~18:26 UTC (12:00 + 6h28m of longitude − ~2 min equation of time).
    expect(p.at.getUTCHours()).toBe(18);
    expect(p.at.getUTCMinutes()).toBeGreaterThan(18);
    expect(p.at.getUTCMinutes()).toBeLessThan(34);
  });

  it('winter solstice noon is ~33.7° high', () => {
    // 90 − 32.90 − 23.44 = 33.66°, plus ~0.02° refraction at that height.
    const p = peak(Date.UTC(2026, 11, 21, 17), 3);
    expect(p.elevationDeg).toBeGreaterThan(33.2);
    expect(p.elevationDeg).toBeLessThan(34.2);
  });

  it('is below the horizon at local midnight (00:00 CDT = 05:00 UTC)', () => {
    for (const month of [0, 3, 5, 8, 11]) {
      expect(sunPosition(new Date(Date.UTC(2026, month, 15, 5)), LAT, LON).elevationDeg).toBeLessThan(-20);
    }
  });

  it('rises in the east-north-east on the June solstice, ~06:20 CDT', () => {
    // Published sunrise for Dallas on 21 June: 6:20 am CDT (11:20 UTC), azimuth ~62°.
    const s = sunPosition(new Date(Date.UTC(2026, 5, 21, 11, 20)), LAT, LON);
    expect(s.elevationDeg).toBeGreaterThan(-1.5);
    expect(s.elevationDeg).toBeLessThan(0.5);
    expect(s.azimuthDeg).toBeGreaterThan(58);
    expect(s.azimuthDeg).toBeLessThan(66);
  });

  it('sets in the west in the evening', () => {
    // 21 June, 20:30 CDT (01:30 UTC next day): sun about to set (8:38 pm), north of west.
    const s = sunPosition(new Date(Date.UTC(2026, 5, 22, 1, 30)), LAT, LON);
    expect(s.azimuthDeg).toBeGreaterThan(285);
    expect(s.azimuthDeg).toBeLessThan(305);
  });
});

describe('sunDirection (sim frame: +X east, +Y up, −Z north)', () => {
  it('points up for an overhead sun and along the compass otherwise', () => {
    const up = sunDirection({ elevationDeg: 90, azimuthDeg: 0 });
    expect(up.y).toBeCloseTo(1, 6);
    const east = sunDirection({ elevationDeg: 0, azimuthDeg: 90 });
    expect(east.x).toBeCloseTo(1, 6);
    const south = sunDirection({ elevationDeg: 0, azimuthDeg: 180 });
    expect(south.z).toBeCloseTo(1, 6); // +Z is south
    const north = sunDirection({ elevationDeg: 0, azimuthDeg: 0 });
    expect(north.z).toBeCloseTo(-1, 6);
  });
});

describe('sunPreset', () => {
  const now = new Date(Date.UTC(2026, 9, 18, 15)); // 18 Oct 2026, 10:00 CDT

  it('lists the modes in button order, Now first', () => {
    expect(TIME_MODES).toEqual(['Now', 'Dawn', 'Noon', 'Dusk', 'Night']);
  });

  it('Now is the real sun', () => {
    expect(sunPreset('Now', now, LAT, LON)).toEqual(sunPosition(now, LAT, LON));
  });

  it('Noon is the day\'s highest sun, Night is below the horizon', () => {
    const noon = sunPreset('Noon', now, LAT, LON);
    expect(noon.elevationDeg).toBeGreaterThan(sunPosition(now, LAT, LON).elevationDeg);
    expect(noon.elevationDeg).toBeGreaterThan(45); // mid-October ≈ 90 − 32.9 − 9.6 = 47.5°
    expect(noon.azimuthDeg).toBeGreaterThan(170);
    expect(noon.azimuthDeg).toBeLessThan(190);
    expect(sunPreset('Night', now, LAT, LON).elevationDeg).toBeLessThan(-30);
  });

  it('Dawn is a low sun in the east, Dusk a low sun in the west', () => {
    const dawn = sunPreset('Dawn', now, LAT, LON);
    const dusk = sunPreset('Dusk', now, LAT, LON);
    for (const s of [dawn, dusk]) {
      expect(s.elevationDeg).toBeGreaterThan(0);
      expect(s.elevationDeg).toBeLessThan(5);
    }
    expect(dawn.azimuthDeg).toBeGreaterThan(60);
    expect(dawn.azimuthDeg).toBeLessThan(130);
    expect(dusk.azimuthDeg).toBeGreaterThan(230);
    expect(dusk.azimuthDeg).toBeLessThan(300);
  });
});

describe('skyForSun', () => {
  const lum = (hex) => 0.2126 * ((hex >> 16) & 255) + 0.7152 * ((hex >> 8) & 255) + 0.0722 * (hex & 255);

  it('night is dark with no direct sun, day is bright', () => {
    const night = skyForSun(-30);
    const day = skyForSun(60);
    expect(night.sunIntensity).toBe(0);
    expect(lum(night.sky)).toBeLessThan(30);
    expect(lum(day.sky)).toBeGreaterThan(120);
    expect(day.sunIntensity).toBeGreaterThan(night.sunIntensity);
    expect(day.ambientIntensity).toBeGreaterThan(night.ambientIntensity);
  });

  it('brightens monotonically as the sun climbs', () => {
    let prev = -1;
    for (let e = -30; e <= 60; e += 2) {
      const s = skyForSun(e);
      const light = s.ambientIntensity + s.sunIntensity;
      expect(light).toBeGreaterThanOrEqual(prev);
      prev = light;
    }
  });

  it('a sun at the horizon paints a warm sky', () => {
    const s = skyForSun(1);
    expect((s.sky >> 16) & 255).toBeGreaterThan(s.sky & 255); // more red than blue
  });
});
