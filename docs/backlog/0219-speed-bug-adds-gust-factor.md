---
id: 0219
title: The Cessna's speed bug and coach target add half the gust factor on a gusty day
status: ready
priority: P2
size: S
lens: authenticity
created: 2026-11-23
pr:
---

## Why
Kid's autothrottle already flies "Vref + 5 + half the gust factor" (`kidTargetKts`,
`kidGustAddKts` in `src/assists.js`, from 0195), but the speed bug and the coach's target
(`coachKts()` in `src/main.js`, `coachVals.targetKts`) stay at Vref + 5. A Learner or Pilot
in 25G38 is told they are "fast" at the speed that the handbook says is too slow: the AFH
says to increase the final approach speed by one-half the gust factor (FAA-H-8083-3C ch. 9;
https://www.faasafety.gov/files/events/SO/SO15/2022/SO15112841/Chapter9ApproachesAndLandings.pdf;
summary: https://www.boldmethod.com/learn-to-fly/aerodynamics/why-you-should-add-half-the-gust-factor-on-windy-day-landings/).
The coach and the bug should agree with the Kid autopilot and the book.

## What
Add `kidGustAddKts(sim.spec, wx)` (rename to a neutral `gustAddKts` if it reads better; keep
the export) to `coachKts()` for piston-prop airframes with flaps out. The speed bug, the coach
"fast / slow" bands and the stabilized gate's speed window read that target. The 737 is out
of scope (its operator method, half the steady headwind plus the full gust capped at 20 kt per
Flight Safety Foundation, needs its own cited card). Touches `src/main.js` coachKts, maybe
`src/coach.js`.

## Acceptance criteria
- [ ] In 25G38 the Cessna's bug on final reads Vref + 5 + 6.5 kt; in calm or steady wind it is unchanged.
- [ ] The coach does not say "slow" to a pilot holding that bug; no coach card changes in calm air.
- [ ] The stabilized gate's speed window follows the same target (or the PR says why not).
- [ ] No spec for the 737 or F-16 changes.

## Test plan
Unit test of the target with and without gusts; extend the existing gusty-day flight card
(`tests/flight`, 0195) so a Pilot flying the bug is graded stabilized; coach.spec e2e unchanged.

## Out of scope
The 737; a headwind-component additive; Vref itself.
