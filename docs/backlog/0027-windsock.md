---
id: 0027
title: A lit windsock at every airport that shows today's wind
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-10-17
pr:
---

## Why
Pilots read the field's wind from the windsock on short final; today wind only appears as
HUD text. Real airports must provide a wind indicator, lit at night at air-carrier fields
(FAA AC 150/5340-30 and the segmented-circle system described at
https://en.wikipedia.org/wiki/Windsock and https://www.angleofattack.com/what-is-a-segmented-circle/).
A windsock streaming toward the downwind side with a visible droop in light wind makes the
METAR (ticket 0004) something you can see, and helps casual players feel a crosswind.

## What
One small instanced mesh per airport in `src/main.js` (or a new `src/windsock.js`),
placed just off the midfield side of the main runway at terrain height from `ground.heightAt`.
Orientation = wind direction the sim already uses; extension angle from droop (limp at <3 kt to horizontal at ≥15 kt), a gentle flutter driven by gust. Orange/white, drawn as unlit mesh (cheap on software GL), emissive at night. Reuse vectors; no per-frame allocation.

## Acceptance criteria
- [ ] Unit test: pure `windsockPose(windDirDeg, speedKt, gustKt, t)` returns a yaw pointing downwind and an extension angle monotonic in speed
- [ ] One windsock at each of KDFW, KDAL, KAFW, KADS, KGKY, KFTW, on the ground
- [ ] Visible from ~1 NM on the DFW 35C final at 1280x720 (screenshot)
- [ ] No frame-time regression, no new hosts

## Test plan
`tests/unit/windsock.test.js` for the pose maths; e2e checks the sock group exists and is above `groundY` and screenshot attached.

## Out of scope
Segmented circle, wind tees, animated cloth physics.
