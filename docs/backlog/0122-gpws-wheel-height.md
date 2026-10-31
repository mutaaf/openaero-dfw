---
id: 0122
title: GPWS callouts and the gear warning read the radio altitude at the wheels, not the CG
status: ready
priority: P2
size: S
lens: authenticity
created: 2026-10-30
pr:
---

## Why
`sim.aglFt` (src/main.js, `(pos.y - groundY)`) is the centre of gravity's height. A radio altimeter
is set to read 0 with the main wheels on the runway, and the automatic callouts are wheel-height
callouts. The 737's CG is ~3.4 m over the runway on its gear (`gearHeight`), ~11 ft in a 5° flare:
"ten" is never called and "twenty" + "retard" come ~11 ft late (C172 ~5 ft, F-16 ~7 ft). Found by
0117's validation panel; the captions now show it.

## What
A radio-altitude height for the callouts, gear warning (mode 4A) and sink-rate/pull-up inputs:
the main wheels' height (`pos.y - groundY - gearHeight·cosθ - mainGearZ·sinθ`, the geometry of
aircraftModel.js `rotationLift`). Leave the HUD's AGL readout and every other consumer to their own
decision (coach, landing grade, assists read `sim.aglFt`).

## Acceptance criteria
- [ ] On the 737's default final the "ten" callout is called before touchdown
- [ ] "twenty" comes with the main wheels 20 ± 3 ft over the runway on each aircraft
- [ ] No flight card regresses

## Test plan
Unit: the wheel-height helper at 0° and 5° pitch per aircraft. E2E: tests/e2e/captions.spec.js's
Kid final expects "ten".

## Out of scope
Changing the HUD AGL readout or the coach's heights.
