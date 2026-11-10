// Ticket 0092: the low-ceiling ILS mission's scripted weather and its decision height.
import { describe, it, expect } from 'vitest';
import {
  flightCategory, lowIfrWeather, WX, LOW_IFR_REPORT, DH_FT, DH_PROMPT_S, createDh, dhStep, dhPrompt, cloudFog,
} from '../../src/lowIfr.js';
import { coachText, coachTarget } from '../../src/coach.js';
import { buildAtis } from '../../src/atis.js';
import { isImc } from '../../src/aero.js';
import { missionByKey, groupMissions, MISSIONS } from '../../src/missions.js';
import { windReadout, WIND_BOX_W } from '../../src/hudLayout.js';
import { fogDensityForVisibility } from '../../src/weather.js';
import { runwayEnd, AIM_POINT_M } from '../../src/airports.js';
import { M_TO_FT, FT_TO_M } from '../../src/constants.js';

describe('flight category (AIM 7-1-7)', () => {
  it('LIFR under 500 ft or 1 SM, IFR 500 to under 1,000 ft or 1 to under 3 SM, MVFR to 3,000 ft / 5 SM inclusive', () => {
    expect(flightCategory(400, 10)).toBe('LIFR');
    expect(flightCategory(null, 0.75)).toBe('LIFR');
    expect(flightCategory(499, 10)).toBe('LIFR');
    expect(flightCategory(500, 10)).toBe('IFR');
    expect(flightCategory(999, 10)).toBe('IFR');
    expect(flightCategory(null, 1)).toBe('IFR');
    expect(flightCategory(null, 2.99)).toBe('IFR');
    expect(flightCategory(1000, 10)).toBe('MVFR');
    expect(flightCategory(3000, 10)).toBe('MVFR');
    expect(flightCategory(null, 3)).toBe('MVFR');
    expect(flightCategory(null, 5)).toBe('MVFR');
    expect(flightCategory(3100, 6)).toBe('VFR');
    expect(flightCategory(null, 10)).toBe('VFR');
    // The worse of the two decides ("and/or").
    expect(flightCategory(5000, 0.5)).toBe('LIFR');
    expect(flightCategory(800, 4)).toBe('IFR');
  });
});

describe('the scripted low-IFR report', () => {
  it('parses to 2 SM, a 400 ft broken ceiling under an 800 ft overcast, 350/12, LIFR, dry, never live', () => {
    const wx = lowIfrWeather();
    expect(wx.raw).toMatch(/^SCENARIO KDFW 35012KT 2SM BR BKN004 OVC008 /);
    expect(wx.live).toBe(false);
    expect(wx.visibilitySm).toBe(2);
    expect(wx.ceilingFt).toBe(400);
    expect(wx.ceilingCover).toBe('BKN');
    expect(wx.cloudLayers).toEqual([{ cover: 'BKN', baseFt: 400, coverage: 0.75 }, { cover: 'OVC', baseFt: 800, coverage: 1 }]);
    expect(wx.windDirDeg).toBe(350);
    expect(wx.windKts).toBe(12);
    expect(wx.gustKts).toBe(12);
    expect(wx.fltCat).toBe('LIFR');
    expect(wx.wetRunway).toBe(false); // mist is not rain
    expect(wx.altimInHg).toBeCloseTo(29.92, 2);
    expect(WX).toEqual(wx); // one object for the run
    // The parsed groups say what the raw report says.
    expect(LOW_IFR_REPORT.rawOb).toContain(`${LOW_IFR_REPORT.wdir}${String(LOW_IFR_REPORT.wspd).padStart(2, '0')}KT`);
  });

  it('is instrument weather: the stabilized gate moves to 1,000 ft', () => {
    expect(isImc(WX)).toBe(true);
  });

  it('hides the runway from the spawn and shows it under the ceiling (fog at 2 SM)', () => {
    // fogDensityForVisibility puts ~90% fog at the visibility (2 SM = 3.2 km): exp(-(d·k)²).
    const k = fogDensityForVisibility(WX.visibilitySm);
    const fog = (m) => 1 - Math.exp(-((m * k) ** 2));
    expect(fog(5 * 1852)).toBeGreaterThan(0.99); // 5 NM out, even with no cloud in the way
    // At the 200 ft decision height on the 3° path the threshold is ~0.86 km ahead (the aim point ~1.16 km):
    // under a third fogged, so the lights read; breaking out at 400 ft the aim point is ~2.3 km off, ~70%.
    const pathM = (ft) => (ft * FT_TO_M) / Math.tan(3 * Math.PI / 180);
    expect(fog(pathM(DH_FT) - AIM_POINT_M)).toBeLessThan(0.3);
    expect(fog(pathM(400))).toBeLessThan(0.75);
  });

  it('says LIFR on the HUD wind box, in its width, and scenario, never METAR', () => {
    const r = windReadout(WX, null);
    expect(r.source).toBe('LIFR SCN');
    expect(r.live).toBe(false);
    expect(r.source.length * 5.5).toBeLessThanOrEqual(WIND_BOX_W - 4);
    expect('LIFR METAR'.length * 5.5).toBeLessThanOrEqual(WIND_BOX_W - 4);
    expect(windReadout({ ...WX, live: true }, null).source).toBe('LIFR METAR');
    expect(windReadout({ ...WX, fltCat: 'IFR', live: true }, null).source).toBe('IFR METAR');
    expect(windReadout({ ...WX, fltCat: 'MVFR', live: true }, null).source).toBe('METAR WIND');
    expect(windReadout({ ...WX, fltCat: 'VFR' }, null).source).toBe('SCENARIO');
    expect(windReadout({ ...WX, wetRunway: true }, null).source).toBe('WET RWY');
  });
});

