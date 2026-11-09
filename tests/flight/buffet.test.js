// The stall buffet (ticket 0079) is a warning: still where the airplane is flown normally, and there
// before the wing breaks. Cards fly the model and read src/buffet.js buffetIntensity at the AoA it
// flies, sub-step by sub-step: the coached takeoff (as tests/flight/takeoffCoach.test.js flies it:
// rotate at Vr to ROTATE_PITCH_DEG, held 10 s past lift-off), the Cessna's calm landing (the
// harness's crosswindLanding: 70 KIAS, flaps 10, a flare from 30 ft at idle), a trimmed cruise and a
// final at Vref + 5, Kid's and Learner's AoA caps; and the stall itself.
import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { elevatorForPitch, trimAoaDeg } from '../../src/autopilot.js';
import { takeoffTrimAoaDeg } from '../../src/trim.js';
import { stallAoaDeg, stallSpeedKts, stallWarningKts, vrefFor } from '../../src/aero.js';
import { KTS_TO_MPS, M_TO_FT } from '../../src/constants.js';
import { ASSIST_CONFIG } from '../../src/assists.js';
import { ROTATE_PITCH_DEG } from '../../src/takeoffCoach.js';
import { buffetIntensity, wingBuffet } from '../../src/buffet.js';
import { makeBody, fly, attitude, crosswindLanding, speedHoldPilot } from './harness.js';

describe('stall buffet: still on a coached takeoff (0079)', () => {
  for (const key of Object.keys(ROTATE_PITCH_DEG)) {
    it(`${key}: rotate at Vr to ${ROTATE_PITCH_DEG[key]}°, 10 s of climb: no buffet in the air`, () => {
      const spec = AIRCRAFT_DATABASE[key];
      const b = Object.assign(makeBody(spec, { flaps: 1, throttle: 1 }), { autoTrim: false, apMaster: false, trimAlphaDeg: takeoffTrimAoaDeg(spec, 1) });
      let vr = false, liftT = null, peak = 0, peakAoa = -90;
      fly(b, spec, 120, (x, dt) => {
        if (x.iasKts >= spec.vrKts) vr = true;
        const want = vr ? elevatorForPitch(ROTATE_PITCH_DEG[key], attitude(x).pitchDeg, x.angVel.x) : 0;
        x.elevInput += (want - x.elevInput) * Math.min(1, dt * 10);
        if (!x.onGround && Number.isFinite(x.aoaDeg)) {
          peak = Math.max(peak, wingBuffet(spec, x));
          peakAoa = Math.max(peakAoa, x.aoaDeg);
        }
      }, (x) => {
        if (liftT === null && x.t > 1 && !x.onGround) liftT = x.t;
        return liftT !== null && x.t - liftT >= 10;
      });
      console.log(`[${key} buffet] takeoff: peak α ${peakAoa.toFixed(1)}° in the air (stall ${stallAoaDeg(spec, 1)}°), buffet ${peak.toFixed(3)}`);
      expect(liftT).not.toBeNull();
      expect(peak).toBe(0);
    });
  }
});

// The Cessna's flare to a full-stall touchdown (the FAA's normal landing: the wheels meet the runway
// at about the stall speed, the horn sounding): the buffet starts only ~2-3 kt above the stall
// (85% of the stall angle, BUFFET_ONSET), so the flare is still down to the hold-off and only its
// last feet, already under the horn's speed, shake (intensity ~0.66 at the hold-off, touching down at
// 51 KIAS against a Vs of 50), short of the stall's full buffet, as the real airplane does. The
// ticket's "silent in the flare" holds for any flare that touches down faster than ~2-3 kt above the
// stall (and always for Kid and Learner, whose AoA caps stop short of it, below).
describe('stall buffet: the Cessna\'s landing flare (0079)', () => {
  it('c172 calm landing, flare from 30 ft at idle: still above 5 ft; short of full (≤ 0.75) in the hold-off, under the horn\'s speed', () => {
    const spec = AIRCRAFT_DATABASE.c172;
    let high = 0, low = 0, peakAoa = -90, firstKts = null;
    const r = crosswindLanding(spec, 0, { onStep: (x, landed) => {
      if (landed || x.onGround || !Number.isFinite(x.aoaDeg)) return;
      const k = wingBuffet(spec, x);
      if ((x.pos.y - x.groundY - spec.gearHeight) * M_TO_FT > 5) high = Math.max(high, k);
      else low = Math.max(low, k);
      if (k > 0 && firstKts === null) firstKts = x.iasKts;
      peakAoa = Math.max(peakAoa, x.aoaDeg);
    } });
    console.log(`[c172 buffet] landing: touchdown ${r.td?.sinkFpm.toFixed(0)} fpm at ${r.td?.iasKts.toFixed(0)} KIAS (Vs ${stallSpeedKts(spec, 1).toFixed(0)}), peak α ${peakAoa.toFixed(1)}° (stall ${stallAoaDeg(spec, 1)}°); buffet above 5 ft ${high.toFixed(3)}, below ${low.toFixed(3)}, from ${firstKts?.toFixed(1)} KIAS`);
    expect(r.td).not.toBeNull();
    expect(high).toBe(0);
    expect(low).toBeLessThanOrEqual(0.75);
    if (firstKts !== null) expect(firstKts).toBeLessThan(stallWarningKts(spec, 1));
  });
});

