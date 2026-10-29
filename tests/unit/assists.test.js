import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { stallAoaDeg } from '../../src/aero.js';
import {
  ASSIST_KEY, ASSIST_CONFIG, DEFAULT_ASSIST, assistConfig, createAssistState, shapeControls,
  autoConfigure, groundSteerRudder, kidTargetKts, kidLocalizerBankDeg, kidFinalGuide, updateDeparture, resetAssistState, assistBestKey, loadAssist, saveAssist,
} from '../../src/assists.js';
import { makeBody, fly, attitude } from '../flight/harness.js';
import { dihedralAileron } from '../../src/flightModel.js';
import { Euler } from 'three';
import { runwayEnd, approachGeometry } from '../../src/airports.js';

const memStorage = (init = {}) => {
  const m = { ...init };
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; }, m };
};

// Fly `seconds` with fixed raw stick inputs through the assist, at fixed throttle (no
// autothrottle: the airframe alone must stay inside the envelope). Records the extremes.
function flyAssisted(spec, level, { pitchIn = 0, rollIn = 0, yawIn = 0, seconds = 10, kts, altM = 1500, flaps = 0, throttle } = {}) {
  const cfg = assistConfig(level);
  const st = createAssistState();
  const b = makeBody(spec, { kts, altM, flaps, throttle });
  b.apMaster = false;
  const s = {}, out = {};
  const rec = { maxBank: 0, maxAoaOverStall: -Infinity, minPitch: Infinity, maxPitch: -Infinity, maxBeta: 0 };
  fly(b, spec, seconds, (x, dt) => {
    const { pitchDeg, bankRightDeg } = attitude(x);
    Object.assign(s, {
      pitchIn, rollIn, yawIn, pitchDeg, bankRightDeg, pitchRateUp: x.angVel.x, rollRateRight: -x.angVel.z,
      aoaDeg: x.aoaDeg ?? 0, betaDeg: x.betaDeg ?? 0, stallAoaDeg: stallAoaDeg(spec, x.flapsIndex), tailstrikeDeg: spec.maxGroundPitchDeg ?? 15,
      onGround: !!x.onGround, wheelHeightM: x.pos.y - spec.gearHeight, airspeedMps: (x.tasKts ?? 0) * 0.514444,
      guideBankDeg: 0, guideGammaDeg: 0,
    });
    shapeControls(cfg, st, s, dt, out);
    x.elevInput = out.elev; x.aileronInput = out.ail; x.rudderInput = out.rud;
    if (x.t > 0.5) {
      rec.maxBank = Math.max(rec.maxBank, Math.abs(bankRightDeg));
      rec.maxAoaOverStall = Math.max(rec.maxAoaOverStall, (x.aoaDeg ?? 0) - stallAoaDeg(spec, x.flapsIndex));
      rec.minPitch = Math.min(rec.minPitch, pitchDeg);
      rec.maxPitch = Math.max(rec.maxPitch, pitchDeg);
      if (x.t > 6) rec.maxBeta = Math.max(rec.maxBeta, Math.abs(x.betaDeg ?? 0));
    }
  });
  rec.body = b;
  return rec;
}

const PLANES = [
  ['Cessna 172', AIRCRAFT_DATABASE.c172, { kts: 90, throttle: 0.6 }],
  ['737-800', AIRCRAFT_DATABASE.b738, { kts: 180, throttle: 0.45 }],
];

