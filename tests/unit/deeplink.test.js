import { describe, it, expect } from 'vitest';
import { missionFromLink, terrainOnly, stripDeepLink } from '../../src/deeplink.js';
import { MISSIONS } from '../../src/missions.js';
import { AIRPORT_NAMES } from '../../src/airports.js';

describe('deep links', () => {
  it('?mission picks that mission; ?airport flies from that airport', () => {
    expect(missionFromLink('?mission=kdal_13l_final')).toBe('kdal_13l_final');
    expect(missionFromLink('?airport=KDFW')).toBe('kdfw_takeoff');
    expect(missionFromLink('?airport=kdal')).toBe('kdal_31r_final');
    expect(missionFromLink('?airport=KDFW&mission=downtown_skyline')).toBe('downtown_skyline');
  });
  it('every airport resolves to one of its own missions', () => {
    for (const icao of Object.keys(AIRPORT_NAMES)) {
      const k = missionFromLink(`?airport=${icao}`);
      expect(MISSIONS.find((m) => m.key === k).airport, icao).toBe(icao);
    }
  });
  it('ignores junk', () => {
    expect(missionFromLink('?mission=nope')).toBeNull();
    expect(missionFromLink('?airport=KJFK')).toBeNull();
    expect(missionFromLink('?airport=__proto__')).toBeNull();
    expect(missionFromLink('')).toBeNull();
  });
  it('?view=terrain opts out of photoreal; strip keeps view and debug', () => {
    expect(terrainOnly('?view=terrain')).toBe(true);
    expect(terrainOnly('?view=photoreal')).toBe(false);
    expect(stripDeepLink('?airport=KDAL&view=terrain&debug')).toBe('?view=terrain&debug');
  });
});
