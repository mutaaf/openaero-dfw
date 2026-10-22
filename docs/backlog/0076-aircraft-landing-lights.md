---
id: 0076
title: Landing lights: a lit patch of runway ahead of you on a night final
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-10-22
pr:
---

## Why
Pillar 5 asks for night with runway and city lights. Played at night on the default final,
the runway lights and street lights are there, but the aircraft lights nothing: real pilots
switch on the landing lights below 10,000 ft near an airport and see the runway ahead light up
(FAA AIM 4-3-23 recommends them on, https://www.angleofattack.com/aim/chapter-4/4-3-23/).
A lit patch on the runway in the flare is also the cue that makes a night landing judgeable
for a first-timer.

## What
A landing light for each aircraft (`spec.landingLight` in `src/aircraft.js`: position,
cone angle) that is a toggle (key L, touch via the existing menu button row), on by default
below 10,000 ft AGL at night. Implemented in the ground shader patch in `src/nightGround.js`
(a cone term added to the moonlit grade, uniform-driven so no per-frame allocations) and a
visible beam only while the sun is below the horizon. Lazy: no boot-size growth beyond the
uniforms.

## Acceptance criteria
- [ ] At Night preset on a 3° final the ground within the cone is measurably brighter at 100 ft AGL than with the light off (pixel mean in a region, `FULL_RES`), and identical at Noon.
- [ ] Toggle works by key and touch; state shown in the HUD menu; remembered in `openaero_view_v1` only if `v` is bumped with migration (otherwise not persisted).
- [ ] Boot JS budget unchanged within 0.2 kB; per-frame cost within the perf probe budget on the `devices` run.
- [ ] No effect with `prefers-reduced-motion`-sensitive flashes (the light is steady, no strobe).

## Test plan
E2E in `tests/e2e/night.spec.js`: Night preset, spawn 35C final, sample pixels with the light on and off (set threshold between the two measured values, per the lessons on light tests); Noon control. Unit test for any pure cone-intensity function.

## Out of scope
Taxi lights, strobes and nav-light colours (a separate ticket), photoreal tiles lighting.