describe('Kid envelope protection (headless, on the real flight model)', () => {
  for (const [name, spec, trim] of PLANES) {
    for (const [dir, pitchIn, rollIn] of [['aft-right', -1, 1], ['aft-left', -1, -1], ['aft', -1, 0], ['fwd-right', 1, 1]]) {
      it(`${name}: full ${dir} stick for 10 s never passes 30° bank or stalls`, () => {
        const r = flyAssisted(spec, 'kid', { ...trim, pitchIn, rollIn });
        expect(r.maxBank).toBeLessThanOrEqual(30);
        expect(r.maxAoaOverStall).toBeLessThan(-1); // a margin left, not just "not stalled"
        expect(r.maxPitch).toBeLessThanOrEqual(ASSIST_CONFIG.kid.pitchUpMaxDeg + 1);
        expect(r.minPitch).toBeGreaterThanOrEqual(ASSIST_CONFIG.kid.pitchDownMaxDeg - 1);
      });
    }
    it(`${name}: full aft stick at idle, flaps out (a stall entry) is a nose-drop, not a stall`, () => {
      const r = flyAssisted(spec, 'kid', { kts: spec.vrefKts + 10, flaps: 2, throttle: 0, pitchIn: -1, seconds: 20 });
      expect(r.maxAoaOverStall).toBeLessThan(-1);
      const l = flyAssisted(spec, 'learner', { kts: spec.vrefKts + 10, flaps: 2, throttle: 0, pitchIn: -1, seconds: 20 });
      expect(l.maxAoaOverStall).toBeLessThan(-0.5);
    });
  }

  it('Learner allows more bank (45°) but still caps it and protects the stall', () => {
    const r = flyAssisted(AIRCRAFT_DATABASE.c172, 'learner', { kts: 90, throttle: 0.6, pitchIn: -1, rollIn: 1 });
    expect(r.maxBank).toBeGreaterThan(32);
    expect(r.maxBank).toBeLessThanOrEqual(45);
    expect(r.maxAoaOverStall).toBeLessThan(-0.5);
  });

  it('letting go levels the wings and holds the pitch (auto-trim)', () => {
    const spec = AIRCRAFT_DATABASE.c172;
    const r = flyAssisted(spec, 'kid', { kts: 90, throttle: 0.6, rollIn: 1, seconds: 4 });
    const st = createAssistState();
    const cfg = assistConfig('kid');
    const b = r.body;
    const s = {}, out = {};
    fly(b, spec, 8, (x, dt) => {
      const { pitchDeg, bankRightDeg } = attitude(x);
      Object.assign(s, {
        pitchIn: 0, rollIn: 0, yawIn: 0, pitchDeg, bankRightDeg, pitchRateUp: x.angVel.x, rollRateRight: -x.angVel.z,
        aoaDeg: x.aoaDeg, betaDeg: x.betaDeg, stallAoaDeg: stallAoaDeg(spec, 0), tailstrikeDeg: 15, onGround: false, wheelHeightM: 1000, airspeedMps: 45,
        guideBankDeg: 0, guideGammaDeg: 0,
      });
      shapeControls(cfg, st, s, dt, out);
      x.elevInput = out.elev; x.aileronInput = out.ail; x.rudderInput = out.rud;
    });
    expect(Math.abs(attitude(b).bankRightDeg)).toBeLessThan(3);
  });

  it('auto-coordination keeps a steady turn nearly free of sideslip', () => {
    const r = flyAssisted(AIRCRAFT_DATABASE.c172, 'kid', { kts: 90, throttle: 0.6, rollIn: 1 });
    expect(r.maxBeta).toBeLessThan(2);
  });

  it('the pilot\'s own rudder wins over coordination', () => {
    const out = {};
    shapeControls(assistConfig('kid'), createAssistState(), {
      pitchIn: 0, rollIn: 0, yawIn: 0.8, pitchDeg: 2, bankRightDeg: 0, pitchRateUp: 0, rollRateRight: 0,
      aoaDeg: 4, betaDeg: 5, stallAoaDeg: 14, onGround: false, wheelHeightM: 300, airspeedMps: 50, guideBankDeg: 0, guideGammaDeg: 0,
    }, 1 / 120, out);
    expect(out.rud).toBe(0.8);
  });

  it('on the ground the stick is passed through untouched (rotation is the pilot\'s)', () => {
    const out = {};
    const st = createAssistState();
    st.pitchHoldDeg = 5;
    shapeControls(assistConfig('kid'), st, {
      pitchIn: -0.7, rollIn: 0.2, yawIn: -0.3, pitchDeg: 0, bankRightDeg: 0, pitchRateUp: 0, rollRateRight: 0,
      aoaDeg: 0, betaDeg: 0, stallAoaDeg: 14, onGround: true, wheelHeightM: 0, airspeedMps: 30,
    }, 1 / 120, out);
    expect(out).toEqual({ elev: -0.7, ail: 0.2, rud: -0.3 });
    expect(st.pitchHoldDeg).toBeNull();
  });

  it('Kid auto-flare raises the held pitch near the ground; Learner does not', () => {
    const s = {
      pitchIn: 0, rollIn: 0, yawIn: 0, pitchDeg: -1, bankRightDeg: 0, pitchRateUp: 0, rollRateRight: 0,
      aoaDeg: 4, betaDeg: 0, stallAoaDeg: 14, tailstrikeDeg: 11, onGround: false, wheelHeightM: 4, airspeedMps: 70, guideBankDeg: 0, guideGammaDeg: 2,
    };
    const kid = createAssistState(), learner = createAssistState();
    shapeControls(assistConfig('kid'), kid, s, 1 / 120, {});
    shapeControls(assistConfig('learner'), learner, s, 1 / 120, {});
    expect(kid.pitchHoldDeg).toBeGreaterThan(2);
    expect(learner.pitchHoldDeg).toBe(-1);
    // …but never into a tailstrike (737: 11°, kept 2° clear).
    const deep = createAssistState();
    shapeControls(assistConfig('kid'), deep, { ...s, aoaDeg: 12, stallAoaDeg: 20, airspeedMps: 30 }, 1 / 120, {});
    expect(deep.pitchHoldDeg).toBeLessThanOrEqual(9);
  });

  it('Kid flares to 3° under the stall angle; above the flare the protection keeps 4° (0102)', () => {
    const s = {
      pitchIn: 0, rollIn: 0, yawIn: 0, pitchDeg: 5, bankRightDeg: 0, pitchRateUp: 0, rollRateRight: 0,
      aoaDeg: 10.5, betaDeg: 0, stallAoaDeg: 14, tailstrikeDeg: 15, onGround: false, wheelHeightM: 4, airspeedMps: 29, guideBankDeg: 0, guideGammaDeg: 0,
    };
    const flare = {};
    shapeControls(assistConfig('kid'), createAssistState(), s, 1 / 120, flare);
    expect(flare.elev).toBeLessThan(0); // still nose up at 3.5° under the stall
    const high = {};
    shapeControls(assistConfig('kid'), createAssistState(), { ...s, wheelHeightM: 100 }, 1 / 120, high);
    expect(high.elev).toBeGreaterThan(0); // the 4° margin lowers the nose
    const over = {};
    shapeControls(assistConfig('kid'), createAssistState(), { ...s, aoaDeg: 11.5 }, 1 / 120, over);
    expect(over.elev).toBeGreaterThan(0); // past 3° under, even the flare lowers it
  });
});

