// No-flap landing lesson (ticket 0210, src/noFlap.js): the mission and its stuck lever, the approach band, the coach's
// words, the widened zone and the grade, driven with synthetic traces. The flown lesson is tests/flight/noFlap.test.js.
import { describe, it, expect } from 'vitest';
import {
  createNoFlap, noFlapStep, noFlapPrompt, noFlapResult, flaps30RollFt, APPROACH_KTS, BAND_LOW_KTS, BAND_HIGH_KTS, STUCK_FLAPS,
  STALL_UP_KTS, STALL_30_KTS, ZONE_PTS, CAP_B, CAP_C, DONE_NOTE, SAY_S, NO_FLAP_KEY, NF_TEXT,
} from '../../src/noFlap.js';
import { gradeLanding, capBounced, ZONE_FULL_M } from '../../src/landing.js';
import { stallSpeedKts } from '../../src/aero.js';
import { autoConfigure } from '../../src/assists.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { coachText, RANK } from '../../src/coach.js';
import { landingTip } from '../../src/landingTip.js';
import { runwayEnd } from '../../src/airports.js';
import { MISSIONS, missionByKey, groupMissions, RECOMMENDED_KEY } from '../../src/missions.js';
import { M_TO_FT } from '../../src/constants.js';

const END = runwayEnd('KADS', '16');
const FT = 1 / M_TO_FT;
const c172 = AIRCRAFT_DATABASE.c172;
// The approach from 900 ft at kts to the touchdown at tdM (tdKts), then a roll of rollFt over 15 s to the stop.
function flown({ kts = 70, tdM = 330, tdKts = 62, rollFt = 800, wx = null, off = false } = {}) {
  const nf = createNoFlap(END), dt = 1 / 30;
  const s = { alongM: -6000, crossM: 0, aglFt: 900, vsFpm: -350, iasKts: kts, onGround: false, gsKts: kts, wx };
  for (let ft = 900; ft > 0; ft -= 10 * dt) { s.aglFt = ft; s.alongM = -ft / Math.tan(3 * Math.PI / 180) * FT; noFlapStep(nf, s, dt); }
  Object.assign(s, { onGround: true, aglFt: 0, alongM: tdM, iasKts: tdKts, gsKts: tdKts });
  noFlapStep(nf, s, dt);
  for (let t = 0; t < 30 && !nf.stopped; t += dt) {
    s.alongM = off ? tdM + t * 40 : tdM + rollFt * FT * Math.min(1, t / 15);
    s.gsKts = off ? 40 : Math.max(0, tdKts * (1 - t / 15));
    if (off) s.crossM = t > 3 ? 40 : 0;
    noFlapStep(nf, s, dt);
  }
  return nf;
}
const grade = (tdM, extra = {}) => gradeLanding({ vsFpm: -150, crossM: 0.5, pastThresholdM: tdM, runwayLengthM: END.lengthM - END.displacedM,
  runwayWidthM: END.widthM, pitchDeg: 6, bankDeg: 0, iasKts: 62, vrefKts: c172.vrefKts, ...extra });

