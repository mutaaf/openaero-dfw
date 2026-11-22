---
id: 0217
title: Rectangular course: hold a constant distance from a field's edge through four turns in a wind
status: proposed
priority: P2
size: M
lens: content
created: 2026-11-22
pr:
---

## Why
The third ACS ground-reference maneuver (Area V Task B, with 0211 turns around a point and 0216 S-turns) and the
one that leads straight into the traffic pattern (0048 flies the legs with a coach; this teaches why the crab
and the turn radius change leg by leg). Reference: FAA Airplane Flying Handbook ch. 7,
https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/airplane_handbook/08_afh_ch7.pdf .
Read the ACS Task V.B text for tolerances before coding; none are quoted here.

## What
Blocked on 0211 (shares its ground-track sampler and wind frame). A lazy `src/rectCourse.js` drill on the C172
at 800 ft AGL around a rectangle drawn from a real field's edge (KADS), one circuit each way, graded on the
distance from the edge on each leg (variance), turn entry/exit timing, altitude and speed. The coach names the
crab angle per leg and says "steeper turn" / "shallower turn" from the wind.

## Acceptance criteria
- [ ] Unit: leg distances computed from a synthetic track; a wind-blind constant crab scores below a corrected one
- [ ] Flight card with a scripted pilot in 15 kt wind: the corrected pilot beats the uncorrected on the worst leg error
- [ ] Mission appears in the Drills group; no HUD overlap at 390x844 and 1280x720
- [ ] No boot-budget change

## Test plan
tests/unit/rectCourse.test.js, tests/flight/rectCourse.test.js, one e2e smoke.

## Out of scope
S-turns (0216), the pattern coach (0048).