describe('Kid hands-off guidance', () => {
  const base = {
    pitchIn: 0, rollIn: 0, yawIn: 0, pitchDeg: -8, bankRightDeg: 0, pitchRateUp: 0, rollRateRight: 0,
    aoaDeg: 4, betaDeg: 0, stallAoaDeg: 20, onGround: false, wheelHeightM: 1000, airspeedMps: 70, guideBankDeg: 10, guideGammaDeg: -3,
  };
  it('letting go eases the held pitch toward the guide path at 2°/s and banks toward the guide', () => {
    const st = createAssistState();
    const out = {};
    for (let i = 0; i < 120; i++) shapeControls(assistConfig('kid'), st, base, 1 / 120, out); // 1 s
    expect(st.pitchHoldDeg).toBeCloseTo(-6, 1); // from −8 toward −3 + 4 = +1
    expect(out.ail).toBeGreaterThan(0); // toward 10° right
  });
  it('a hand on the stick wins; Learner just holds', () => {
    const kid = createAssistState(), learner = createAssistState();
    const out = {};
    shapeControls(assistConfig('kid'), kid, { ...base, rollIn: -1 }, 1 / 120, out);
    expect(out.ail).toBeLessThan(0);
    for (let i = 0; i < 120; i++) shapeControls(assistConfig('learner'), learner, base, 1 / 120, out);
    expect(learner.pitchHoldDeg).toBe(-8);
    expect(out.ail).toBeCloseTo(0, 5);
  });
});

