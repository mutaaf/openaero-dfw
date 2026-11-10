---
id: 0170
title: C172 held pull at Vr: flightModel.js over-rotates 3-5° past JSBSim, and a released pull on Vy trim settles back
status: proposed
priority: P2
size: M
lens: authenticity
created: 2026-11-10
pr:
---

## Why
Found shipping 0109. 0144 hung two takeoff cards on the post-stall pitch break; with the break in
both models (src/pitchBreak.js, NASA CR-3097/CR-3201) they improved but stay open:
- Full aft stick held from Vr: the peak pitch with the wheels under 5 ft is flightModel.js 24.7° /
  25.0° (flaps 0 / 10), JSBSim 20.0° / 21.7° (both ~37-42° before 0109), max α ~19-20°. The ~20°
  bound is 0144's estimate, not a source; the 3-5° over JSBSim, which flies the same Cm tables with
  Roskam's Cmq/Cmα̇, is the model's own transient (pitch damping against the tail and mains, 0102's
  stiffness).
- A 40-80% pull held from Vr to positive rate, then let go, flaps 10, trimmed for Vy: no stall
  warning any more (α ≤ 17.5°, nose ≤ ~23°), but it settles back onto the runway (~57 KIAS at the
  release, trimmed for 74: the nose drops to find the trim speed with no height to spare).

## What
Measure the lift-off transient against JSBSim (and a source for a 172's lift-off pitch if one
exists) before changing anything; decide whether the released-pull card's premise holds (a real
172 let go at 57 kt on Vy trim may well settle too) and retarget it if not. Then trim.js
takeoffTrimAoaDeg may fly Vy with flaps 10.

## Acceptance criteria
- [ ] c172.test.js `KNOWN GAP (0170)` full-aft cards: flightModel.js's peak pitch low within a
      cited or JSBSim-backed bound
- [ ] The held-pull card promoted, or replaced by one with a cited premise
- [ ] The 0109, 0144 and 0141 cards stay green

## Test plan
tests/flight/c172.test.js (the three `KNOWN GAP (0170)` cards), tests/e2e/takeoff.spec.js.

## Out of scope
The post-stall Cm itself (0109, shipped).
