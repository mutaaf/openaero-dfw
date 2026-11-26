// Flight test card: the Cessna 172S's published V-speeds vs the aircraft database the HUD,
// speed tape, coach and assists read (validator, step 2 "V-speeds").
// Source: Cessna Model 172S Skyhawk SP Pilot's Operating Handbook (Section 2 Limitations,
// "Airspeed Limitations" table, 2550 lb; Section 4 Normal Procedures, "Airspeeds for Normal
// Operation"; Section 3 Emergency Procedures, engine failure best glide 68 KIAS):
//   VNE 163 KIAS, VFE 110 KIAS (flaps to 10°) and 85 KIAS (10° to 30°), rotation 55 KIAS,
//   best rate of climb 74 KIAS (sea level), best glide 68 KIAS.
// Tolerance is exact: these are published placards, not performance estimates.
import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { stallSpeedKts } from '../../src/aero.js';

const c172 = AIRCRAFT_DATABASE.c172;

describe('Cessna 172S V-speeds vs the POH', () => {
  it('VNE 163 KIAS, rotation 55, best climb 74, best glide 68 (POH Sections 2, 3, 4)', () => {
    expect(c172.vneKts).toBe(163);
    expect(c172.vrKts).toBe(55);
    expect(c172.vyKts).toBe(74);
    expect(c172.vGlideKts).toBe(68);
  });

  it('flap-extended limit: 110 KIAS to 10°, 85 KIAS from 10° to 30° (POH Section 2)', () => {
    expect(c172.vfeKtsByFlapDeg).toEqual([[10, 110], [30, 85]]);
  });

  it('every V-speed is ordered like the placards: stall < Vr < glide < Vy < Vfe(10°) < VNE', () => {
    const vs0 = stallSpeedKts(c172, 30);
    expect(vs0).toBeLessThan(c172.vrKts);
    expect(c172.vrKts).toBeLessThan(c172.vGlideKts);
    expect(c172.vGlideKts).toBeLessThan(c172.vyKts);
    expect(c172.vyKts).toBeLessThan(110);
    expect(110).toBeLessThan(c172.vneKts);
  });

  it('the 85 KIAS full-flap limit sits well above the full-flap stall (POH Fig. 5-3: 40 KIAS)', () => {
    expect(85 / stallSpeedKts(c172, 30)).toBeGreaterThan(1.5);
  });
});
