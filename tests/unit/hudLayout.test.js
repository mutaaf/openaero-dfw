import { describe, it, expect } from 'vitest';
import { headingBoxTop, HEADING_BOX_H, TAPE_TOP } from '../../src/hudLayout.js';

// The phone's top bar (☰ Menu, telemetry, landscape coach) ends at most 62 px down.
const TOP_BAR = 62;

describe('headingBoxTop', () => {
  it('keeps the classic cy - 145 on tall screens (desktop, portrait phone)', () => {
    expect(headingBoxTop(720 / 2)).toBe(720 / 2 - 145);
    expect(headingBoxTop(844 / 2)).toBe(844 / 2 - 145);
  });

  it('drops below the top bar on a phone held sideways (0025)', () => {
    for (const h of [390, 375]) {
      const cy = h / 2;
      const top = headingBoxTop(cy);
      expect(top, `${h}: below the top bar`).toBeGreaterThan(TOP_BAR);
      expect(top + HEADING_BOX_H, `${h}: above the tapes`).toBeLessThanOrEqual(cy + TAPE_TOP);
    }
  });

  it('never runs into the tapes, even on a 320 px tall screen', () => {
    for (const h of [320, 300, 360, 414, 480]) {
      const cy = h / 2;
      expect(headingBoxTop(cy) + HEADING_BOX_H).toBeLessThanOrEqual(cy + TAPE_TOP);
    }
  });
});