describe('the mission', () => {
  it('a Cessna 4 NM final to Addison 16, flaps 0 at 70 (POH: 65-75 flaps up), in the Drills group, not Kid\'s first flight', () => {
    const m = missionByKey(NO_FLAP_KEY);
    expect(m.key).toBe(NO_FLAP_KEY);
    expect(m).toMatchObject({ kind: 'final', airport: 'KADS', rwy: '16', distNm: 4, aircraft: 'c172', kias: APPROACH_KTS, flaps: STUCK_FLAPS, noFlap: true });
    expect(STUCK_FLAPS).toBe(0);
    expect(groupMissions(MISSIONS).find((g) => g.id === 'drills').missions.map((x) => x.key)).toContain(NO_FLAP_KEY);
    expect(groupMissions(MISSIONS).find((g) => g.id === 'KADS').missions.map((x) => x.key)).not.toContain(NO_FLAP_KEY);
    expect(RECOMMENDED_KEY).not.toBe(NO_FLAP_KEY);
  });

  it('the stall speeds it scores against are the model\'s (POH Fig. 5-3 calibrated: flaps up 48 KIAS = 53 KCAS, flaps 30 40 = 48)', () => {
    expect(STALL_UP_KTS).toBeCloseTo(stallSpeedKts(c172, 0), 0);
    expect(STALL_30_KTS).toBeCloseTo(stallSpeedKts(c172, 3), 0);
  });

  it('the band is the POH\'s flaps-up 65-75 widened to the ACS\'s +10/-5: 65-80', () => {
    expect(APPROACH_KTS - BAND_LOW_KTS).toBe(65);
    expect(APPROACH_KTS + BAND_HIGH_KTS).toBe(80);
  });
});

describe('the stuck lever', () => {
  it('the assists\' flaps (Kid) would set landing flaps on this final; main.js holds them at the stuck notch', () => {
    // autoConfigure is what main.js overrides (assists.js): on the lesson's descent it asks for landing flaps.
    const cfg = { gearDown: true, flapsIndex: 0 };
    autoConfigure(c172, { aglFt: 800, iasKts: 70, vsiFpm: -400, onGround: false, vel: { y: -2 } }, cfg);
    expect(cfg.flapsIndex).toBeGreaterThan(STUCK_FLAPS); // so the override in main.js is needed (tests/e2e/noFlap.spec.js presses F)
  });
});

describe('the approach band, the float and the stop', () => {
  it('flown at 70: inside the band, stopped on the runway', () => {
    const nf = flown();
    expect(nf.slowOut).toBe(false);
    expect(nf.fastOut).toBe(false);
    expect(nf.stopped).toBe(true);
    expect(nf.off).toBe(false);
    expect((nf.stopM - nf.tdM) * M_TO_FT).toBeGreaterThan(740);
  });

  it('flown at the flaps-30 speed (61): too slow for no flaps', () => {
    const nf = flown({ kts: 61 });
    expect(nf.slowOut).toBe(true);
    expect(nf.minKts).toBeCloseTo(61, 5);
  });

  it('flown at 85: over the band', () => {
    expect(flown({ kts: 85 }).fastOut).toBe(true);
  });

  it('a gusty day widens the top by half the gust spread', () => {
    expect(flown({ kts: 85, wx: { windKts: 10, gustKts: 22 } }).fastOut).toBe(false);
  });

  it('a go-around past 600 ft starts the next approach fresh', () => {
    const nf = flown({ kts: 61 });
    noFlapStep(nf, { alongM: 2000, crossM: 0, aglFt: 120, vsFpm: 800, iasKts: 70, onGround: false, gsKts: 70, wx: null }, 0.1);
    expect(nf.tdM).toBeNull();
    noFlapStep(nf, { alongM: 4000, crossM: 0, aglFt: 650, vsFpm: 600, iasKts: 70, onGround: false, gsKts: 70, wx: null }, 0.1);
    expect(nf.slowOut).toBe(false);
  });
});