describe('stall buffet: still in trimmed flight (0079)', () => {
  for (const [key, spec] of Object.entries(AIRCRAFT_DATABASE)) {
    const finalFlaps = spec.vrefKtsByFlap ? spec.vrefKtsByFlap.length - 1 : (spec.alphaStallDegByFlap?.length ?? 3) - 1;
    it(`${key}: on a final at Vref + 5 (flaps ${finalFlaps}) and in a 1 g cruise at 1.5 Vref clean, no buffet`, () => {
      const fin = trimAoaDeg(spec, (vrefFor(spec, finalFlaps) + 5) * KTS_TO_MPS, finalFlaps);
      const cruise = trimAoaDeg(spec, 1.5 * spec.vrefKts * KTS_TO_MPS, 0);
      expect(buffetIntensity(fin, stallAoaDeg(spec, finalFlaps))).toBe(0);
      expect(buffetIntensity(cruise, stallAoaDeg(spec, 0))).toBe(0);
    });
  }
});

// Kid and Learner never fly the wing that close: their AoA envelope (assists.js) stops the stick
// 4° short of the stall (Kid's auto-flare 3°), under BUFFET_ONSET on the Cessna and the 737.
// The F-16's 28° stall is far past its limiter's ~25° (fbw.js): 24° is 0.857 of it (a trace), Kid's
// flare cap of 25° 0.89 (~0.2): at the limiter the real jet buffets too.
describe('stall buffet: Kid and Learner\'s AoA envelope stops short of it (0079)', () => {
  for (const [key, spec] of Object.entries(AIRCRAFT_DATABASE)) {
    it(`${key}: at every flap notch, Learner's and Kid's caps (the flare's too) buffet ${key === 'f16' ? 'under 0.01 (the flare\'s 0.25)' : 'not at all'}`, () => {
      for (let f = 0; f < (spec.alphaStallDegByFlap?.length ?? 4); f++) {
        const st = stallAoaDeg(spec, f);
        for (const m of [ASSIST_CONFIG.learner.aoaMarginDeg, ASSIST_CONFIG.kid.aoaMarginDeg]) {
          const k = buffetIntensity(st - m, st);
          if (key === 'f16') expect(k).toBeLessThan(0.01); else expect(k).toBe(0);
        }
        const flare = buffetIntensity(st - ASSIST_CONFIG.kid.flareAoaMarginDeg, st);
        if (key === 'f16') expect(flare).toBeLessThan(0.25); else expect(flare).toBe(0);
      }
    });
  }
});

// The stall the drill teaches (stallDrill.js: idle, the nose eased up, ~1 kt/s): the horn at
// Vs + 5 (aero.js stallWarningKts), then the buffet at least 2 kt before the break (today 3.3 kt
// clean, 2.4 at flaps 30; an onset of 0.95 of the stall angle would fail it), full at the break.
// And on a go-around's flap retraction (lever up, flaps still travelling): full as the wing breaks.
describe('stall buffet: it comes before the stall (0079)', () => {
  for (const flaps of [0, 3]) {
    it(`c172 flaps ${flaps}, idle, slowed ~1 kt/s from 70 KIAS: the buffet starts under the horn's speed and over 2 kt before the break, and is 1 there`, () => {
      const spec = AIRCRAFT_DATABASE.c172;
      const b = makeBody(spec, { kts: 70, altM: 1500, flaps, gearDown: true, throttle: 0 });
      const stall = stallAoaDeg(spec, flaps);
      const hold = speedHoldPilot((x) => 70 - x.t);
      let firstKts = null, breakKts = null, atBreak = 0;
      fly(b, spec, 90, (x, dt) => {
        hold(x, dt);
        const k = wingBuffet(spec, x);
        if (k > 0 && firstKts === null) firstKts = x.iasKts;
        if (x.aoaDeg > stall && breakKts === null) { breakKts = x.iasKts; atBreak = k; }
      }, () => breakKts !== null);
      console.log(`[c172 buffet] flaps ${flaps} stall: horn ${stallWarningKts(spec, flaps).toFixed(1)} KIAS, buffet from ${firstKts?.toFixed(1)}, the wing breaks at ${breakKts?.toFixed(1)}`);
      expect(firstKts).not.toBeNull();
      expect(breakKts).not.toBeNull();
      expect(firstKts).toBeLessThan(stallWarningKts(spec, flaps));
      expect(firstKts).toBeGreaterThan(breakKts + 2);
      expect(atBreak).toBeGreaterThan(0.95); // (IAS / Vs)² a hair under 1 at the break
    });
  }
  it('c172 flaps 30 with the lever just moved to up (a go-around), pulled to the break: the buffet is full as the wing breaks at the flaps\' stall angle', () => {
    const spec = AIRCRAFT_DATABASE.c172;
    const b = makeBody(spec, { kts: 55, altM: 1500, flaps: 3, gearDown: true, throttle: 0 });
    fly(b, spec, 0.1); // systems.js seeds the flaps from the lever on the first step: at 30° now
    b.flapsIndex = 0; // the lever up; flapPos follows at the flap motor's rate (systems.js)
    let breakFlapPos = null, atBreak = 0;
    fly(b, spec, 30, (x, dt) => {
      x.elevInput += (-0.7 - x.elevInput) * Math.min(1, dt * 10); // pulled: the nose up as the flaps come in
      if (breakFlapPos === null && Math.abs(x.aoaDeg) > stallAoaDeg(spec, x.flapPos)) { breakFlapPos = x.flapPos; atBreak = wingBuffet(spec, x); }
    }, () => breakFlapPos !== null);
    console.log(`[c172 buffet] go-around stall: broke with the flaps at notch ${breakFlapPos?.toFixed(2)} (lever 0), buffet ${atBreak.toFixed(3)}`);
    expect(breakFlapPos).not.toBeNull();
    expect(breakFlapPos).toBeGreaterThan(0.5); // still in transit: the case the lever would get wrong
    expect(atBreak).toBeGreaterThan(0.95);
  });
});
