---
id: 0062
title: Refit the 737's flaps 10 lift so Vr, lift-off and V2 match the real jet's spacing
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-10-20
pr:
---

## Why
0058 fitted the model's flaps 10 Vr (132 kt at 65 t) to its own lift curve so a normal
rotation lifts off at 8–9° and the takeoff fits Boeing's field length. Its validation panel
found the spacing still unlike the real jet: lift-off comes ~17 kt after Vr (149.5 kt; crews
expect Vr + 5–10), Vr is only 1.06 × the model's flaps 10 stall speed (124 kt), and V2
(1.13 Vs = 140 kt) sits above Vr. Real flaps 5–10 Vr at this weight is reported nearer
136–142 kt, but by no public, citable table. A pilot reading the speeds would notice.

## What
Find a citable source for 737-800 takeoff speeds or flaps 5/10 stall speeds (Boeing FPPM or
FCOM excerpts in an accident report, a certification document, a published paper). Then
refit flaps 10's ΔCL / stall AoA (`src/aircraft.js` flapCl, alphaStallDegByFlap) and Vr so
Vs, Vr, lift-off and V2 are spaced like the source, and the 0058 cards still pass.

## Acceptance criteria
- [ ] A card pins flaps 10 Vs or Vr to the cited source
- [ ] Lift-off within ~Vr + 12 kt at a 2–3°/s rotation, at 8–9°
- [ ] Every 0058 and 0057 card in `tests/flight/b738.test.js` stays green

## Test plan
`npm test -- tests/flight`.

## Out of scope
New flap notches; engine-out yaw.