// Sideslip rolls the airplane (dihedral, 0081): a held rudder key (full, it is digital) slips
// the 737 ~20°, a rolling moment worth 0.9 of full aileron, more than the bank hold's 0.6.
// The assist feeds that aileron forward (like auto-trim), so the stick still commands bank.
describe('Kid and Learner hold bank against a held rudder (dihedral, 0081)', () => {
  for (const [name, spec, kts] of [['737-800', AIRCRAFT_DATABASE.b738, 160], ['Cessna 172', AIRCRAFT_DATABASE.c172, 90]]) {
    for (const level of ['kid', 'learner']) {
      it(`${name} ${level}: full rudder held 20 s, stick centred, stays inside the bank cap and the height`, () => {
        const b = makeBody(spec, { kts, altM: 600, flaps: 0, throttle: 0.5 });
        b.apMaster = false;
        const st = createAssistState(), cfg = assistConfig(level), s = {}, out = {};
        let maxBank = 0, maxBeta = 0;
        fly(b, spec, 20, (x, dt) => {
          const { pitchDeg, bankRightDeg } = attitude(x);
          Object.assign(s, {
            pitchIn: 0, rollIn: 0, yawIn: 1, pitchDeg, bankRightDeg, pitchRateUp: x.angVel.x, rollRateRight: -x.angVel.z,
            aoaDeg: x.aoaDeg ?? 0, betaDeg: x.betaDeg ?? 0, dihedralAil: dihedralAileron(spec, (x.betaDeg ?? 0) * Math.PI / 180),
            stallAoaDeg: stallAoaDeg(spec, 0), tailstrikeDeg: 15, onGround: false, wheelHeightM: 600, airspeedMps: x.vel.length(),
            guideBankDeg: 0, guideGammaDeg: 0,
          });
          shapeControls(cfg, st, s, dt, out);
          x.elevInput = out.elev; x.aileronInput = out.ail; x.rudderInput = out.rud;
          maxBank = Math.max(maxBank, Math.abs(bankRightDeg));
          maxBeta = Math.max(maxBeta, Math.abs(x.betaDeg ?? 0));
        });
        expect(maxBeta).toBeGreaterThan(3); // the rudder did slip it
        expect(maxBank).toBeLessThan(cfg.bankMaxDeg * 0.5);
        expect(b.pos.y).toBeGreaterThan(450);
      });
    }
  }
});

