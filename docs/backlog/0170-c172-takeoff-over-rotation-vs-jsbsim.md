---
id: 0170
title: C172 held pull at Vr: flightModel.js over-rotates 3-5° past JSBSim, and a released pull on Vy trim settles back
status: shipped
priority: P1
size: M
lens: authenticity
created: 2026-11-10
pr: 282
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
- [x] The held-pull card replaced: settles back as JSBSim's C172 does (plain card)
- [x] The 0109, 0144 and 0141 cards stay green

## Outcome (2026-11-18)
Measured against JSBSim on the same step before changing anything (tests/flight/c172.test.js logs both).
- **Peak pitch, wheels under 5 ft:** flightModel.js 24.7 / 25.0° (flaps 0 / 10), JSBSim 20.0 / 21.7°.
  Two causes, two tickets:
  - **The α overshoot: 20.4 / 20.1° against 18.9 / 19.1°.** flightModel.js has no Cmα̇ (Roskam −5.2 in
    JSBSim). Adding it measured 18.9 / 18.7°, but it moves the power-off 180 coach's fitted float, and
    no coach constants re-centre that (swept): ticket **0202** (ready, patch and sweep inside).
  - **The flight path.** JSBSim's lift table is aero.js's POH fit and it adds Roskam's CLδe on top, so
    held full back it mushes. With CLδe 0 it peaks at 22.1 / 23.7°: ticket **0203**.
  - The "under 20°" bound had no source, so it is gone. The cards are now α within 0.75° of JSBSim
    (KNOWN GAP 0202) and pitch within 1.5° (KNOWN GAP 0202, 0203). With 0202's patch the α cards pass.
- **The released pull:** the premise does not hold. JSBSim's C172 let go the same way settles back at
  every pull (40-100%, flaps 10, Vy trim): it is let go at 57-64 KIAS, 10-17 kt under the trim speed.
  The card is now that agreement (a plain card). trim.js keeps 1.2 Vr for flaps 10: on Vy trim the
  held pull settles back in both models.
- The 0109, 0144 and 0141 cards are unchanged and green.

## Test plan
tests/flight/c172.test.js (the three `KNOWN GAP (0170)` cards), tests/e2e/takeoff.spec.js.

## Out of scope
The post-stall Cm itself (0109, shipped).
