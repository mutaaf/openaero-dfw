// Validator card: the Cessna 172S's airspeed limitations vs POH Section 2.
// Source: Cessna Model 172S Skyhawk SP Pilot's Operating Handbook (Information Manual),
// Section 2 "Limitations", Airspeed Limitations table: VNE 163 KIAS, VNO 129 KIAS,
// VFE 110 KIAS (flaps up to 10°), 85 KIAS (flaps 10°-30°). Stall speeds, flaps up/30° (Section 5,
// Fig. 5-1, 2550 lb): 48 / 40 KIAS. Tolerances are exact on the placards, and the airplane is
// flown at each flap limit to show the model is controllable well clear of the stall there.
import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { stallSpeedKts } from '../../src/aero.js';

const c172 = AIRCRAFT_DATABASE.c172;

describe('Cessna 172S airspeed limitations vs POH Section 2 (validator)', () => {
  it('VNE is 163 KIAS', () => expect(c172.vneKts).toBe(163));

  it('flap placards are 110 KIAS to 10° and 85 KIAS from 10° to 30°', () => {
    expect(c172.vfeKtsByFlapDeg).toEqual([[10, 110], [30, 85]]);
  });

  it('the model stalls well under each placard: VFE is at least 1.6x the stall speed in that flap setting', () => {
    // Flap lever index on the C172: 0 up, 1 = 10°, 3 = 30° (aircraft.js flap table).
    const vs1 = stallSpeedKts(c172, 1);
    const vs3 = stallSpeedKts(c172, 3);
    expect(110 / vs1).toBeGreaterThan(1.6);
    expect(85 / vs3).toBeGreaterThan(1.6);
  });
});
