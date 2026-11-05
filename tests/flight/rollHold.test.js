// Bank holds at a slow phone's sub-step (ticket 0156). The roll rate now follows the airspeed and the
// F-16's stick commands up to 308°/s (flightModel.js rollRateGain), ten times the old constant rate
// the hold gains (autopilot.js aileronForBank) were tuned on. main.js runs its physics in at least
// three sub-steps a frame: 1/180 s at 60 fps, stretching to 1/60 s at 20 fps (step6DofPhysics). These
// cards fly the autopilot's bank hold (main.js holdHeading: aileronForBank × rollHoldScale) and Kid's
// and Learner's (assists.js shapeControls) at 1/60 s across each airframe's envelope, the F-16's high-q
// corner (600 KIAS at 2,000 ft) included: the bank settles, steady within 1°, with no limit cycle.
import { describe, it, expect } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { M_TO_FT, KTS_TO_MPS } from '../../src/constants.js';
import { trimThrottle, rollHoldScale, dihedralAileron } from '../../src/flightModel.js';
import { airAt } from '../../src/atmosphere.js';
import { stallAoaDeg } from '../../src/aero.js';
import { elevatorForPitch, aileronForBank } from '../../src/autopilot.js';
import { assistConfig, createAssistState, shapeControls } from '../../src/assists.js';
import { makeBody, fly, attitude } from './harness.js';
import { pilotRoll } from '../../src/fbw.js';

const { c172, f16 } = AIRCRAFT_DATABASE;
const DT60 = 1 / 60;

// Level flight at `kts` and `altFt`, then `roller(x, dt)` sets the aileron for `seconds`; the pitch
// holds a level path (the bank's lift made up by pitching), the throttle stays in trim. Returns the
// bank's trace over the last `lastS` seconds: mean, spread (max − min) and roll-rate sign flips.
function flyBank(spec, kts, altFt, roller, { seconds = 10, lastS = 3, dt = DT60, flaps = 0, gearDown = false } = {}) {
  const altM = altFt / M_TO_FT;
  const b = makeBody(spec, { kts, altM, flaps, gearDown });
  b.throttle = b.engineN = Math.min(1, trimThrottle(spec, kts * KTS_TO_MPS, flaps, 0, gearDown, airAt(altM)) * 1.1);
  b.apMaster = false; b.autoTrim = true;
  const pitch0 = attitude(b).pitchDeg;
  const tail = [];
  let flips = 0, lastP = 0;
  fly(b, spec, seconds, (x, h) => {
    const { pitchDeg, bankRightDeg } = attitude(x);
    const cosB = Math.max(0.5, Math.cos(bankRightDeg * Math.PI / 180));
    x.elevInput = elevatorForPitch(pitch0 + (x.aoaDeg ?? 0) * (1 / cosB - 1), pitchDeg, x.angVel.x);
    roller(x, h);
    x.rudderInput = Math.max(-1, Math.min(1, (x.betaDeg ?? 0) * 0.1));
  }, (x) => {
    if (x.t >= seconds - lastS) {
      const p = -x.angVel.z;
      tail.push(attitude(x).bankRightDeg);
      if (Math.abs(p) > 0.01 && Math.sign(p) !== Math.sign(lastP) && lastP !== 0) flips++;
      if (Math.abs(p) > 0.01) lastP = p;
    }
    return false;
  }, dt);
  const mean = tail.reduce((a, v) => a + v, 0) / tail.length;
  return { mean, spread: Math.max(...tail) - Math.min(...tail), flips };
}

const apHold = (spec, cmdDeg) => (x) => {
  x.aileronInput = aileronForBank(cmdDeg, attitude(x).bankRightDeg, -x.angVel.z, rollHoldScale(spec, (x.tasKts ?? 0) * KTS_TO_MPS));
};

const ENVELOPE = [
  ['f16', f16, 150, 2000, { flaps: 1, gearDown: true }],
  ['f16', f16, 350, 10000, {}],
  ['f16', f16, 450, 15000, {}],
  ['f16', f16, 600, 2000, {}],
  ['c172', c172, 60, 3000, {}],
  ['c172', c172, 90, 5000, {}],
  ['c172', c172, 110, 5000, {}],
];

