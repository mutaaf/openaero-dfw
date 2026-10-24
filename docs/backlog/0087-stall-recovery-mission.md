---
id: 0087
title: Stall recovery drill: feel the stall, recover it, get graded
status: ready
priority: P1
size: M
lens: content
created: 2026-10-24
pr:
---

## Why
Every mission today is a landing or a tour; nothing teaches the one skill the flight model
is most carefully checked on (stall speeds, accelerated stalls, buffet). Power-off and
power-on stall recovery is a core private-pilot task, and its aim is a "prompt, positive,
and effective" recovery with minimal altitude loss ([lesson plan citing the ACS](https://www.cfinotebook.net/lesson-plans/private-pilot-airplane/slow-flight-and-stalls/private-pilot-airplane-power-off-stalls-lesson-plan)).
A kid learns why you lower the nose; a pilot gets a checkable drill. Note the FAA's
Transport Canada-derived advisory ([FAA](https://www.faa.gov/sites/faa.gov/files/2022-11/TransportCanadaStall_AC.pdf)) says altitude loss is secondary until the recovery is positive: the grade must not reward diving.

## What
A Cessna mission `c172_stall_recovery` (kind `drill`, started at 4,500 ft AGL over a fixed
point, C172, clean then landing configuration) with a pure state machine in a new
`src/stallDrill.js` (lazy chunk like `goAround.js`): `armed` (slow the airplane with power
idle) -> `stalled` (wing past critical AoA, existing stall flag) -> `recovered` (AoA below
stall warning AND positive climb rate AND wings within 15 deg of level) -> grade. Grade
inputs: altitude lost from stall to recovery, peak bank, secondary stall (re-stalls within
10 s), and time to recover. Coach prompts reuse `coach.js` style: "Nose down. Power in.
Wings level. Climb away". Results card via the existing landing-card path with its own best
key `c172_stall_recovery` (plain key for Pilot, `@kid`/`@learner` per invariant 6).
Touches missions.js, coach.js (prompts), a new module, main.js wiring (small), tests.

## Acceptance criteria
- [ ] The mission appears in the start screen picker and deep-links with `?mission=c172_stall_recovery`
- [ ] A scripted correct recovery (nose down, full power, level wings) grades A or S; holding the stick back through the stall never grades above D
- [ ] A recovery that re-stalls is flagged "secondary stall" and capped at C
- [ ] Altitude lost is shown on the card and is not the only grade input
- [ ] Works at 390x844 touch and 1280x720 keyboard; Kid assist level still lets the airplane stall in the drill (the no-dive floor must not hide the lesson)
- [ ] No frame-time regression; new chunk is not in the boot budget

## Test plan
Unit: `tests/unit/stallDrill.test.js` drives the state machine with synthetic AoA/altitude
traces (correct, late, secondary stall, no stall at all). Flight: one card in
`tests/flight/c172.test.js` flies the scripted recovery headless and asserts it ends level
and climbing. E2E: the mission loads and the card appears after a scripted recovery.

## Out of scope
Spins, accelerated or crossed-control stalls, other aircraft, an instructor voice.