describe('the mission', () => {
  it('is a 5 NM final on KDFW 35C, in its own Weather group after the airports', () => {
    const m = missionByKey('kdfw_35c_low_ifr');
    expect(m).toMatchObject({ key: 'kdfw_35c_low_ifr', kind: 'final', airport: 'KDFW', rwy: '35C', distNm: 5, lowIfr: true });
    const groups = groupMissions(MISSIONS);
    const ids = groups.map((g) => g.id);
    expect(ids.indexOf('weather')).toBe(ids.indexOf('KGKY') + 1);
    expect(groups.find((g) => g.id === 'weather').missions.map((x) => x.key)).toEqual(['kdfw_35c_low_ifr']);
    expect(groups.find((g) => g.id === 'KDFW').missions.some((x) => x.key === 'kdfw_35c_low_ifr')).toBe(false);
  });

  it('spawns above the overcast: 5 NM on the 3° path is ~1,600 ft over the threshold', () => {
    const hFt = 5 * 1852 * Math.tan(3 * Math.PI / 180) * M_TO_FT;
    expect(hFt).toBeGreaterThan(800 + 500);
  });
});

describe('decision height (FAA P/CG ILS Category I: 200 ft above touchdown)', () => {
  const end = runwayEnd('KDFW', '35C');
  const sim = (hatFt, o = {}) => ({
    activeEnd: end, onGround: false, simTime: 0, gearDown: true, vsiFpm: -700, raFt: hatFt - 6, throttle: 0.3, flapsIndex: 2, spec: { fixedGear: false }, pos: { y: end.thrY + hatFt * FT_TO_M }, vel: { y: -3.5 },
    approach: { distM: (hatFt * FT_TO_M) / Math.tan(3 * Math.PI / 180) - 300 }, ...o,
  });

  it('calls once, descending through 200 ft on the final, swept by 1 ft and by 12 ft a frame', () => {
    expect(DH_FT).toBe(200);
    for (const stepFt of [1, 12]) {
      const st = createDh();
      const fired = [];
      for (let h = 1600; h >= 0; h -= stepFt) if (dhStep(st, sim(h, { simTime: 1600 - h }))) fired.push(h);
      expect(fired.length, `step ${stepFt}`).toBe(1);
      expect(fired[0]).toBeLessThanOrEqual(200);
      expect(fired[0]).toBeGreaterThan(200 - stepFt);
      expect(st.calls).toBe(1);
    }
  });

  it('never calls climbing, on the ground, past the threshold or with no runway', () => {
    const st = createDh();
    dhStep(st, sim(400));
    expect(dhStep(st, sim(190, { vel: { y: 2 } }))).toBe(false);
    expect(dhStep(st, sim(190, { onGround: true }))).toBe(false);
    expect(dhStep(st, sim(190, { approach: { distM: -50 } }))).toBe(false);
    expect(dhStep(st, sim(190, { activeEnd: null }))).toBe(false);
    expect(dhStep(st, sim(190))).toBe(true);
  });

  it('is not armed by a spawn under it, holds through a bump, and re-arms 100 ft above it (a second approach)', () => {
    const low = createDh();
    expect(dhStep(low, sim(150))).toBe(false); // never above: no call
    const st = createDh();
    dhStep(st, sim(500));
    expect(dhStep(st, sim(199))).toBe(true);
    dhStep(st, sim(260, { vel: { y: 1 } })); // a balloon
    expect(dhStep(st, sim(195))).toBe(false);
    dhStep(st, sim(320, { vel: { y: 5 } })); // went around
    expect(dhStep(st, sim(198))).toBe(true);
    expect(st.calls).toBe(2);
  });

  it('the coach asks for the decision for 5 s after the call, in the air; Kid hears the lights are there', () => {
    const st = createDh();
    expect(dhPrompt(st, sim(250), false)).toBeNull();
    dhStep(st, sim(400, { simTime: 10 }));
    dhStep(st, sim(199, { simTime: 20 }));
    expect(dhPrompt(st, sim(180, { simTime: 21 }), false)).toBe('dh');
    expect(dhPrompt(st, sim(180, { simTime: 21 }), true)).toBe('dhKid');
    expect(dhPrompt(st, sim(100, { simTime: 20 + DH_PROMPT_S + 0.1 }), false)).toBeNull();
    expect(dhPrompt(st, sim(0, { simTime: 22, onGround: true }), false)).toBeNull();
    // It hands the card back at once to what matters more (as s.ds it would outrank them in coachTarget).
    expect(dhPrompt(st, sim(180, { simTime: 21, gearDown: false }), false)).toBeNull();
    expect(dhPrompt(st, sim(180, { simTime: 21, vsiFpm: -1500 }), false)).toBeNull();
    expect(dhPrompt(st, sim(105, { simTime: 23, raFt: 95 }), true)).toBeNull();
    expect(coachText('dh')).toMatch(/minimums/i);
    expect(coachText('dh')).toMatch(/go around/i);
    expect(coachText('dhKid')).toMatch(/let the plane land/i);
    // Fed as s.ds it takes the card over the path prompts; the autopilot keeps the coach quiet.
    expect(coachTarget({ aglFt: 190, vsiFpm: -700, papiWhite: 0, throttle: 0.3, onGround: false, ds: 'dh' })).toBe('dh');
    expect(coachTarget({ aglFt: 190, vsiFpm: -700, papiWhite: 2, throttle: 0.3, onGround: false, ds: 'dh', autopilot: true })).toBeNull();
  });

  it('a missed approach at minimums: the coach flies the climb-out with you, then says how to try again', () => {
    const st = createDh();
    dhStep(st, sim(400, { simTime: 10 }));
    dhStep(st, sim(199, { simTime: 20 }));
    expect(st.missed).toBe(false);
    // Full power, climbing: the missed approach starts (not a landing's balloon at part power).
    dhStep(st, sim(190, { simTime: 21, vel: { y: 1 }, throttle: 0.5 }));
    expect(st.missed).toBe(false);
    dhStep(st, sim(190, { simTime: 21, vel: { y: 1 }, throttle: 1 }));
    expect(st.missed).toBe(true);
    const at = (hatFt, o) => dhPrompt(st, sim(hatFt, { simTime: 60, vel: { y: 3 }, vsiFpm: 600, throttle: 1, ...o }), false);
    expect(at(200, { throttle: 0.6 })).toBe('maPower');
    expect(at(200, { vsiFpm: -100 })).toBe('maPitch');
    expect(at(300)).toBe('maFlaps'); // never "you're high: ease the nose down" on the way up
    expect(at(400, { flapsIndex: 1 })).toBe('maGear');
    expect(at(400, { flapsIndex: 1, spec: { fixedGear: true } })).toBe('maClimb'); // the Cessna has no gear to raise
    expect(at(800, { flapsIndex: 1, gearDown: false })).toBe('maClimb');
    expect(at(1600, { flapsIndex: 1, gearDown: false })).toBe('maDone');
    expect(dhPrompt(st, sim(400, { simTime: 60 }), true)).toBeNull(); // Kid's plane lands itself
    expect(coachText('maDone')).toMatch(/RESET/);
    expect(coachText('maPower', { touch: true })).toMatch(/throttle/);
    expect(coachText('maPitch', { touch: true })).toMatch(/stick up/);
    // A second approach: the call clears it.
    dhStep(st, sim(320, { simTime: 90, vel: { y: 3 }, throttle: 1 }));
    expect(dhStep(st, sim(198, { simTime: 120 }))).toBe(true);
    expect(st.missed).toBe(false);
  });
});

