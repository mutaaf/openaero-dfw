import { describe, it, expect } from 'vitest';
import { headingBoxTop, HEADING_BOX_H, TAPE_TOP, BELOW_TOP_BAR, takeoffCallTop, TAKEOFF_CALL_H, TAKEOFF_CALL_W, cameraFovDeg, BASE_FOV_DEG, MIN_HFOV_DEG, MAX_FOV_DEG,
  windBoxRect, windArrowDeg, windReadout, nearRunwayForWind, WIND_BOX_W, WIND_BOX_H, fixed1 } from '../../src/hudLayout.js';
import { runwayWindComponents, scenarioWeather } from '../../src/weather.js';
import { runwayEnd } from '../../src/airports.js';

describe('headingBoxTop', () => {
  it('keeps the classic cy - 145 on tall screens (desktop, portrait phone)', () => {
    expect(headingBoxTop(720 / 2)).toBe(720 / 2 - 145);
    expect(headingBoxTop(844 / 2)).toBe(844 / 2 - 145);
  });

  it('drops below the top bar on a phone held sideways (0025)', () => {
    for (const h of [320, 360, 375, 390, 414, 430]) {
      const top = headingBoxTop(h / 2);
      // The top bar (and a coach or alert wrapped to three lines) ends by ~66 px.
      expect(top, `${h}: below the top bar`).toBeGreaterThanOrEqual(70);
      // And above the horizon box the layout keeps free (35% … 65% of the height).
      expect(top + HEADING_BOX_H, `${h}: above the horizon box`).toBeLessThanOrEqual(h * 0.35);
    }
  });

  it('sits above the tapes wherever the phone is at least 375 px tall', () => {
    for (const h of [375, 390, 414, 430, 480, 720, 844]) {
      expect(headingBoxTop(h / 2) + HEADING_BOX_H).toBeLessThanOrEqual(h / 2 + TAPE_TOP);
    }
    expect(BELOW_TOP_BAR).toBe(72);
  });
});

describe('takeoffCallTop (0035)', () => {
  it('sits under the heading box and clear above the horizon on every screen height', () => {
    for (const h of [320, 360, 375, 390, 414, 430, 480, 720, 844, 1180, 1366]) {
      const top = takeoffCallTop(h / 2);
      expect(top, `${h}: under the heading box`).toBeGreaterThanOrEqual(headingBoxTop(h / 2) + HEADING_BOX_H);
      // The horizon is at cy on the roll (pitch 0) and only drops once rotated.
      expect(top + TAKEOFF_CALL_H, `${h}: above the horizon`).toBeLessThanOrEqual(h / 2 - 25);
    }
  });
  it('fits between the speed tape (ends cx - 131) and the altitude tape (starts cx + 130)', () => {
    expect(TAKEOFF_CALL_W / 2).toBeLessThanOrEqual(130 - 8);
  });
});