describe('Kid hands-off final guide (kidFinalGuide, 0098)', () => {
  const end = runwayEnd('KADS', '16');
  // A point `alongM` past the threshold (negative: short of it), `crossM` right, `upM` above it.
  const at = (alongM, crossM = 0, upM = 15) => {
    const d = { x: Math.sin(end.hdgT * Math.PI / 180), z: -Math.cos(end.hdgT * Math.PI / 180) };
    return { x: end.thrX + d.x * alongM - d.z * crossM, y: end.thrY + upM, z: end.thrZ + d.z * alongM + d.x * crossM };
  };
  const out = (pos, noseDeg) => { const o = { guideBankDeg: 0, guideGammaDeg: 0 }; kidFinalGuide(end, approachGeometry(end, pos), noseDeg ?? end.hdgT, end.hdgT, o); return o; };
  it('flies the 3° path on the final and on past the threshold and the aim point, low over the first third', () => {
    const third = (end.lengthM - end.displacedM) / 3;
    for (const along of [-3000, -100, 50, 305, third - 20]) {
      expect(out(at(along, 0, 0.5 + Math.max(0, -along - 305) * 0.0524)).guideGammaDeg).toBeLessThan(-0.4);
    }
    // 15 m up past the aim point is well above the path, but never steeper than 2° past the threshold
    expect(out(at(600)).guideGammaDeg).toBe(-2);
  });
  it('leaves level flight off the final: past the first third, high over the runway, far out, wide or not lined up', () => {
    const third = (end.lengthM - end.displacedM) / 3;
    // A go-around or takeoff climbing through 1,000 ft over its runway is not dived back at it (panel).
    for (const o of [out(at(third + 20, 0, 3)), out(at(end.lengthM + 100)), out(at(100, 0, 35)), out(at(1500, 0, 305)),
      out(at(-25000)), out(at(-3000, 1600, 160)), out(at(-3000, 0, 160), end.hdgT + 60)]) {
      expect(o).toEqual({ guideBankDeg: 0, guideGammaDeg: 0 });
    }
  });
  it('steers back to the centreline past the threshold too', () => {
    expect(out(at(200, 20)).guideBankDeg).toBeLessThan(0); // right of it: bank left
    expect(out(at(200, -20)).guideBankDeg).toBeGreaterThan(0);
  });
});

describe('Kid hands-off line-up (headless, runway heading north, x = cross-track)', () => {
  for (const [name, spec, kts] of [['737-800', AIRCRAFT_DATABASE.b738, 141], ['Cessna 172', AIRCRAFT_DATABASE.c172, 67]]) {
    it(`${name}: from 150 m right of the centreline, captures it without S-turns`, () => {
      const b = makeBody(spec, { kts, altM: 400, flaps: 2, throttle: 0.3 });
      b.apMaster = false;
      b.pos.x = 150;
      const st = createAssistState(), cfg = assistConfig('kid'), s = {}, out = {}, e = new Euler(0, 0, 0, 'YXZ');
      let minX = Infinity, maxBank = 0;
      fly(b, spec, 70, (x, dt) => {
        const { pitchDeg, bankRightDeg } = attitude(x);
        e.setFromQuaternion(x.quat, 'YXZ');
        const hdg = (-e.y * 180 / Math.PI + 360) % 360;
        Object.assign(s, {
          pitchIn: 0, rollIn: 0, yawIn: 0, pitchDeg, bankRightDeg, pitchRateUp: x.angVel.x, rollRateRight: -x.angVel.z,
          aoaDeg: x.aoaDeg ?? 0, betaDeg: x.betaDeg ?? 0, stallAoaDeg: stallAoaDeg(spec, 2), tailstrikeDeg: 15,
          onGround: false, wheelHeightM: 400, airspeedMps: 70, guideBankDeg: kidLocalizerBankDeg(0, hdg, x.pos.x), guideGammaDeg: 0,
        });
        shapeControls(cfg, st, s, dt, out);
        x.elevInput = out.elev; x.aileronInput = out.ail; x.rudderInput = out.rud;
        minX = Math.min(minX, x.pos.x);
        maxBank = Math.max(maxBank, Math.abs(bankRightDeg));
      });
      expect(Math.abs(b.pos.x)).toBeLessThan(5);
      expect(minX).toBeGreaterThan(-30); // overshoot
      expect(maxBank).toBeLessThan(25);
    });

    // Ticket 0097: main.js flies the line-up on the ground track, so the crab a crosswind needs
    // leaves no steady offset (on the nose heading it was drift / 0.15°/m: ~50 m at 10 kt).
    it(`${name}: in a crosswind from the right, flown on the ground track, holds the centreline crabbed`, () => {
      const xw = kts > 100 ? 15 : 10; // kt, from the east (runway north): ~6° and ~8.5° of crab
      const b = makeBody(spec, { kts, altM: 400, flaps: 2, throttle: 0.3 });
      b.apMaster = false;
      b.windVec.set(-xw * 0.514444, 0, 0);
      b.vel.add(b.windVec);
      const st = createAssistState(), cfg = assistConfig('kid'), s = {}, out = {}, e = new Euler(0, 0, 0, 'YXZ');
      let maxAbsX = 0, hdg = 0;
      fly(b, spec, 90, (x, dt) => {
        const { pitchDeg, bankRightDeg } = attitude(x);
        e.setFromQuaternion(x.quat, 'YXZ');
        hdg = -e.y * 180 / Math.PI;
        const track = Math.atan2(x.vel.x, -x.vel.z) * 180 / Math.PI;
        Object.assign(s, {
          pitchIn: 0, rollIn: 0, yawIn: 0, pitchDeg, bankRightDeg, pitchRateUp: x.angVel.x, rollRateRight: -x.angVel.z,
          aoaDeg: x.aoaDeg ?? 0, betaDeg: x.betaDeg ?? 0, stallAoaDeg: stallAoaDeg(spec, 2), tailstrikeDeg: 15,
          onGround: false, wheelHeightM: 400, airspeedMps: 70, guideBankDeg: kidLocalizerBankDeg(0, track, x.pos.x), guideGammaDeg: 0,
        });
        shapeControls(cfg, st, s, dt, out);
        x.elevInput = out.elev; x.aileronInput = out.ail; x.rudderInput = out.rud;
        if (x.t > 45) maxAbsX = Math.max(maxAbsX, Math.abs(x.pos.x));
      });
      expect(maxAbsX).toBeLessThan(5); // settled on the centreline
      expect(hdg).toBeGreaterThan(3); // crabbed into the wind (nose right)
    });
  }
});

