import { describe, it, expect } from 'vitest';
import { windPlainWords, windPlainRect, drawWind, WIND_PLAIN_H } from '../../src/gateVerdict.js';
import { windBoxRect, windReadout, WIND_BOX_W, TAPE_TOP, BELOW_TOP_BAR, headingBoxTop, HEADING_BOX_H } from '../../src/hudLayout.js';
import { runwayWindComponents } from '../../src/weather.js';

// Ticket 0142: Kid and Learner read the wind box's numbers as words. Sign conventions from the same
// path main.js takes: weather.js runwayWindComponents → hudLayout.js windReadout → the words.
const words = (fromDeg, kts, rwyHdg = 0) => {
  const r = windReadout({ windDirDeg: fromDeg, windKts: kts, live: true }, runwayWindComponents(fromDeg, kts, rwyHdg));
  return windPlainWords(r.xwKts, r.hwKts);
};

describe('windPlainWords (0142)', () => {
  it('a wind from the right: hold the nose into it (FAA-H-8083-3C ch. 9)', () => {
    expect(words(90, 12)).toEqual(['RIGHT WIND', 'AIM INTO IT']);
    expect(words(80, 12, 359)).toEqual(['RIGHT WIND', 'AIM INTO IT']); // the e2e's 35C case
  });
  it('a wind from the left: the same words, the other side', () => {
    expect(words(270, 12)).toEqual(['LEFT WIND', 'AIM INTO IT']);
    expect(words(150, 15, 180)).toEqual(['LEFT WIND', 'AIM INTO IT']); // runway 18, wind from the SE
  });
  it('a tailwind floats you long; a headwind shortens the roll', () => {
    expect(words(180, 8)).toEqual(['TAILWIND', 'FLOATS LONG']);
    expect(words(0, 15)).toEqual(['HEADWIND', 'SHORT ROLL']);
    expect(words(5, 15)).toEqual(['HEADWIND', 'SHORT ROLL']); // 1.3 kt across: the headwind's
    expect(words(10, 15)).toEqual(['RIGHT WIND', 'AIM INTO IT']); // 2.6 kt across reads XW 3R: words as the box
  });
  it('Kid reads the side and HANDS OFF: its guide holds the line only while the stick is let go', () => {
    expect(windPlainWords(12, 2, true)).toEqual(['RIGHT WIND', 'HANDS OFF']);
    expect(windPlainWords(-12, 2, true)).toEqual(['LEFT WIND', 'HANDS OFF']);
    expect(windPlainWords(0, -8, true)).toEqual(['TAILWIND', 'FLOATS LONG']);
    expect(windPlainWords(0, 8, true)).toEqual(['HEADWIND', 'SHORT ROLL']);
  });
  it('the stronger of a crosswind and a tailwind takes the words', () => {
    expect(words(135, 10)).toEqual(['RIGHT WIND', 'AIM INTO IT']); // 7 across, 7 behind
    expect(words(160, 10)).toEqual(['TAILWIND', 'FLOATS LONG']); // 3 across, 9 behind
    expect(words(30, 10)).toEqual(['RIGHT WIND', 'AIM INTO IT']); // 5 across, 9 ahead: the cross is the job
  });
  it('no words in light air, calm, variable or away from the runway', () => {
    expect(words(0, 2)).toBeNull();
    expect(words(45, 3)).toBeNull(); // 2 and 2
    expect(windPlainWords(null, null)).toBeNull();
    const vrb = windReadout({ windDirDeg: null, windKts: 5 }, runwayWindComponents(null, 5, 0));
    expect(windPlainWords(vrb.xwKts, vrb.hwKts)).toBeNull();
    const high = windReadout({ windDirDeg: 90, windKts: 20 }, null);
    expect(windPlainWords(high.xwKts, high.hwKts)).toBeNull();
  });
  it('every line fits the box at 9 px monospace (~5.5 px a glyph)', () => {
    for (const [x, hw] of [[5, 0], [-5, 0], [0, -5], [0, 5]]) {
      for (const kid of [false, true]) for (const l of windPlainWords(x, hw, kid)) expect(l.length * 5.5, l).toBeLessThanOrEqual(WIND_BOX_W - 6);
    }
  });
});

