---
id: 0012
title: Grade every landing and keep a personal best per mission
status: ready
priority: P1
size: M
lens: player-feel
created: 2026-10-16
pr:
---

## Why
Landing is the whole game, but today nothing happens when you touch down. A grade
(touchdown rate, centreline, touchdown zone, flare) turns each approach into a challenge
worth repeating.

## What
Pure `gradeLanding({ vsFpm, crossTrackM, distFromThresholdM, pitchDeg, bankDeg, iasKts, vref })`
in `src/landing.js` → per-factor scores and a letter (S/A/B/C/D, or CRASH above 600 fpm
or 10° bank). A results card shows the factors and the grade; "Fly again" reloads the
mission. Best score per mission in `localStorage['openaero_best']` with `{ v: 1, missions: {…} }`.

## Acceptance criteria
- [ ] Unit tests: a 120 fpm, on-centreline, in-zone touchdown grades A or better; 700 fpm is CRASH
- [ ] e2e: forcing a touchdown shows the results card with a grade
- [ ] e2e: the best score survives a reload under `openaero_best` with `v: 1`

## Test plan
Vitest for the grader; Playwright drives the approach autopilot to touchdown (or sets the
sim state through a test hook) and asserts the card and storage.

## Out of scope
Online leaderboards.