describe('Kid wings level in the flare', () => {
  it('below the flare height full stick rolls back toward 5° of bank, never a wingtip strike', () => {
    const out = {};
    shapeControls(assistConfig('kid'), createAssistState(), {
      pitchIn: 0, rollIn: 1, yawIn: 0, pitchDeg: 3, bankRightDeg: 12, pitchRateUp: 0, rollRateRight: 0,
      aoaDeg: 5, betaDeg: 0, stallAoaDeg: 14, tailstrikeDeg: 11, onGround: false, wheelHeightM: 6, airspeedMps: 70, guideBankDeg: 0, guideGammaDeg: -3,
    }, 1 / 120, out);
    expect(out.ail).toBe(-1);
  });
});

describe('Kid departure', () => {
  it('is set on the ground and cleared above 1,000 ft; a final spawn is not departing', () => {
    const st = createAssistState();
    expect(st.departing).toBe(false);
    expect(updateDeparture(st, true, 0)).toBe(true);
    expect(updateDeparture(st, false, 600)).toBe(true);
    expect(updateDeparture(st, false, 1100)).toBe(false);
    updateDeparture(st, true, 0);
    resetAssistState(st);
    expect(st.departing).toBe(false);
  });
});

describe('Kid ground floor', () => {
  it('below ~500 ft a held dive is shallowed to a 4° descent; above it, and in Learner, it is not', () => {
    const s = {
      pitchIn: 0, rollIn: 0, yawIn: 0, pitchDeg: -8, bankRightDeg: 0, pitchRateUp: 0, rollRateRight: 0,
      aoaDeg: 4, betaDeg: 0, stallAoaDeg: 20, onGround: false, wheelHeightM: 100, airspeedMps: 70, guideBankDeg: 0, guideGammaDeg: -12,
    };
    const low = createAssistState();
    shapeControls(assistConfig('kid'), low, s, 1 / 120, {});
    expect(low.pitchHoldDeg).toBeCloseTo(0, 5); // −4° path + 4° AoA
    const high = createAssistState();
    shapeControls(assistConfig('kid'), high, { ...s, wheelHeightM: 400 }, 1 / 120, {});
    expect(high.pitchHoldDeg).toBe(-8);
    const learner = createAssistState();
    shapeControls(assistConfig('learner'), learner, s, 1 / 120, {});
    expect(learner.pitchHoldDeg).toBe(-8);
  });
});

