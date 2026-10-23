---
id: 0084
title: Boot JS is 208.7 kB gz against a 201 kB budget: win 8 kB back
status: ready
priority: P1
size: M
lens: tech-health
created: 2026-10-23
pr:
---

## Why
`npm run build` on main prints `index-*.js` at 208.74 kB gzipped; AGENTS.md § 5 sets 201 kB and
has been creeping upward by 0.2–1 kB per ticket (205.7 after the 0068 era, 206.4, 207.1, 208.1,
208.5, 208.7) with nothing enforcing it. Boot time is the first-second promise on a phone, and
each unenforced overage makes the next one easier to excuse (docs/LESSONS.md, 2026-10-22).

## What
Keeper-style, no behaviour change: find what in the entry chunk is not needed to paint the first
screen and lazy-load it (candidates: coach.js, assists.js tutor text, apTutor.js, goAround is
already lazy; the mission blurbs; unused three.js imports via a bundle visualizer). Add a check
script (`scripts/check-budget.mjs`) that gzips `dist/openaero/assets/index-*.js` and fails above
the number written in `AGENTS.md`, wired into `npm run check:fast` and `npm run check`.
Touching `.github/workflows/` is not needed or allowed: the script runs inside the existing gate.

## Acceptance criteria
- [ ] Boot `index-*.js` ≤ 201 kB gzipped (or the PR shows what moved and why it stops short, with the new honest number in AGENTS.md)
- [ ] `scripts/check-budget.mjs` fails when the entry chunk exceeds the limit (unit-tested with a fixture)
- [ ] Coach, flight and e2e specs unchanged and green; first-screen paint not later (perf probe)

## Test plan
Unit test for the budget script's pass/fail; existing e2e specs prove lazy chunks still load.

## Out of scope
Raising the budget (operator's call); new features.
