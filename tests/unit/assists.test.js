import { describe, it, expect } from 'vitest';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { stallAoaDeg } from '../../src/aero.js';
import {
  ASSIST_KEY, ASSIST_CONFIG, DEFAULT_ASSIST, assistConfig, createAssistState, shapeControls,
  autoConfigure, kidTargetKts, kidLocalizerBankDeg, updateDeparture, resetAssistState, assistBestKey, loadAssist, saveAssist,
} from '../../src/assists.js';
import { makeBody, fly, attitude } from '../flight/harness.js';
import { Euler } from 'three';

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
    expect(kidTargetKts(b738, 2)).toBe(141);
    expect(kidTargetKts(c172, 0)).toBe(92);
  });
});

describe('assist level storage and per-level bests', () => {
  it('defaults to Pilot; remembers a level as { v: 1, level }', () => {
    const st = memStorage();
    expect(loadAssist(st)).toBe(DEFAULT_ASSIST);
    expect(DEFAULT_ASSIST).toBe('pilot');
    saveAssist(st, 'kid', 123);
    expect(JSON.parse(st.m[ASSIST_KEY])).toEqual({ v: 1, level: 'kid', at: 123 });
    expect(loadAssist(st)).toBe('kid');
  });
  it('junk, unknown versions and throwing storage read as Pilot', () => {
    expect(loadAssist(memStorage({ [ASSIST_KEY]: '{bad' }))).toBe('pilot');
    expect(loadAssist(memStorage({ [ASSIST_KEY]: JSON.stringify({ v: 2, level: 'kid' }) }))).toBe('pilot');
    expect(loadAssist(memStorage({ [ASSIST_KEY]: JSON.stringify({ v: 1, level: 'god' }) }))).toBe('pilot');
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(loadAssist(throwing)).toBe('pilot');
    expect(() => saveAssist(throwing, 'kid')).not.toThrow();
  });
  it('Pilot keeps the mission key (existing bests); Kid and Learner get their own', () => {
    expect(assistBestKey('kdfw_35c_final', 'pilot')).toBe('kdfw_35c_final');
    expect(assistBestKey('kdfw_35c_final', 'kid')).toBe('kdfw_35c_final@kid');
    expect(assistBestKey('kdfw_35c_final', 'learner')).toBe('kdfw_35c_final@learner');
    expect(assistBestKey('kdfw_35c_final', 'bogus')).toBe('kdfw_35c_final');
  });
});