describe('the autopilot bank hold at 1/60 s sub-steps (ticket 0156)', () => {
  for (const [name, spec, kts, altFt, o] of ENVELOPE) {
    // The hold is proportional only, so it stands ~1° off the command in a turn (as it always has):
    // within 1.5° of it, steady within 1° (no wobble), no limit cycle.
    it(`${name} ${kts} KIAS, ${altFt.toLocaleString('en-US')} ft: holds 25° steady within 1°, no limit cycle`, () => {
      const r = flyBank(spec, kts, altFt, apHold(spec, 25), o);
      console.log(`[rollHold] AP ${name} ${kts} KIAS: bank ${r.mean.toFixed(2)}° (spread ${r.spread.toFixed(2)}°, ${r.flips} rate flips in 3 s)`);
      expect(Math.abs(r.mean - 25)).toBeLessThan(1.5);
      expect(r.spread).toBeLessThan(1);
      expect(r.flips).toBeLessThan(4);
    });
  }
});

// Kid and Learner: full stick holds the bank cap (CMD_SHARE of it), let go rolls level; never more
// than 3° past the cap, no wobble at it.
function assistInput(spec, x, rollIn) {
  const { pitchDeg, bankRightDeg } = attitude(x);
  return {
    pitchIn: 0, rollIn, yawIn: 0, pitchDeg, bankRightDeg, pitchRateUp: x.angVel.x, rollRateRight: -x.angVel.z,
    rollScale: rollHoldScale(spec, (x.tasKts ?? 0) * KTS_TO_MPS), yawRateRight: -x.angVel.y, driftDeg: 0,
    aoaDeg: x.aoaDeg ?? 0, betaDeg: x.betaDeg ?? 0, dihedralAil: dihedralAileron(spec, ((x.betaDeg ?? 0) * Math.PI) / 180),
    stallAoaDeg: stallAoaDeg(spec, x.flapsIndex), tailstrikeDeg: spec.maxGroundPitchDeg ?? 15, onGround: false,
    wheelHeightM: x.pos.y - spec.gearHeight, airspeedMps: (x.tasKts ?? 0) * KTS_TO_MPS, vsMps: x.vel.y,
    guideBankDeg: 0, guideGammaDeg: 0,
  };
}

describe('Kid and Learner hold their bank cap at 1/60 s sub-steps (ticket 0156)', () => {
  for (const level of ['kid', 'learner']) {
    for (const [name, spec, kts, altFt, o] of ENVELOPE) {
      it(`${level}, ${name} ${kts} KIAS: full stick holds the cap without overshoot past +3° or wobble; let go rolls level`, () => {
        const cfg = assistConfig(level), st = createAssistState(), out = {};
        let maxBank = 0, tail = [];
        const altM = altFt / M_TO_FT;
        const b = makeBody(spec, { kts, altM, flaps: o.flaps ?? 0, gearDown: !!o.gearDown });
        b.throttle = b.engineN = Math.min(1, trimThrottle(spec, kts * KTS_TO_MPS, o.flaps ?? 0, 0, !!o.gearDown, airAt(altM)) * 1.2);
        b.apMaster = false; b.autoTrim = true;
        fly(b, spec, 14, (x, h) => {
          shapeControls(cfg, st, assistInput(spec, x, x.t < 8 ? 1 : 0), h, out);
          x.elevInput = out.elev; x.aileronInput = out.ail; x.rudderInput = out.rud;
        }, (x) => {
          const bank = attitude(x).bankRightDeg;
          if (x.t < 8) maxBank = Math.max(maxBank, bank);
          if (x.t > 6 && x.t < 8) tail.push(bank);
          return false;
        }, DT60);
        const spread = Math.max(...tail) - Math.min(...tail);
        const level0 = Math.abs(attitude(b).bankRightDeg);
        console.log(`[rollHold] ${level} ${name} ${kts} KIAS: max bank ${maxBank.toFixed(1)}° (cap ${cfg.bankMaxDeg}°), spread ${spread.toFixed(2)}°, after let-go ${level0.toFixed(1)}°`);
        expect(maxBank).toBeLessThan(cfg.bankMaxDeg + 3);
        expect(maxBank).toBeGreaterThan(cfg.bankMaxDeg * 0.8);
        expect(spread).toBeLessThan(1);
        expect(level0).toBeLessThan(3);
      });
    }
  }
});

