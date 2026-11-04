import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Ticket 0089: the PAPI reading is never colour alone (WCAG 2.2 SC 1.4.1). main.js writes the white-lamp
// count to data-papi; styles.css gives each count its own glyph and a lamp row whose white and red lamps
// differ by shape. This reads the stylesheet's contract, the e2e (papi.spec.js) checks it on screen.
const css = readFileSync('src/styles.css', 'utf8');
const glyph = (n) => css.match(new RegExp(`\\.papi-cue\\[data-papi="${n}"\\]::before \\{ content: '([^']+)'`))?.[1];

describe('PAPI cue (0089)', () => {
  it('gives every reading, 0 to 4 white, its own glyph: the way to fly, like the coach and the flare cue', () => {
    const g = [0, 1, 2, 3, 4].map(glyph);
    expect(g).toEqual(['▲▲', '▲', '◆', '▼', '▼▼']);
    expect(new Set(g).size).toBe(5);
  });

  it('hides the glyph from screen readers (the word says it) with a fallback for older engines', () => {
    for (const n of [0, 1, 2, 3, 4]) {
      expect(css).toMatch(new RegExp(`data-papi="${n}"\\]::before \\{ content: '[^']+'; content: '[^']+' / ''; \\}`));
    }
  });

  it('draws white lamps as rings and red lamps as squares, inboard lamps red first', () => {
    expect(css).toMatch(/\.papi-lamps i \{[^}]*background: #f87171/);
    for (const n of [1, 2, 3]) expect(css).toContain(`.papi-cue[data-papi="${n}"] + .papi-lamps i:nth-child(-n+${n})`);
    expect(css).toContain('.papi-cue[data-papi="4"] + .papi-lamps i)');
    expect(css).toMatch(/border: 2px solid #f8fafc; border-radius: 50%/);
  });

  it('keeps the glyph in a fixed-width box, larger than the word, so the readout never shifts', () => {
    expect(css).toMatch(/\.papi-cue::before \{ display: inline-block; width: [\d.]+em; font-size: 1\.2em/);
  });
});
