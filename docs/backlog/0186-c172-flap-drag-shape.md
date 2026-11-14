---
id: 0186
title: Cessna flap drag grows past 15°, not by the same amount every notch (AFH p. 9-1)
status: proposed
priority: P2
size: S
lens: authenticity
created: 2026-11-14
pr:
---

## Why
0180's card (`tests/flight/c172.test.js`, "glide with flaps") found the Cessna's flap drag is
linear: 0.012 per notch (aero.js default, no `flapCd` for the C172; the repo's
`public/jsbsim/aircraft/c172/c172.xml` CDflap carries the same 0.0012 per degree, tagged OAERO, so
JSBSim is not an independent check). The Airplane Flying Handbook (FAA-H-8083-3C ch. 9, p. 9-1,
"Use of Flaps") says "Flap deflection of up to 15° primarily produces lift with minimal drag ...
Deflection beyond 15° produces a large increase in drag." Measured at idle, 68 KIAS: flaps 0 → 10
loses 0.98 of glide ratio (9.19 → 8.21) and 20 → 30 only 0.66 (7.42 → 6.76), the reverse of the
Handbook's shape. A first notch that steepens the approach this much makes flaps 10 on a long
final, and the takeoff's flaps 10, draggier than the real airplane.

## What
Give the C172 a `flapCd` table that is small to 10° and grows past 15° (the Handbook's shape), from
a cited source if one can be read (a Cessna or NACA single-engine flap polar; DATCOM's plain/split
flap ΔCD0 method is the fallback), keeping the flaps-30 total near today's unless the source says
otherwise. Mirror it in c172.xml's CDflap (a table on flap-pos-deg). Re-measure every card that
reads flap drag: 0180's glide cards, the short-field takeoff (flaps 10) and landing (flaps 30), the
balked landing (0175), the stall speeds, Kid's final (kidFinal.test.js).

## Acceptance criteria
- [ ] 0180's KNOWN GAP (0186) card passes on both models and is promoted to `it`.
- [ ] No other card regresses; any moved number is recorded in the PR.

## Test plan
`npm test -- tests/flight`; record the new glide ratios per notch.

## Out of scope
737 and F-16 flap drag (the 737 already has a per-notch table).
