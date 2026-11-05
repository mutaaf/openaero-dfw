import { describe, it, expect } from 'vitest';
import { baroLabel, baroSource, baroRect, drawAltCaption, gateVerdictRect, TOUCH_DECK_H, BARO_W, BARO_H } from '../../src/gateVerdict.js';
import { altCaptionRect, windBoxRect, windReadout, ALT_TAPE_X, SPEED_TAPE_X, TAPE_TOP } from '../../src/hudLayout.js';
import { parseMetar, scenarioWeather } from '../../src/weather.js';

// Ticket 0146: the altimeter setting under the altitude tape, the number physics flies on
// (main.js refreshWeather: sim.altimInHg = sim.wx.altimInHg), "30.11 IN" over its source line.
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('baroLabel and baroSource (0146)', () => {
  it('two decimals and IN', () => {
    expect(baroLabel(30.109, 'METAR', {})).toMatchObject({ text: '30.11 IN', src: 'METAR' });
    expect(baroLabel(30, 'SCENARIO', {}).text).toBe('30.00 IN');
    expect(baroLabel(29.905, 'METAR', {}).text).toBe('29.91 IN');
    expect(baroLabel(28.5, 'METAR', {}).text).toBe('28.50 IN');
  });
  it('the source: METAR only when a live METAR gave the number', () => {
    const m = { icaoId: 'KDFW', altim: 1019.6, wdir: 180, wspd: 5, temp: 24, visib: '10+', rawOb: 'METAR KDFW 161953Z 18005KT 10SM A3011' };
    const wx = parseMetar(m);
    expect(baroLabel(wx.altimInHg, baroSource(wx), {})).toMatchObject({ text: '30.11 IN', src: 'METAR' }); // A3011 = 1019.6 hPa
    // A live METAR without an altimeter group: weather.js flies 29.92, which the METAR never said.
    const noAltim = parseMetar({ ...m, altim: undefined });
    expect(noAltim.altimInHg).toBe(29.92);
    expect(baroSource(noAltim)).toBe('STANDARD');
    expect(baroSource(parseMetar({ ...m, altim: NaN }))).toBe('STANDARD'); // typeof NaN is 'number'
    // No reading at 0.1 hPa converts to exactly the 29.92 literal, so a real report is never STANDARD.
    for (let hpa = 9300; hpa <= 10700; hpa++) expect(baroSource(parseMetar({ ...m, altim: hpa / 10 }))).toBe('METAR');
    expect(baroSource(scenarioWeather())).toBe('SCENARIO');
    expect(baroSource(undefined)).toBe('SCENARIO');
  });
  it('builds its strings only when the value or source changes (nothing allocated per frame)', () => {
    const out = {};
    const t = baroLabel(30.02, 'METAR', out).text;
    expect(baroLabel(30.0204, 'METAR', out)).toBe(out);
    expect(out.text).toBe(t);
    baroLabel(30.03, 'METAR', out);
    expect(out.text).toBe('30.03 IN');
    baroLabel(30.03, 'SCENARIO', out);
    expect(out.src).toBe('SCENARIO');
  });
});

describe('baroRect (0146)', () => {
  for (const [w, h] of [[1280, 720], [390, 844], [844, 390], [820, 1180], [1180, 820], [430, 932], [568, 320], [375, 812]]) {
    it(`${w}x${h}: under the altitude tape, on screen, off the tapes, SPD label, gate verdict, wind box and touch deck`, () => {
      const cx = w / 2, cy = h / 2;
      const r = baroRect(w, h, {});
      expect(r.show).toBe(true);
      expect(r.w).toBe(BARO_W);
      expect(r.h).toBe(BARO_H);
      expect(r.y).toBeGreaterThanOrEqual(cy - TAPE_TOP + 2); // under the tape's foot
      expect(r.x).toBeGreaterThanOrEqual(cx + ALT_TAPE_X - 4); // the tape's column
      expect(r.x + r.w).toBeLessThanOrEqual(w);
      expect(r.y + r.h).toBeLessThanOrEqual(h);
      expect(overlaps(r, { x: cx + ALT_TAPE_X, y: cy + TAPE_TOP, w: 64, h: -2 * TAPE_TOP }), 'altitude tape').toBe(false);
      expect(overlaps(r, { x: cx + SPEED_TAPE_X - 60, y: cy + TAPE_TOP, w: 60, h: -2 * TAPE_TOP }), 'speed tape').toBe(false);
      expect(overlaps(r, { x: cx + SPEED_TAPE_X - 60, y: cy + 96, w: 60, h: 13 }), 'SPD label').toBe(false);
      expect(overlaps(r, gateVerdictRect(w, h, 2, {})), 'gate verdict').toBe(false);
      expect(overlaps(r, windBoxRect(w, h)), 'wind box').toBe(false);
      expect(overlaps(r, altCaptionRect(cx, cy, {})), 'MSL tab').toBe(false);
      if (h > w) expect(r.y + r.h).toBeLessThanOrEqual(h - TOUCH_DECK_H - 40);
    });
  }
  for (const [w, h] of [[390, 664], [375, 548], [360, 640], [320, 568]]) {
    it(`${w}x${h} upright: it would sit in the touch deck, so it is left out`, () => {
      expect(baroRect(w, h, {}).show).toBe(false);
    });
  }
  it('writes into out', () => {
    const out = {};
    expect(baroRect(1280, 720, out)).toBe(out);
  });
});