// Pilot, the raw airplane (0156): main.js smooths the stick into the aileron once a frame (fbw.js
// pilotRoll for the F-16), then flies three physics sub-steps. On the F-16 the stick is a roll-rate command up to
// 308°/s, so it gets a curve (touch, gamepad) and a ramp (keys).
function flyPilot(spec, kts, altFt, rollAt, source, seconds, fps = 60) {
  const altM = altFt / M_TO_FT;
  const b = makeBody(spec, { kts, altM });
  b.throttle = b.engineN = Math.min(1, trimThrottle(spec, kts * KTS_TO_MPS, 0, 0, !!spec.fixedGear, airAt(altM)));
  b.apMaster = false;
  let peakP = 0, frame = 0;
  const pitch0 = attitude(b).pitchDeg;
  fly(b, spec, seconds, (x, h) => {
    if (frame++ % 3 === 0) x.aileronInput = pilotRoll(x.aileronInput, rollAt(x.t), 3 * h, spec.rollCmdRad, source);
    x.elevInput = elevatorForPitch(pitch0, attitude(x).pitchDeg, x.angVel.x);
    x.rudderInput = Math.max(-1, Math.min(1, (x.betaDeg ?? 0) * 0.1));
  }, (x) => { peakP = Math.max(peakP, -x.angVel.z * 180 / Math.PI); return false; }, 1 / (3 * fps));
  return { bankDeg: attitude(b).bankRightDeg, peakP };
}

describe('Pilot on a touch screen and keys: the F-16\'s roll command is flyable (0156)', () => {
  it('half the touch stick rolls the F-16 at no more than ~90°/s (350 KIAS, 10,000 ft)', () => {
    const r = flyPilot(f16, 350, 10000, () => 0.5, 'stick', 1.5);
    console.log(`[rollHold] f16 half stick: ${r.peakP.toFixed(0)}°/s`);
    expect(r.peakP).toBeLessThan(90);
    expect(r.peakP).toBeGreaterThan(60);
  });

  it('a 0.2 s tap of D banks the F-16 less than 30° (350 KIAS, 10,000 ft, 60 and 30 fps)', () => {
    for (const fps of [60, 30]) {
      const r = flyPilot(f16, 350, 10000, (t) => (t < 0.2 ? 1 : 0), 'keyboard', 1.5, fps);
      console.log(`[rollHold] f16 0.2 s tap at ${fps} fps: bank ${r.bankDeg.toFixed(1)}°, peak ${r.peakP.toFixed(0)}°/s`);
      expect(r.bankDeg).toBeGreaterThan(3);
      expect(r.bankDeg).toBeLessThan(30);
    }
  });

  it('a 0.2 s full flick of the touch stick banks the F-16 under 35°, not a snap (350 and 500 KIAS, 60 and 30 fps)', () => {
    for (const kts of [350, 500]) {
      for (const fps of [60, 30]) {
        const r = flyPilot(f16, kts, 10000, (t) => (t < 0.2 ? 1 : 0), 'stick', 1.5, fps);
        console.log(`[rollHold] f16 0.2 s touch flick at ${kts} KIAS, ${fps} fps: bank ${r.bankDeg.toFixed(1)}°, peak ${r.peakP.toFixed(0)}°/s`);
        expect(r.bankDeg).toBeGreaterThan(3);
        expect(r.bankDeg).toBeLessThan(35); // was 60-66° with the plain 10/s smoothing (device panel)
      }
    }
  });

  it('full touch stick rolls the F-16 several times faster than the Cessna at their cruise speeds', () => {
    const f = flyPilot(f16, 350, 10000, () => 1, 'stick', 1.5).peakP;
    const c = flyPilot(c172, 110, 5000, () => 1, 'stick', 3).peakP;
    console.log(`[rollHold] full stick: f16 ${f.toFixed(0)}°/s, c172 ${c.toFixed(0)}°/s`);
    expect(f).toBeGreaterThan(250);
    expect(f / c).toBeGreaterThan(3);
  });

  it('the Cessna\'s stick is as before: linear, no curve (it commands aileron, not a rate)', () => {
    expect(pilotRoll(0, 0.5, 1, undefined, 'stick')).toBe(0.5);
    expect(pilotRoll(0, 1, 0.05, undefined, 'keyboard')).toBeCloseTo(0.5, 9);
    expect(pilotRoll(0, 0.5, 1, f16.rollCmdRad, 'stick')).toBeCloseTo(0.275, 9); // a 1 s frame reaches it
    expect(pilotRoll(0, 1, 0.05, f16.rollCmdRad, 'stick')).toBeCloseTo(0.15, 9); // rolls in at 3/s
    expect(pilotRoll(1, 0, 0.05, f16.rollCmdRad, 'stick')).toBeCloseTo(0.5, 9); // lets go at 10/s
    expect(pilotRoll(0, -1, 1, f16.rollCmdRad, 'gamepad')).toBe(-1);
  });
});