describe('the grade', () => {
  it('the zone never penalises the float: full marks to 750 m, where landing.js\'s ends at 600', () => {
    expect(ZONE_PTS[2][0]).toBe(ZONE_FULL_M[1] + 150);
    for (const tdM of [150, 330, 500, 650, 750]) {
      const r = noFlapResult(grade(Math.min(tdM, 600)), flown({ tdM }));
      expect(r.factors.find((f) => f.key === 'zone').score).toBe(100);
    }
    expect(grade(700).factors.find((f) => f.key === 'zone').score).toBeLessThan(100); // the plain grade would have
  });

  it('flown at 70 and floated in: A or S, the done note, the roll beside a flaps-30 roll', () => {
    const nf = flown({ tdM: 700 });
    const r = noFlapResult(grade(700), nf);
    expect(['S', 'A']).toContain(r.grade);
    expect(r.note).toBe(DONE_NOTE);
    expect(r.reason).toBeNull();
    const roll = r.factors.find((f) => f.key === 'roll');
    expect(roll.value).toMatch(/^7\d\d ft \(flaps 30 ≈ 6\d\d, \+2\d%\)$/);
    expect(r.refFt).toBeLessThan(r.rollFt);
    expect(r.noFlap).toBe(true);
    expect(r.zoneM).toEqual([150, 750]);
    expect(r.factors[0].key).toBe('zone');
  });

  it('flown at the flaps-30 speed: best grade C, "too slow for no flaps", and the tip says why', () => {
    const r = noFlapResult(grade(330), flown({ kts: 61 }));
    expect(r.score).toBeLessThanOrEqual(CAP_C);
    expect(r.reason).toMatch(/Too slow for no flaps/);
    expect(landingTip(r, {})).toMatch(/70 knots without flaps/);
  });

  it('flown fast: best grade B', () => {
    const r = noFlapResult(grade(330), flown({ kts: 85 }));
    expect(r.score).toBeLessThanOrEqual(CAP_B);
    expect(r.reason).toMatch(/longer float/);
  });

  it('on Kid the autothrottle flies the speed: no speed cap', () => {
    const r = noFlapResult(grade(330), flown({ kts: 61 }), true);
    expect(r.reason).toBeNull();
  });

  it('off the runway rolling: D; a bounce keeps its cap; a crash stays a crash', () => {
    expect(noFlapResult(grade(330), flown({ off: true })).grade).toBe('D');
    expect(noFlapResult(capBounced(grade(330), 1), flown()).score).toBeLessThanOrEqual(CAP_C);
    const crash = grade(330, { vsFpm: -900 });
    expect(noFlapResult(crash, flown())).toBe(crash);
  });

  it('the flaps-30 roll: the same braking from the same margin over the flaps-30 stall (calm: (48/53)² of the roll)', () => {
    expect(flaps30RollFt(1000, 64, 64)).toBeCloseTo(1000 * (STALL_30_KTS / STALL_UP_KTS) ** 2, 0);
    // A headwind: the ground speed is lower, the same indicated difference is a bigger share of it.
    expect(flaps30RollFt(1000, 64, 54)).toBeLessThan(flaps30RollFt(1000, 64, 64));
  });
});

describe('the coach', () => {
  it('briefs, calls slow below 500 ft, and the float', () => {
    const nf = createNoFlap(END);
    const s = { alongM: -6000, crossM: 0, aglFt: 1200, vsFpm: -350, iasKts: 70, onGround: false, gsKts: 70, wx: null };
    noFlapStep(nf, s, 0.1);
    expect(noFlapPrompt(nf, { aglFt: 1200, iasKts: 70 })).toBe('nfBrief');
    expect(noFlapPrompt(nf, { aglFt: 1200, iasKts: 70, kid: true })).toBe('nfKid');
    noFlapStep(nf, s, SAY_S);
    expect(noFlapPrompt(nf, { aglFt: 1200, iasKts: 70 })).toBeNull();
    expect(noFlapPrompt(nf, { aglFt: 400, iasKts: 61 })).toBe('nfSlow');
    expect(noFlapPrompt(nf, { aglFt: 400, iasKts: 68 })).toBeNull();
    Object.assign(s, { alongM: 100, aglFt: 3 });
    noFlapStep(nf, s, 2.5);
    expect(noFlapPrompt(nf, { aglFt: 3, iasKts: 64 })).toBe('nfFloat');
  });

  it('every key has words; the slow call outranks the landing coach\'s papi', () => {
    for (const k of Object.keys(NF_TEXT)) expect(coachText(k)).toBe(NF_TEXT[k]);
    expect(RANK.nfSlow).toBe(2);
  });
});
