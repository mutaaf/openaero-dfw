// Vitest reporter (ticket 0160): writes every `it.fails` card the run collected, with the
// test's own title, to scripts/check-gaps.mjs LEDGER, plus the files the run covered. Wired in
// vite.config.js `test.reporters` next to the default reporter; it prints nothing.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { LEDGER } from './check-gaps.mjs';

const rel = (p) => relative(process.cwd(), p).split('\\').join('/');

// [{ file, title }] for the fails-mode tests of vitest TestModules; files: every module's path.
export function ledgerOf(testModules) {
  const cards = [];
  const files = [];
  for (const m of testModules) {
    const file = rel(m.moduleId);
    files.push(file);
    for (const t of m.children.allTests()) if (t.options.fails) cards.push({ file, title: t.name });
  }
  return { cards, files };
}

export default class GapReporter {
  onTestRunEnd(testModules) {
    try {
      mkdirSync(dirname(LEDGER), { recursive: true });
      writeFileSync(LEDGER, JSON.stringify({ at: new Date().toISOString(), ...ledgerOf(testModules) }, null, 1));
    } catch (e) {
      console.warn(`gap-reporter: could not write ${LEDGER}: ${e.message}`);
    }
  }
}
