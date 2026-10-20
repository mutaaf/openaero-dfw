---
id: 0057
title: Give the 737 its real landing flaps (30 and 40) so Vref and approach pitch match Boeing
status: ready
priority: P1
size: M
lens: authenticity
created: 2026-10-20
pr:
---

## Why
Two Boeing-sourced cards in `tests/flight/b738.test.js` are known gaps (`it.fails`, 0057).
The 737's flaps are modelled as four notches 0/10/25/40 with a linear +0.42 CL per notch, so
flaps 40 adds +1.26 CL: 1.23 Vs at MLW (66,361 kg) is 130 kt where Boeing's *Aerodrome
Reference Code and Approach Speeds* (Rev A) gives 142 kt, and on a 3° ILS at Vref+5 the nose
is 3.5° down where Boeing's *Visual Landing Aids Data* Table A6-1 gives +1.3° (flaps 40) and
+3.4° at Vref (flaps 30). A pilot sees a 737 that floats nose-down at 130 kt. The real
airplane lands with flaps 30 or 40; the model has no flaps 30 notch at all.

## What
In `src/aircraft.js`, give the 737 a per-notch `flapCl` (and `flapCd`, `alphaStallDegByFlap`
if needed) table like the C172, fitted to the cited numbers: Vref40 ≈ 142 kt at MLW, pitch
+1.3° at Vref40+5 and +3.4° at Vref30 on a 3° path. Decide (and document) whether the game's
notches become 0/1/5/15/30/40 or the 25 notch becomes 30 (main.js `flapAngles`, HUD label,
assists' `flapsOk`, autoland). Keep the approach-thrust and L/D cards passing (refit
`flapCd`), and the Kid/Learner/autoland flight specs green.

## Acceptance criteria
- [ ] The two 0057 cards in `tests/flight/b738.test.js` are promoted from `it.fails` to `it`
- [ ] A flaps 30 card: pitch on a 3° path at Vref30 ≈ 3.4° (VLA Table A6-1, ±1°)
- [ ] The landing-distance card (ACAP §3.4.3) flies the real flaps 30 and still passes
- [ ] Existing 737 cards and e2e autoland/flight specs stay green

## Test plan
`npm test -- tests/flight`, then the e2e flight specs (autoland, Kid landing).

## Out of scope
The takeoff distance (0058), engine-out performance.