describe('cameraFovDeg (0044)', () => {
  const hFov = (vDeg, aspect) => 2 * Math.atan(Math.tan((vDeg * Math.PI) / 360) * aspect) * (180 / Math.PI);

  it('keeps the classic 62° on landscape screens (desktop, phone sideways, iPad sideways)', () => {
    for (const [w, h] of [[1280, 720], [1920, 1080], [844, 390], [568, 320], [1180, 820], [1024, 1024]]) {
      expect(cameraFovDeg(w, h), `${w}x${h}`).toBe(BASE_FOV_DEG);
    }
    expect(BASE_FOV_DEG).toBe(62);
  });

  it('opens the vertical FOV in portrait so the view is not a 31° keyhole', () => {
    // At 62° vertical a 390x844 phone saw only 31° across: a crab or a turn put the
    // runway off the side. Portrait keeps at least MIN_HFOV_DEG across, up to the cap.
    for (const [w, h] of [[820, 1180], [768, 1024], [834, 1194], [1024, 1366]]) {
      const v = cameraFovDeg(w, h);
      expect(v, `${w}x${h}`).toBeGreaterThan(BASE_FOV_DEG);
      expect(hFov(v, w / h), `${w}x${h} across`).toBeCloseTo(MIN_HFOV_DEG, 6);
    }
    for (const [w, h] of [[390, 844], [412, 915], [360, 800], [430, 932], [320, 568]]) {
      const v = cameraFovDeg(w, h);
      expect(v, `${w}x${h}`).toBe(MAX_FOV_DEG);
      expect(hFov(v, w / h), `${w}x${h} across`).toBeGreaterThan(40);
    }
  });

  it('never narrows or exceeds the cap, and grows monotonically as the screen gets taller', () => {
    let prev = 0;
    for (let aspect = 2.5; aspect >= 0.3; aspect -= 0.01) {
      const v = cameraFovDeg(1000 * aspect, 1000);
      expect(v).toBeGreaterThanOrEqual(BASE_FOV_DEG);
      expect(v).toBeLessThanOrEqual(MAX_FOV_DEG);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('tolerates a zero-sized window (returns the base FOV)', () => {
    expect(cameraFovDeg(0, 0)).toBe(BASE_FOV_DEG);
    expect(cameraFovDeg(390, 0)).toBe(BASE_FOV_DEG);
  });
});

describe('wind readout (0075)', () => {
  const SCREENS = [[1280, 720], [1920, 1080], [390, 844], [412, 915], [360, 800], [375, 667], [320, 568],
    [844, 390], [568, 320], [640, 360], [667, 375], [932, 430], [820, 1180], [1180, 820], [1024, 1366]];
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it('sits on screen, under the top bar, clear of the tapes, the heading box and the horizon band', () => {
    for (const [w, h] of SCREENS) {
      const r = windBoxRect(w, h);
      const cx = w / 2, cy = h / 2;
      expect(r.w).toBe(WIND_BOX_W);
      expect(r.h).toBe(WIND_BOX_H);
      expect(r.x, `${w}x${h} left`).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w, `${w}x${h} right`).toBeLessThanOrEqual(w);
      expect(r.y, `${w}x${h} under the top bar`).toBeGreaterThanOrEqual(BELOW_TOP_BAR);
      const tapes = [{ x: cx - 175, y: cy - 90, w: 44, h: 180 }, { x: cx + 130, y: cy - 90, w: 56, h: 180 }];
      for (const t of tapes) expect(overlaps(r, t), `${w}x${h} vs a tape`).toBe(false);
      const hdg = { x: cx - 52, y: headingBoxTop(cy), w: 104, h: HEADING_BOX_H };
      expect(overlaps(r, hdg), `${w}x${h} vs the heading box`).toBe(false);
      const call = { x: cx - TAKEOFF_CALL_W / 2, y: takeoffCallTop(cy), w: TAKEOFF_CALL_W, h: TAKEOFF_CALL_H };
      // On a 320 px phone the 232 px call reaches the box's corner; it is drawn on top, for its 2 s.
      if (w >= 360) expect(overlaps(r, call), `${w}x${h} vs the takeoff call`).toBe(false);
      const horizon = { x: w * 0.3, y: h * 0.35, w: w * 0.4, h: h * 0.3 };
      expect(overlaps(r, horizon), `${w}x${h} vs the horizon band`).toBe(false);
    }
  });

  it('writes into the object it is given (no per-frame allocation)', () => {
    const out = { x: 0, y: 0, w: 0, h: 0 };
    expect(windBoxRect(1280, 720, out)).toBe(out);
    const o = {};
    expect(windReadout({ windDirDeg: 80, windKts: 10, gustKts: 10, live: true }, null, o)).toBe(o);
  });

  // Ticket 0108: "WET RWY" only with a wet METAR; a dry one and the scenario say what they did.
  it('a wet METAR heads the box WET RWY; dry and scenario weather keep their source', () => {
    const o = {};
    expect(windReadout({ windDirDeg: 80, windKts: 10, gustKts: 10, live: true, wetRunway: true }, null, o).source).toBe('WET RWY');
    expect(o.wet).toBe(true);
    expect(windReadout({ windDirDeg: 80, windKts: 10, gustKts: 10, live: true, wetRunway: false }, null, o).source).toBe('METAR WIND');
    expect(o.wet).toBe(false);
    expect(windReadout({ windDirDeg: 80, windKts: 10, gustKts: 10, live: false }, null, o).source).toBe('SCENARIO');
  });

  it('the arrow points where the wind blows, relative to the nose', () => {
    expect(windArrowDeg(350, 10, 350)).toBeCloseTo(180); // on the nose: blows at you
    expect(windArrowDeg(80, 10, 0)).toBeCloseTo(260); // from the right: blows to the left
    expect(windArrowDeg(170, 10, 350)).toBeCloseTo(0); // tailwind: blows the way you fly
    expect(windArrowDeg(null, 10, 0)).toBeNull(); // variable
    expect(windArrowDeg(80, 1, 0)).toBeNull(); // calm
  });

  it('350° at 10 kt on KDFW 35C is almost all headwind (METAR winds are true; 35C is 000.3° true)', () => {
    const end = runwayEnd('KDFW', '35C');
    const wx = { windDirDeg: 350, windKts: 10, gustKts: 10, live: true };
    const r = windReadout(wx, runwayWindComponents(wx.windDirDeg, wx.windKts, end.hdgT));
    expect(r.hwKts).toBe(10);
    expect(Math.abs(r.xwKts)).toBeLessThanOrEqual(2);
    expect(r.xw).toBe('XW 2L');
    expect(r.hw).toBe('HW 10');
    expect(r.speed).toBe('350/10');
    expect(r.source).toBe('METAR WIND');
  });

  it('080° at 10 kt on 35C is 10 kt from the right; on the reciprocal 17C, from the left with a tailwind', () => {
    const wx = { windDirDeg: 80, windKts: 10, gustKts: null, live: true };
    const on35 = windReadout(wx, runwayWindComponents(80, 10, runwayEnd('KDFW', '35C').hdgT));
    expect(on35.xwKts).toBe(10);
    expect(on35.xw).toBe('XW 10R');
    const on17 = windReadout(wx, runwayWindComponents(80, 10, runwayEnd('KDFW', '17C').hdgT));
    expect(on17.xw).toBe('XW 10L');
    expect(on17.hw).toMatch(/^(HW|TW) [0-2]$/);
    const tail = windReadout({ windDirDeg: 170, windKts: 8, live: true }, runwayWindComponents(170, 8, runwayEnd('KDFW', '35C').hdgT));
    expect(tail.hw).toBe('TW 8');
  });

  it('shows gusts, variable wind and calm honestly, and says when the weather is not live', () => {
    expect(windReadout({ windDirDeg: 180, windKts: 12, gustKts: 22, live: true }, null).speed).toBe('180/12G22');
    const vrb = windReadout({ windDirDeg: null, windKts: 4, gustKts: null, live: true }, { headwindKts: 0, crosswindKts: 0 });
    expect(vrb.speed).toBe('VRB/4');
    expect(windArrowDeg(vrb.dirDeg, vrb.kts, 0)).toBeNull();
    expect(vrb.xw).toBe(''); // no direction, no components
    const calm = windReadout({ windDirDeg: 180, windKts: 1, live: true }, { headwindKts: 1, crosswindKts: 0 });
    expect(calm.calm).toBe(true);
    expect(calm.speed).toBe('CALM');
    expect(calm.xw).toBe('');
    // 1.6 kt rounds to 2: then it is not calm, and the arrow shows too (one cut-off for both).
    const two = windReadout({ windDirDeg: 90, windKts: 1.6, live: true }, null);
    expect(two.calm).toBe(false);
    expect(windArrowDeg(two.dirDeg, 1.6, 0)).not.toBeNull();
    expect(windArrowDeg(90, 1.4, 0)).toBeNull();
    expect(windReadout(scenarioWeather(), null).source).toBe('SCENARIO');
  });

  it('shows components only on (or lined up for) the runway, low down', () => {
    const L = 4085;
    expect(nearRunwayForWind({ distM: 7400, crossM: 20 }, L, 1200)).toBe(true); // 4 NM final
    expect(nearRunwayForWind({ distM: -60, crossM: 0 }, L, 8)).toBe(true); // takeoff roll
    expect(nearRunwayForWind({ distM: -L + 100, crossM: 5 }, L, 300)).toBe(true); // climbing out over it
    expect(nearRunwayForWind({ distM: 7400, crossM: 20 }, L, 1600)).toBe(false); // too high
    expect(nearRunwayForWind({ distM: 37000, crossM: 0 }, L, 1000)).toBe(false); // 20 NM out
    expect(nearRunwayForWind({ distM: -L - 2000, crossM: 0 }, L, 900)).toBe(false); // departed, 2 km past the end
    expect(nearRunwayForWind({ distM: 5000, crossM: 4000 }, L, 1000)).toBe(false); // off to the side
  });

  it('every line fits the box (bold 10 px monospace is ~6 px a character)', () => {
    const r = windReadout({ windDirDeg: 80, windKts: 35, gustKts: 48, live: true }, { headwindKts: -25, crosswindKts: 34 });
    expect(r.speed).toBe('080/35G48');
    const vrb = windReadout({ windDirDeg: null, windKts: 12, gustKts: 25, live: true }, null);
    expect(vrb.speed).toBe('VRB/12G25');
    // The speed line spans the box; XW/HW sit right of the arrow.
    for (const s of [r.speed, vrb.speed]) expect(s.length * 6, s).toBeLessThanOrEqual(WIND_BOX_W - 6);
    for (const s of [r.xw, r.hw]) expect(s.length * 6, s).toBeLessThanOrEqual(WIND_BOX_W - 24);
    expect(windReadout(scenarioWeather(), null).source.length * 5.5).toBeLessThanOrEqual(WIND_BOX_W - 4);
    expect('METAR WIND'.length * 5.5).toBeLessThanOrEqual(WIND_BOX_W - 4);
  });
});

describe('fixed1', () => {
  // A parked airplane's AoA wobbles around zero; "-0.0°" and "0.0°" took turns on the
  // top bar and shifted its whole right-aligned line (main went red on surfaces.spec).
  it('never prints a negative zero', () => {
    for (const v of [-0, -0.0001, -0.04, -0.049]) expect(fixed1(v)).toBe('0.0');
    expect(fixed1(0.04)).toBe('0.0');
  });
  it('keeps the sign and one decimal otherwise', () => {
    expect(fixed1(-0.06)).toBe('-0.1');
    expect(fixed1(-12.34)).toBe('-12.3');
    expect(fixed1(15.26)).toBe('15.3');
  });
});

// Ticket 0123: the HUD's localizer and glideslope fly-to bars read in ILS dots (aero.js ilsDots),
// the scale the stabilized gate's "more than 1 dot" is judged on.
import { ilsBarOffsetPx, ILS_PX_PER_DOT, ILS_MAX_DOTS, ILS_BOX_HALF } from '../../src/hudLayout.js';
import { ilsDots, LOC_DOT_DEG, GS_DOT_DEG } from '../../src/aero.js';

describe('ilsBarOffsetPx (0123)', () => {
  it('draws zero error through the centre and one dot on one tick', () => {
    expect(ilsBarOffsetPx(0)).toBe(0);
    expect(ilsBarOffsetPx(1)).toBe(ILS_PX_PER_DOT);
    expect(ilsBarOffsetPx(-1)).toBe(-ILS_PX_PER_DOT);
    expect(ilsBarOffsetPx(0.5)).toBeCloseTo(ILS_PX_PER_DOT / 2, 9);
  });

  it('is symmetric and clamps at full scale (2 dots: 2.5° localizer, 0.7° glideslope, AIM 1-1-9)', () => {
    expect(ILS_MAX_DOTS).toBe(2);
    expect(ILS_MAX_DOTS * LOC_DOT_DEG).toBeCloseTo(2.5, 9);
    expect(ILS_MAX_DOTS * GS_DOT_DEG).toBeCloseTo(0.7, 9);
    for (const d of [0.3, 1.7, 2, 3, 40]) expect(ilsBarOffsetPx(-d)).toBe(-ilsBarOffsetPx(d));
    expect(ilsBarOffsetPx(2)).toBe(ILS_MAX_DOTS * ILS_PX_PER_DOT);
    expect(ilsBarOffsetPx(7)).toBe(ILS_MAX_DOTS * ILS_PX_PER_DOT);
    expect(ilsBarOffsetPx(-1e6)).toBe(-ILS_MAX_DOTS * ILS_PX_PER_DOT);
  });

  it('never leaves the 140 px crosshair box, and a bad input draws centred', () => {
    expect(ILS_BOX_HALF).toBe(70);
    expect(ILS_MAX_DOTS * ILS_PX_PER_DOT).toBeLessThan(ILS_BOX_HALF);
    expect(ilsBarOffsetPx(NaN)).toBe(0);
    expect(ilsBarOffsetPx(Infinity)).toBe(ILS_MAX_DOTS * ILS_PX_PER_DOT);
  });

  it('is a function of the angle only: the same angular error is the same offset at 4 NM and 1 NM', () => {
    const nm = 1852;
    for (const deg of [0.1, 0.35, 0.6]) {
      const off = (distM) => ilsBarOffsetPx(ilsDots(Math.tan(deg * Math.PI / 180) * distM, distM, GS_DOT_DEG));
      expect(off(4 * nm)).toBeCloseTo(off(1 * nm), 9);
    }
    // ...and the same 100 m off the centreline is much more of a dot at 1 NM than at 4 NM.
    const loc = (distM) => ilsBarOffsetPx(ilsDots(100, distM, LOC_DOT_DEG));
    expect(loc(1 * nm + 3300)).toBeGreaterThan(loc(4 * nm + 3300) * 1.8);
  });
});
