---
id: 0079
title: Stall buffet: feel the wing coming up on the stall, not only hear the horn
status: proposed
priority: P2
size: M
lens: player-feel
created: 2026-10-22
pr:
---

## Why
Today the stall is a square-wave horn (`src/audio.js`) and then a sudden drop. Real
trainers give a graded cue: the horn at 5-10 kt above the stall and aerodynamic buffet (a
rising shake through the airframe and controls) as the wing separates, which is the cue
pilots are taught to recognise and recover from (FAA AC 120-109A and SKYbrary: "Stall
Warning Systems", https://skybrary.aero/articles/stall-warning-systems : buffet alone is
the warning on some aircraft). For a first-timer on Learner it is also the readable
"you are about to stall" signal that does not need text. Pairs with haptics (0033).

## What
A pure `buffetIntensity(aoaDeg, stallAoaDeg)` in `src/aero.js`: 0 below ~85% of the stall
AoA, rising to 1 at stall (the existing `isStallWarning` margin is the start). The camera
gets a small high-frequency shake and the audio a low rumble layer scaled by it. Under
`prefers-reduced-motion` the shake is off and only the audio and a HUD cue remain.
Never feeds back into physics.

## Acceptance criteria
- [ ] `buffetIntensity` is 0 at 80% of stall AoA, strictly increasing, 1 at the stall AoA, for all three aircraft
- [ ] With `prefers-reduced-motion: reduce` the camera does not move
- [ ] No per-frame allocations; frame time within the perf probe budget
- [ ] Silent and still in normal flight, takeoff and landing flare at Learner/Pilot

## Test plan
Unit test the curve per aircraft spec. E2E: hold the nose up in the Cessna until the horn
sounds, assert the shake amplitude is non-zero; same page with reduced motion emulated
asserts zero.

## Out of scope
Stick shaker hardware modelling, per-surface buffet in the glTF (0063), stall physics changes.
