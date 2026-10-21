// Systems cards for the Boeing 737-800 (systems.js): the hydraulics move the gear and flaps
// at their rates, the flap load relief protects the flaps 40 placard, the autobrake holds
// Boeing's decelerations (737 NG FCOM 14.10: 1/2/3/MAX = 4/5/7.2/14 ft/s²), and the
// reversers shorten the rollout. Flown headless like the other cards.
import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { trimThrottle } from '../../src/flightModel.js';
import { airAt } from '../../src/atmosphere.js';
import { trimAoaDeg, elevatorForPitch, aileronForBank } from '../../src/autopilot.js';
import { gearLocked } from '../../src/systems.js';
import { M_TO_FT, KTS_TO_MPS, DEG_TO_RAD } from '../../src/constants.js';
import { makeBody, fly, attitude, speedHoldPilot } from './harness.js';

const b738 = AIRCRAFT_DATABASE.b738;
const FLAPS_30 = 2, FLAPS_40 = 3;
const FT_S2 = 0.3048;

// A flaps 30 landing from 50 ft at Vref: idle and flare from 30 ft, then `rollout(x)` sets
// the brakes/autobrake/reverse once on the ground. Records the deceleration between 120
// and 60 kt groundspeed (the autobrake's steady part) and the distance from 50 ft.
function land({ autobrake = 0, gearDown = true, rollout = () => {} } = {}) {
  const kts = b738.vrefKts;
  const v = kts * KTS_TO_MPS;
  const b = makeBody(b738, { kts, altM: b738.gearHeight + 50 / M_TO_FT, flaps: FLAPS_30, gearDown, throttle: trimThrottle(b738, v, FLAPS_30, -3, true, airAt(15)) });
  b.vel.set(0, -v * Math.sin(3 * DEG_TO_RAD), -v * Math.cos(3 * DEG_TO_RAD));
  const pitch0 = trimAoaDeg(b738, v, FLAPS_30) - 3;
  b.quat.setFromAxisAngle({ x: 1, y: 0, z: 0 }, pitch0 * DEG_TO_RAD);
  b.autobrake = autobrake;
  let touchdown = null, t120 = null, t60 = null;
  fly(b, b738, 120, (x) => {
    const { pitchDeg, bankRightDeg } = attitude(x);
    const ft = (x.pos.y - b738.gearHeight) * M_TO_FT;
    let cmd = pitch0;
    if (touchdown) { cmd = -1; x.throttle = 0; rollout(x); }
    else if (ft < 30) { cmd = pitch0 + Math.min(3, (30 - ft) * 0.2); x.throttle = 0; }
    x.elevInput = elevatorForPitch(cmd, pitchDeg, x.angVel.x);
    x.aileronInput = aileronForBank(0, bankRightDeg, -x.angVel.z);
  }, (x) => {
    if (!touchdown && x.onGround) touchdown = { t: x.t };
    const gsKts = -x.vel.z / KTS_TO_MPS;
    if (touchdown && t120 === null && gsKts <= 120) t120 = x.t;
    if (touchdown && t60 === null && gsKts <= 60) t60 = x.t;
    return touchdown && -x.vel.z < 0.3;
  });
  const decelFtS2 = (60 * KTS_TO_MPS) / (t60 - t120) / FT_S2;
  return { body: b, ft: b.distM * M_TO_FT, decelFtS2 };
}

describe('Boeing 737-800 systems', () => {
  it('the gear takes ~10 s to come down and lock, and only then is it locked', () => {
    const b = makeBody(b738, { kts: 200, altM: 900, gearDown: false });
    const pilot = speedHoldPilot(() => 200);
    fly(b, b738, 0.1, pilot);
    b.gearDown = true;
    fly(b, b738, 9.5, pilot);
    expect(gearLocked(b)).toBe(false);
    fly(b, b738, 0.6, pilot);
    expect(gearLocked(b)).toBe(true);
  });

  it('flaps 30 → 40 take several seconds, and load relief holds 30 above the 162 kt placard', () => {
    const fast = makeBody(b738, { kts: 170, altM: 900, flaps: FLAPS_30 });
    fly(fast, b738, 0.1, speedHoldPilot(() => 170)); // the flaps start at 30
    fast.flapsIndex = FLAPS_40;
    fly(fast, b738, 15, speedHoldPilot(() => 170));
    expect(fast.flapDeg).toBeCloseTo(30, 5);

    const slow = makeBody(b738, { kts: 150, altM: 900, flaps: FLAPS_30 });
    fly(slow, b738, 0.1, speedHoldPilot(() => 150));
    slow.flapsIndex = FLAPS_40;
    fly(slow, b738, 3, speedHoldPilot(() => 150));
    expect(slow.flapDeg).toBeGreaterThan(33);
    expect(slow.flapDeg).toBeLessThan(40);
    fly(slow, b738, 5, speedHoldPilot(() => 150));
    expect(slow.flapDeg).toBe(40);
  });

  for (const [setting, ftS2] of [[1, 4], [2, 5], [3, 7.2]]) {
    it(`autobrake ${setting} holds ${ftS2} ft/s² on the rollout (Boeing 737 NG FCOM, ±12%)`, () => {
      const { decelFtS2 } = land({ autobrake: setting });
      expect(Math.abs(decelFtS2 - ftS2) / ftS2).toBeLessThanOrEqual(0.12);
    });
  }

  // Boeing: maximum manual braking can stop harder than autobrake MAX, which holds 14 ft/s².
  it('autobrake MAX holds about 14 ft/s², and full pedals stop no longer than it (±12%)', () => {
    const max = land({ autobrake: 4 });
    expect(Math.abs(max.decelFtS2 - 14) / 14).toBeLessThanOrEqual(0.12);
    const pedals = land({ rollout: (x) => { x.brakesOn = true; } });
    expect(pedals.ft).toBeLessThanOrEqual(max.ft);
  });

  it('full reverse with autobrake 2 holds 5 ft/s² with less brake, and on the pedals stops shorter', () => {
    const plain = land({ rollout: (x) => { x.brakesOn = true; } });
    const reverse = land({ rollout: (x) => { x.brakesOn = true; x.reverseCmd = true; if (x.reverserPos >= 1 && -x.vel.z > 60 * KTS_TO_MPS) x.throttle = 0.8; } });
    expect(reverse.ft).toBeLessThan(plain.ft - 100);
    const ab2 = land({ autobrake: 2, rollout: (x) => { x.reverseCmd = true; if (x.reverserPos >= 1 && -x.vel.z > 60 * KTS_TO_MPS) x.throttle = 0.8; } });
    expect(Math.abs(ab2.decelFtS2 - 5) / 5).toBeLessThanOrEqual(0.12);
  });

  it('a gear-up landing sits on the belly and scrapes to a stop', () => {
    const { body } = land({ gearDown: false });
    expect(gearLocked(body)).toBe(false);
    expect(body.pos.y).toBeLessThan(b738.gearHeight * 0.5);
  });
});
