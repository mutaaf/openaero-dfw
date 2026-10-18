import { describe, it, expect } from 'vitest';
import { headingBoxTop, HEADING_BOX_H, TAPE_TOP, BELOW_TOP_BAR } from '../../src/hudLayout.js';

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