describe('in the cloud (BKN004 OVC008: no view of the ground until the break-out)', () => {
  it('fog thickens to ~120 m above the 400 ft base and is the report\'s 2 SM below it', () => {
    const clear = fogDensityForVisibility(2), cloud = 1.517 / 120;
    expect(cloudFog(0)).toBeCloseTo(clear, 9);
    expect(cloudFog(370)).toBeCloseTo(clear, 9);
    expect(cloudFog(450)).toBeCloseTo(cloud, 9);
    expect(cloudFog(1600)).toBeCloseTo(cloud, 9);
    expect(cloudFog(410)).toBeGreaterThan(clear);
    expect(cloudFog(410)).toBeLessThan(cloud);
    // ~90% fog at 120 m: the runway from 750 ft on the path (~2.2 NM) is gone.
    expect(1 - Math.exp(-((4000 * cloudFog(750)) ** 2))).toBeGreaterThan(0.999);
  });

  it('the ATIS-style briefing calls it this mission\'s scenario, not offline', () => {
    const a = buildAtis(WX, runwayEnd('KDFW', '35C'), { nowMs: 0 });
    expect(a.live).toBe(false);
    expect(a.source).toMatch(/SCENARIO weather \(this mission's\)/);
    expect(a.source).not.toMatch(/offline/);
  });
});
