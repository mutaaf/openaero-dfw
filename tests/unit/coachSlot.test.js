import { describe, it, expect } from 'vitest';
import { coachOverHud, coachClearBottom, COACH_TOP_SLOT, headingBoxTop, windBoxRect, TAPE_TOP } from '../../src/hudLayout.js';

// Ticket 0130: the coach card must not sit on the speed/altitude tapes (cy ± 90), the SPD target
// label under the speed tape (baseline cy + 106) or the ground just under the horizon (cy to
// cy + 12% of the height), where the runway and the PAPI are on a short final.
// The card's CSS slot: bottom 232 px above the screen's foot (over the touch deck), 54 px tall
// with one line of text (Skip is 44 px + 2 x 5 px). Measured in the build at each size.
const CARD_H = 54;
const slot = (h) => ({ top: h - 232 - CARD_H, bottom: h - 232 });

describe('coachClearBottom', () => {
  it('is below the tapes, the SPD label and 12% of the height under the horizon', () => {
    for (const h of [548, 664, 720, 844, 1180]) {
      const cy = h / 2;
      expect(coachClearBottom(h)).toBeGreaterThanOrEqual(cy - TAPE_TOP);
      expect(coachClearBottom(h)).toBeGreaterThanOrEqual(cy + 106 + 3); // the label's descent
      expect(coachClearBottom(h)).toBeGreaterThanOrEqual(cy + 0.12 * h);
    }
  });
});

describe('coachOverHud', () => {
  it('keeps the CSS slot where it already clears: 390x844, the iPad both ways, desktop 1280x720', () => {
    expect(coachOverHud(844, 558, 612)).toBe(false);
    expect(coachOverHud(1180, 894, 948)).toBe(false);
    expect(coachOverHud(820, 534, 588)).toBe(false);
    expect(coachOverHud(720, 594, 648)).toBe(false);
    // A phone held sideways puts the card in the top bar, above the tapes (styles.css).
    expect(coachOverHud(390, 8, 62)).toBe(false);
    expect(coachOverHud(320, 8, 62)).toBe(false);
  });

  it('flags the slot on a short phone held upright (Safari with its bars, iPhone SE)', () => {
    for (const h of [548, 600, 664, 700, 740]) {
      const s = slot(h);
      expect(coachOverHud(h, s.top, s.bottom), `${h}`).toBe(true);
    }
  });

  it('a card wrapped to more lines (Kid, a long prompt) grows up into the band and is flagged', () => {
    const h = 844, bottom = h - 232;
    expect(coachOverHud(h, bottom - 54, bottom)).toBe(false);
    expect(coachOverHud(h, bottom - 90, bottom)).toBe(true);
  });

  it('the top slot is under the phone top bar and clears the heading box, wind box and tapes', () => {
    for (const [w, h] of [[390, 664], [375, 548], [390, 700], [414, 736], [360, 640]]) {
      const top = COACH_TOP_SLOT, bottom = top + CARD_H;
      expect(top, `${w}x${h}: under the 44 px top row at 8 px`).toBeGreaterThanOrEqual(8 + 44);
      expect(coachOverHud(h, top, bottom), `${w}x${h}`).toBe(false);
      expect(bottom, `${w}x${h}: above the heading box`).toBeLessThanOrEqual(headingBoxTop(h / 2));
      const wb = windBoxRect(w, h);
      expect(bottom <= wb.y || 12 + (w - 24) <= wb.x, `${w}x${h}: clear of the wind box`).toBe(true);
    }
  });
});
