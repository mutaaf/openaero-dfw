// Vitest reporter (ticket 0160): writes every `it.fails` card the run collected, with the
// test's own title, to scripts/check-gaps.mjs LEDGER, plus the files the run covered. Wired in
// vite.config.js `test.reporters` next to the default reporter; it prints nothing.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { LEDGER } from './check-gaps.mjs';

const rel = (root, p) => relative(root, p).split('\\').join('/');

// [{ file, title, fullName }] for the fails-mode tests of vitest TestModules; files: every module's
// path, relative to the repo root.
export function ledgerOf(testModules, root = process.cwd()) {
  const cards = [];
  const files = [];
  for (const m of testModules) {
    const file = rel(root, m.moduleId);
    files.push(file);
    for (const t of m.children.allTests()) if (t.options.fails) cards.push({ file, title: t.name, fullName: t.fullName });
  }
  return { cards, files };
}

export default class GapReporter {
  // The last run's ledger goes first, so a run that can't write its own leaves none and
  // check-gaps stops ("run npm test first") rather than vouch with a stale one.
  // (A CLI --reporter replaces the configured ones, so such a run neither clears nor writes it.)
  onInit(ctx) {
    this.root = ctx?.config?.root ?? process.cwd();
    try { rmSync(resolve(this.root, LEDGER), { force: true }); } catch { /* none to remove */ }
  }

  onTestRunEnd(testModules, _errors, reason) {
    if (reason === 'interrupted') return; // a partial run vouches for nothing
    const root = this.root ?? process.cwd();
    const out = resolve(root, LEDGER);
    try {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), ...ledgerOf(testModules, root) }, null, 1));
    } catch (e) {
      console.error(`gap-reporter: could not write ${out}: ${e.message}`);
      process.exitCode = 1;
    }
  }
}
