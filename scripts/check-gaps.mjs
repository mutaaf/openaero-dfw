#!/usr/bin/env node
// The known-gap ledger (ticket 0160). Every `it.fails` card is a gap the model does not yet
// meet, and AGENTS.md pillar 0 says each one is written down: its own title says
// `KNOWN GAP (NNNN): ...` (or `KNOWN GAP (NNNN, NNNN): ...`) and docs/backlog/NNNN-*.md is still
// open (proposed, ready or in-progress). A card that starts passing already fails vitest; this
// catches the pointer that rots: a ticket shipped or dropped while its card still fails, a
// ticket that never existed, or an `it.fails` with no ticket at all.
//
// The cards are read as vitest ran them, not from the source: several are picked at runtime
// (c172.test.js's `card(id)` over its GAPS maps, titles built in loops). scripts/gap-reporter.mjs
// writes LEDGER on every `npm test`; run this after it (`npm run check` and `check:fast` do).
// Exit 1 with the table and the problems.
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LEDGER = 'node_modules/.cache/openaero/known-gaps.json';
export const OPEN = ['proposed', 'ready', 'in-progress'];

// The ticket ids a card's own title names, or null without a KNOWN GAP (NNNN[, NNNN]) tag.
export function gapTickets(title) {
  const m = String(title).match(/KNOWN GAP \((\d{4}(?:, \d{4})*)\)/);
  return m ? m[1].split(', ') : null;
}

// { id: status } from the backlog's ticket files (docs/backlog/NNNN-*.md frontmatter).
export function readTickets(dir = 'docs/backlog') {
  const out = {};
  for (const f of readdirSync(dir)) {
    const id = f.match(/^(\d{4})-.+\.md$/)?.[1];
    if (!id) continue;
    const status = readFileSync(join(dir, f), 'utf8').match(/^status:\s*([\w-]+)/m)?.[1];
    out[id] = status ?? '?';
  }
  return out;
}

// cards: [{ file, title, fullName? }] (every it.fails as run; the tag must be in the test's own
// title, fullName adds its describes for the table); tickets: { id: status }.
export function checkGaps(cards, tickets) {
  const rows = [];
  const problems = [];
  for (const { file, title, fullName = title } of cards) {
    const ids = gapTickets(title);
    if (!ids) {
      rows.push({ file, title: fullName, ticket: '-', status: 'untagged' });
      problems.push(`${file}: "${fullName}" is an it.fails card without a KNOWN GAP (NNNN) tag in its own title: `
        + 'title it `KNOWN GAP (NNNN): ...` with the open ticket that will close it, or file one');
      continue;
    }
    for (const id of ids) {
      const status = tickets[id] ?? 'missing';
      rows.push({ file, title: fullName, ticket: id, status });
      if (status === 'missing') problems.push(`${file}: "${fullName}" names ticket ${id}, which is not in docs/backlog: fix the number or file docs/backlog/${id}-*.md`);
      else if (!OPEN.includes(status)) problems.push(`${file}: "${fullName}" names ticket ${id}, which is ${status}: retarget the card to an open ticket or file one`);
    }
  }
  return { rows, problems };
}

// Source with its string literals and comments blanked: an it.fails in a comment or a test
// fixture's string is not a card. (A heuristic: it only decides which files a run must cover.)
export const codeOnly = (text) => text
  .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''")
  .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

// Test files whose code has an it.fails/test.fails but which the ledger's run did not
// include: a partial `npm test -- <file>` wrote the ledger, so it can't vouch for them.
export function unrunFiles(sources, ledgerFiles) {
  const ran = new Set(ledgerFiles);
  return Object.entries(sources)
    .filter(([file, text]) => /\b(?:it|test)(?:\.\w+)*\.fails\b/.test(codeOnly(text)) && !ran.has(file))
    .map(([file]) => file);
}

function testSources(dirs = ['tests/unit', 'tests/flight']) {
  const out = {};
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.test.js')) out[relative('.', p).split('\\').join('/')] = readFileSync(p, 'utf8');
    }
  };
  for (const d of dirs) if (existsSync(d)) walk(d);
  return out;
}

function main() {
  if (!existsSync(LEDGER)) {
    console.error(`check-gaps: no ${LEDGER}; run \`npm test\` first (scripts/gap-reporter.mjs writes it)`);
    process.exit(1);
  }
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
  const { rows, problems } = checkGaps(ledger.cards, readTickets());
  for (const f of unrunFiles(testSources(), ledger.files)) {
    problems.push(`${f}: has it.fails cards but the last \`npm test\` did not run it; run the whole suite first`);
  }
  const w = Math.max(4, ...rows.map((r) => r.file.length));
  console.log(`check-gaps: ${rows.length} known-gap card link(s)\n  ${'card'.padEnd(w)}  ticket  status`);
  for (const r of rows) console.log(`  ${r.file.padEnd(w)}  ${r.ticket.padEnd(6)}  ${r.status.padEnd(11)}  ${r.title.slice(0, 90)}`);
  if (problems.length) {
    console.error(`check-gaps: ${problems.length} problem(s)\n  ` + problems.join('\n  '));
    process.exit(1);
  }
  console.log(`check-gaps: every known gap names an open ticket`);
}

const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
if (process.argv[1] && same(realpathSync(fileURLToPath(import.meta.url)), realpathSync(process.argv[1]))) main();
