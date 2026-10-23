import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { bootScripts, budgetKb, checkBudget, threeCopies } from '../../scripts/check-budget.mjs';

const HTML = `<!doctype html><html><head>
<script type="module" crossorigin src="/openaero/assets/index-abc.js"></script>
<link rel="modulepreload" crossorigin href="/openaero/assets/three-def.js">
<link rel="stylesheet" crossorigin href="/openaero/assets/index-abc.css">
</head><body></body></html>`;

describe('boot JS budget (0084)', () => {
  let dir;
  let gz;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'budget-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), HTML);
    // Random bytes don't compress: each file is ~its own size gzipped.
    writeFileSync(join(dir, 'assets/index-abc.js'), randomBytes(3000));
    writeFileSync(join(dir, 'assets/three-def.js'), randomBytes(5000));
    writeFileSync(join(dir, 'assets/lazy-xyz.js'), randomBytes(50000)); // not loaded at boot
    gz = ['index-abc.js', 'three-def.js']
      .map((f) => gzipSync(readFileSync(join(dir, 'assets', f)), { level: 9 }).length / 1000)
      .reduce((a, b) => a + b, 0);
  });

  it('counts the entry and its modulepreloads, not CSS or lazy chunks', () => {
    expect(bootScripts(HTML)).toEqual(['assets/index-abc.js', 'assets/three-def.js']);
  });

  it('passes at or under the limit and fails above it', () => {
    expect(checkBudget(dir, Math.ceil(gz)).ok).toBe(true);
    const over = checkBudget(dir, gz - 0.5);
    expect(over.ok).toBe(false);
    expect(over.totalKb).toBeCloseTo(gz, 6);
    expect(over.files.map((f) => f.path)).toEqual(['assets/index-abc.js', 'assets/three-def.js']);
  });

  it('reads the limit from AGENTS.md', () => {
    expect(budgetKb('Budgets: JS ≤ 201 kB gzipped at boot (measured by ...)')).toBe(201);
    expect(budgetKb(readFileSync('AGENTS.md', 'utf8'))).toBeGreaterThan(0);
    expect(() => budgetKb('no budget here')).toThrow();
  });

  it('counts the copies of three in the bundle (minified or not)', () => {
    writeFileSync(join(dir, 'assets/three-a.js'), 'class e{constructor(){this.isObject3D=!0}}');
    expect(threeCopies(dir)).toBe(1);
    writeFileSync(join(dir, 'assets/three-b.js'), 'class Object3D { constructor() { this.isObject3D = true; } }');
    expect(threeCopies(dir)).toBe(2);
  });

  it('fails loudly when the HTML loads no module script', () => {
    writeFileSync(join(dir, 'index.html'), '<html></html>');
    expect(() => checkBudget(dir, 999)).toThrow(/no module scripts/);
    writeFileSync(join(dir, 'index.html'), HTML);
  });
});
