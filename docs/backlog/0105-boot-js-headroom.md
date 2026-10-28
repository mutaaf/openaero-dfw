---
id: 0105
title: Boot JS has 6 bytes of headroom: move 2 kB of main.js into lazy chunks before the next feature needs it
status: ready
priority: P1
size: M
lens: tech-health
created: 2026-10-28
pr:
---

## Why
`scripts/check-budget.mjs` reports boot JS at 200.99 kB gzipped against the 201 kB budget.
Every recent feature (0048, 0097, 0098) paid for itself by trimming something else the
same PR, and AGENTS.md § Commands now notes that repeated-literal helper trims measure 0 or
worse. With ~6 bytes of headroom the next boot feature either blocks on a refactor or
gets squeezed into an unreviewable diff. The budget is the iPhone's first-second promise
(pillar 1), so the fix is to move cold code out of boot, not to raise the line.

## What
Find about 2 kB gz of code that is not needed before the first frame of the start screen
and move it behind a lazy chunk, with no behaviour change. Candidates to measure first:
the ?debug overlay and `openaeroDebug*` hooks in main.js, the mission-picker grouping
and rendering that only runs when the picker opens, Kid's hands-off guide glue that only
runs after Fly, and the climb/cruise/approach warning text tables. Use the bundle
visualiser output (`npx vite-bundle-visualizer` or rollup's `--stats`) to rank by size,
not guesses. Update the AGENTS.md budget line with the new number.

## Acceptance criteria
- [ ] `node scripts/check-budget.mjs` reports boot JS at or below 199.0 kB gz
- [ ] No behaviour change: `npm run check` green, the same e2e specs pass untouched
- [ ] Every name a moved piece used is still defined (lesson 2026-10-26: run `eslint --rule no-undef` over the files you split)
- [ ] The lazy chunk is prefetched after boot where a dropped connection would otherwise lose a feature
- [ ] The AGENTS.md budget line records the date, the number and what moved

## Test plan
`npm run check`; before/after output of `scripts/check-budget.mjs` pasted in the PR; the
e2e smoke (zero console errors) and the picker spec cover the moved pieces.

## Out of scope
Raising the budget, new features, changes to three.js chunking (0084 settled that).