describe('Kid automatic gear and flaps', () => {
  const b738 = AIRCRAFT_DATABASE.b738, c172 = AIRCRAFT_DATABASE.c172;
  it('descending low: gear down, approach flaps', () => {
    const c = autoConfigure(b738, { onGround: false, aglFt: 900, vsiFpm: -700, iasKts: 150 }, { gearDown: false, flapsIndex: 0 });
    expect(c).toEqual({ gearDown: true, flapsIndex: 2 });
  });
  it('climbing away: gear up, then flaps up', () => {
    const c = autoConfigure(b738, { onGround: false, aglFt: 1200, vsiFpm: 1500, iasKts: 170 }, { gearDown: true, flapsIndex: 1 });
    expect(c).toEqual({ gearDown: false, flapsIndex: 0 });
  });
  it('level in between changes nothing; never retracts a fixed gear; never on the ground', () => {
    expect(autoConfigure(b738, { onGround: false, aglFt: 1200, vsiFpm: 0, iasKts: 170 }, { gearDown: true, flapsIndex: 1 }))
      .toEqual({ gearDown: true, flapsIndex: 1 });
    expect(autoConfigure(c172, { onGround: false, aglFt: 2000, vsiFpm: 800, iasKts: 80 }, { gearDown: true, flapsIndex: 1 }).gearDown).toBe(true);
    expect(autoConfigure(b738, { onGround: true, aglFt: 0, vsiFpm: 0, iasKts: 0 }, { gearDown: true, flapsIndex: 1 }))
      .toEqual({ gearDown: true, flapsIndex: 1 });
  });
  it('keeps landing flaps already set', () => {
    expect(autoConfigure(b738, { onGround: false, aglFt: 800, vsiFpm: -700, iasKts: 140 }, { gearDown: true, flapsIndex: 3 }).flapsIndex).toBe(3);
  });
  it('autothrottle target: Vref+5 with flaps, +30 clean', () => {
    expect(kidTargetKts(b738, 2)).toBe(155);
    expect(kidTargetKts(b738, 3)).toBe(146); // flaps 40: its own Vref 141 + 5
    expect(kidTargetKts(c172, 0)).toBe(92);
  });
});

describe('assist level storage and per-level bests', () => {
  it('a first visit (nothing stored) flies Learner (0059); remembers a level as { v: 1, level }', () => {
    const st = memStorage();
    expect(loadAssist(st)).toBe(DEFAULT_ASSIST);
    expect(DEFAULT_ASSIST).toBe('learner');
    expect(st.m[ASSIST_KEY]).toBeUndefined(); // reading the default writes nothing
    saveAssist(st, 'kid', 123);
    expect(JSON.parse(st.m[ASSIST_KEY])).toEqual({ v: 1, level: 'kid', at: 123 });
    expect(loadAssist(st)).toBe('kid');
  });
  it('a stored level always wins over the first-visit default', () => {
    for (const level of ['pilot', 'kid', 'learner']) {
      expect(loadAssist(memStorage({ [ASSIST_KEY]: JSON.stringify({ v: 1, level, at: 0 }) }))).toBe(level);
    }
  });
  it('a player who has flown Pilot without picking a level (a plain-key best) stays on Pilot', () => {
    const best = (missions) => JSON.stringify({ v: 1, missions });
    expect(loadAssist(memStorage({ openaero_best: best({ kdfw_35c_final: { score: 80, grade: 'A', at: 0 } }) }))).toBe('pilot');
    // Only Learner or Kid bests (a first visit that landed on the default): still Learner.
    expect(loadAssist(memStorage({ openaero_best: best({ 'kdfw_35c_final@learner': { score: 80, grade: 'A', at: 0 } }) }))).toBe('learner');
    expect(loadAssist(memStorage({ openaero_best: best({}) }))).toBe('learner');
    expect(loadAssist(memStorage({ openaero_best: '{junk' }))).toBe('learner');
    // A stored level still wins over the bests.
    expect(loadAssist(memStorage({ [ASSIST_KEY]: JSON.stringify({ v: 1, level: 'kid', at: 0 }),
      openaero_best: best({ kdfw_35c_final: { score: 80, grade: 'A', at: 0 } }) }))).toBe('kid');
  });
  it('junk, unknown versions and throwing storage read as Learner, without throwing', () => {
    expect(loadAssist(memStorage({ [ASSIST_KEY]: '{bad' }))).toBe('learner');
    expect(loadAssist(memStorage({ [ASSIST_KEY]: 'null' }))).toBe('learner');
    expect(loadAssist(memStorage({ [ASSIST_KEY]: JSON.stringify({ v: 2, level: 'kid' }) }))).toBe('learner');
    expect(loadAssist(memStorage({ [ASSIST_KEY]: JSON.stringify({ v: 1, level: 'god' }) }))).toBe('learner');
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(loadAssist(throwing)).toBe('learner');
    expect(() => saveAssist(throwing, 'kid')).not.toThrow();
  });
  it('Pilot keeps the mission key (existing bests); Kid and Learner get their own', () => {
    expect(assistBestKey('kdfw_35c_final', 'pilot')).toBe('kdfw_35c_final');
    expect(assistBestKey('kdfw_35c_final', 'kid')).toBe('kdfw_35c_final@kid');
    expect(assistBestKey('kdfw_35c_final', 'learner')).toBe('kdfw_35c_final@learner');
    expect(assistBestKey('kdfw_35c_final', 'bogus')).toBe('kdfw_35c_final');
  });
});