// On the wheels the roll is never more than the old constant rate (flightModel.js, 0156 first-timer
// panel): with the full gain, a touch stick held hard over for 1.5 s on the F-16's takeoff roll banked
// it 18° at 140 KTAS and cartwheeled it to 99° at Vr (155 KIAS), past landing.js's 10° wingtip strike.
describe('a held stick on the takeoff roll doesn\'t roll the airplane over (0156)', () => {
  for (const [name, spec, kts] of [['f16', f16, 140], ['f16', f16, 155], ['c172', c172, 50]]) {
    it(`${name} on the runway at ${kts} kt, full stick for 1.5 s: under 10° of bank`, () => {
      const b = makeBody(spec, { throttle: 1 });
      b.throttle = b.engineN = 1;
      b.apMaster = false;
      b.vel.set(0, 0, -kts * KTS_TO_MPS); // rolling north along the runway, nose on the ground
      let maxBank = 0;
      fly(b, spec, 1.5, (x) => { x.aileronInput = 1; x.elevInput = 0; x.rudderInput = 0; },
        (x) => { maxBank = Math.max(maxBank, Math.abs(attitude(x).bankRightDeg)); return false; });
      console.log(`[rollHold] ${name} ground roll ${kts} kt, full stick 1.5 s: max bank ${maxBank.toFixed(1)}°, on ground ${b.onGround}`);
      expect(maxBank).toBeLessThan(10);
    });
  }
});

// Kid and Learner over their cap (a gust, an upset): assists.js rolls it back at the old full-aileron
// rate (−sign·min(1, rollHoldScale)), not the F-16's 308°/s, which overshot by ~30° (physics panel).
describe('Kid and Learner roll back from past the cap without overshoot (0156)', () => {
  for (const level of ['kid', 'learner']) {
    for (const [name, spec, kts, altFt] of [['f16', f16, 350, 10000], ['f16', f16, 600, 2000], ['c172', c172, 90, 5000]]) {
      it(`${level}, ${name} ${kts} KIAS, from 60° of bank hands off: rolled back at under 100°/s, not a 308°/s snap, never past wings level by more than 3°, no wobble`, () => {
        const cfg = assistConfig(level), st = createAssistState(), out = {};
        const altM = altFt / M_TO_FT;
        const b = makeBody(spec, { kts, altM });
        b.throttle = b.engineN = Math.min(1, trimThrottle(spec, kts * KTS_TO_MPS, 0, 0, false, airAt(altM)) * 1.2);
        b.apMaster = false; b.autoTrim = true;
        b.quat.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -60 * Math.PI / 180)); // 60° right
        let minBank = 90, peakP = 0; const tail = [];
        fly(b, spec, 8, (x, h) => {
          shapeControls(cfg, st, assistInput(spec, x, 0), h, out);
          x.elevInput = out.elev; x.aileronInput = out.ail; x.rudderInput = out.rud;
        }, (x) => {
          const bank = attitude(x).bankRightDeg;
          minBank = Math.min(minBank, bank);
          peakP = Math.max(peakP, Math.abs(x.angVel.z) * 180 / Math.PI);
          if (x.t > 6) tail.push(bank);
          return false;
        }, DT60);
        console.log(`[rollHold] ${level} ${name} ${kts} KIAS from 60°: peak roll ${peakP.toFixed(0)}°/s, lowest bank ${minBank.toFixed(1)}°, settled ${tail.at(-1).toFixed(1)}°`);
        expect(peakP).toBeLessThan(100); // measured 33-71°/s; with a full-stick rollback the F-16 cards fail
        expect(minBank).toBeGreaterThan(-3);
        expect(Math.max(...tail) - Math.min(...tail)).toBeLessThan(1);
        expect(Math.abs(tail.at(-1))).toBeLessThan(2);
      });
    }
  }
});