describe('drawAltCaption draws the setting (0146)', () => {
  const fakeCtx = (w, h) => {
    const calls = [];
    return { calls, canvas: { width: w, height: h }, set font(f) { calls.push(['font', f]); }, set fillStyle(f) { calls.push(['fill', f]); }, fillRect: (...a) => calls.push(['rect', ...a]), fillText: (...a) => calls.push(['text', ...a]) };
  };
  const simFor = (inHg, live, extra = {}) => ({ altimInHg: inHg, wx: { live, altimInHg: inHg }, onGround: false, raFt: 1500, hudWind: windReadout({ windDirDeg: 180, windKts: 5, live }, null), ...extra });
  for (const level of ['pilot']) {
    it(`${level}: "30.11 IN" and METAR in its box, written to hudWind for ?debug`, () => {
      const ctx = fakeCtx(1280, 720), s = simFor(30.109, true);
      drawAltCaption(ctx, altCaptionRect(640, 360, {}), level, 1280, s, windBoxRect(1280, 720));
      const texts = ctx.calls.filter((c) => c[0] === 'text').map((c) => c[1]);
      expect(texts).toContain('30.11 IN');
      expect(texts).toContain('METAR');
      expect(s.hudWind.baro).toBe('30.11 IN');
      expect(s.hudWind.baroSrc).toBe('METAR');
      const b = s.hudWind.baroBox;
      expect(b).toMatchObject(baroRect(1280, 720, {}));
      expect(ctx.calls.some((c) => c[0] === 'rect' && c[1] === b.x && c[2] === b.y && c[3] === b.w && c[4] === b.h)).toBe(true);
      // Every glyph inside the box: fillText's maxWidth no wider than it.
      for (const c of ctx.calls.filter((c) => c[0] === 'text' && (c[1] === '30.11 IN' || c[1] === 'METAR'))) {
        expect(c[2]).toBeGreaterThanOrEqual(b.x);
        expect(c[2] + c[4]).toBeLessThanOrEqual(b.x + b.w);
        expect(c[3]).toBeGreaterThan(b.y);
        expect(c[3]).toBeLessThanOrEqual(b.y + b.h);
      }
    });
  }
  it('the source is the weather the number came from (sim.wx), not the wind box\'s once-a-second copy', () => {
    const ctx = fakeCtx(1280, 720), s = simFor(30.109, true);
    s.hudWind.live = false; // the wind box not yet refreshed
    drawAltCaption(ctx, altCaptionRect(640, 360, {}), 'pilot', 1280, s, windBoxRect(1280, 720));
    expect(s.hudWind.baroSrc).toBe('METAR');
  });
  it('scenario weather says SCENARIO', () => {
    const ctx = fakeCtx(1280, 720), s = simFor(30, false);
    drawAltCaption(ctx, altCaptionRect(640, 360, {}), 'pilot', 1280, s, windBoxRect(1280, 720));
    expect(s.hudWind.baro).toBe('30.00 IN');
    expect(s.hudWind.baroSrc).toBe('SCENARIO');
  });
  it('Kid and Learner have none (plain words on this tape), nor a short upright phone (the deck)', () => {
    for (const [level, w, h] of [['kid', 1280, 720], ['learner', 1280, 720], ['pilot', 375, 548]]) {
      const ctx = fakeCtx(w, h), s = simFor(30.109, true);
      drawAltCaption(ctx, altCaptionRect(w / 2, h / 2, {}), level, w, s, windBoxRect(w, h));
      expect(ctx.calls.filter((c) => c[0] === 'text').map((c) => c[1])).not.toContain('30.11 IN');
      expect(s.hudWind.baro).toBe(null);
      expect(s.hudWind.baroBox).toBe(null);
    }
  });
  it('legibility: light text on a box at least as dark as the MSL tab', () => {
    const ctx = fakeCtx(1280, 720), s = simFor(30.109, true);
    drawAltCaption(ctx, altCaptionRect(640, 360, {}), 'pilot', 1280, s, windBoxRect(1280, 720));
    const fills = ctx.calls.filter((c) => c[0] === 'fill').map((c) => c[1]);
    expect(fills).toContain('rgba(2, 6, 23, 0.85)');
  });
});