// Ticket 0110: on the runway, Kid and Learner hold the centreline with the pedals, never the
// sideslip's coordination rudder (it steered the nose wheel into the wind).
describe('on the runway (groundSteerRudder, 0110)', () => {
  const ground = {
    pitchIn: 0, rollIn: 0, yawIn: 0, onGround: true, betaDeg: 20,
    rwyHdgDeg: 350, noseHdgDeg: 350, crossM: 0, crossVelMps: 0, yawRateRightDegS: 0,
  };
  it('lined up on the centreline, at rest: no rudder, whatever the sideslip', () => {
    for (const level of ['kid', 'learner']) {
      expect(shapeControls(assistConfig(level), createAssistState(), ground, 1 / 120, {}).rud).toBeCloseTo(0, 9);
    }
  });
  it('steers back towards the runway heading and the centreline, damped by the yaw rate', () => {
    expect(groundSteerRudder(350, 345, 0, 0, 0)).toBeGreaterThan(0); // nose left of the runway: right rudder
    expect(groundSteerRudder(10, 355, 0, 0, 0)).toBeCloseTo(1, 9); // across north, full right
    expect(groundSteerRudder(350, 350, 10, 0, 0)).toBeLessThan(0); // right of the centreline: nose left
    expect(groundSteerRudder(350, 350, 0, 2, 0)).toBeLessThan(0); // drifting right: nose left
    expect(groundSteerRudder(350, 350, 100, 0, 0)).toBeCloseTo(-0.9, 9); // never more than 3° off the runway
    expect(groundSteerRudder(350, 350, 0, 0, 4)).toBeLessThan(0); // already yawing right: check it
  });
  it("the player's pedals win; off a runway the rudder is theirs (0 if they leave it)", () => {
    const cfg = assistConfig('learner');
    expect(shapeControls(cfg, createAssistState(), { ...ground, crossM: 10, yawIn: 0.7 }, 1 / 120, {}).rud).toBe(0.7);
    expect(shapeControls(cfg, createAssistState(), { ...ground, crossM: 10, rwyHdgDeg: null }, 1 / 120, {}).rud).toBe(0);
    expect(shapeControls(cfg, createAssistState(), { ...ground, crossM: 10 }, 1 / 120, {}).rud).toBeLessThan(0);
  });
});