describe('windPlainRect (0142)', () => {
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const [w, h] of [[1280, 720], [390, 844], [844, 390], [820, 1180], [1180, 820], [375, 548], [360, 800], [568, 320], [430, 932]]) {
    it(`${w}x${h}: beside the wind box, on screen, under the top bar, off the tapes, heading box and horizon`, () => {
      const box = windBoxRect(w, h);
      const r = windPlainRect(box, {});
      const cx = w / 2, cy = h / 2;
      expect(r.x).toBe(box.x);
      expect(r.w).toBe(box.w);
      expect(r.h).toBe(WIND_PLAIN_H);
      expect(overlaps(r, box), 'wind box').toBe(false);
      expect(Math.min(Math.abs(r.y + r.h - box.y), Math.abs(box.y + box.h - r.y))).toBeLessThanOrEqual(2);
      expect(r.y).toBeGreaterThanOrEqual(BELOW_TOP_BAR);
      expect(r.x + r.w).toBeLessThanOrEqual(w);
      expect(r.y + r.h).toBeLessThanOrEqual(h);
      const tapes = [
        { x: cx - 175, y: cy + TAPE_TOP, w: 44, h: -2 * TAPE_TOP },
        { x: cx + 130, y: cy + TAPE_TOP, w: 56, h: -2 * TAPE_TOP },
      ];
      for (const t of tapes) expect(overlaps(r, t), 'tape').toBe(false);
      expect(overlaps(r, { x: cx - 52, y: headingBoxTop(cy), w: 104, h: HEADING_BOX_H }), 'heading box').toBe(false);
      expect(overlaps(r, { x: w * 0.3, y: h * 0.35, w: w * 0.4, h: h * 0.3 }), 'horizon band').toBe(false);
    });
  }
});

describe('drawWind (0142)', () => {
  const fakeCtx = () => {
    const calls = [];
    return new Proxy({ calls }, {
      get: (t, k) => (k === 'calls' ? calls : (...a) => calls.push([k, ...a])),
      set: (t, k, v) => { calls.push([k, v]); return true; },
    });
  };
  const simFor = (fromDeg, more = {}) => ({ onGround: false, raFt: 400, ...more,
    hudWind: windReadout({ windDirDeg: fromDeg, windKts: 12, live: true }, runwayWindComponents(fromDeg, 12, 0)) });
  for (const [level, second] of [['kid', 'HANDS OFF'], ['learner', 'AIM INTO IT']]) {
    it(`${level}: draws both lines in the strip and records them`, () => {
      const ctx = fakeCtx(), s = simFor(90), hw = s.hudWind, box = windBoxRect(390, 844);
      drawWind(ctx, box, s, level);
      expect(hw.plain).toEqual(['RIGHT WIND', second]);
      expect(hw.plainBox).toEqual(windPlainRect(box, {}));
      const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
      expect(texts).toEqual(['RIGHT WIND', second]);
    });
  }
  it('Pilot: nothing drawn, nothing recorded (the box keeps XW/HW alone)', () => {
    const ctx = fakeCtx(), s = simFor(90), hw = s.hudWind;
    drawWind(ctx, windBoxRect(390, 844), s, 'pilot');
    expect(hw.plain).toBeNull();
    expect(hw.plainBox).toBeNull();
    expect(ctx.calls).toEqual([]);
  });
  it('a tailwind is amber, as the box\'s TW', () => {
    const ctx = fakeCtx();
    drawWind(ctx, windBoxRect(1280, 720), simFor(180), 'kid');
    expect(ctx.calls).toContainEqual(['fillStyle', '#fcd34d']);
  });
  it('none in the flare (under 30 ft) or on the runway, where the assists de-crab and it weathervanes', () => {
    for (const more of [{ raFt: 20 }, { onGround: true, raFt: 0 }]) {
      const ctx = fakeCtx(), s = simFor(90, more);
      drawWind(ctx, windBoxRect(390, 844), s, 'learner');
      expect(s.hudWind.plain).toBeNull();
      expect(ctx.calls).toEqual([]);
    }
    const s = simFor(90, { raFt: 31 });
    drawWind(fakeCtx(), windBoxRect(390, 844), s, 'learner');
    expect(s.hudWind.plain).toEqual(['RIGHT WIND', 'AIM INTO IT']);
  });
});
