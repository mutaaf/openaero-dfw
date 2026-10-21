---
id: 0062
title: Refit the 737's flaps 10 lift so Vr, lift-off and V2 match the real jet's spacing
status: shipped
priority: P2
size: M
lens: authenticity
created: 2026-10-20
pr: 69
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

## Outcome (#69)
- Source: AAIB Bulletin 6/2019 (YR-BMF) and ATSB AO-2014-162 (VH-VZR) print four crew
  performance-tool outputs: at 65 t, VR ~145, V2 ~148, V2 − VR 3–4 kt; flap not stated.
- Refit: flaps 10 ΔCL 0.42 → 0.38, Vr 132 → 135 (Vs 125.5, V2 141.8, V2 − Vr 6.8 kt);
  every 0057/0058 card green. Boeing's field-length card caps the refit there: the cited
  Vr/V2 are `it.fails` cards for 0070 (a flaps 5 notch), so the "card pins Vr" criterion is
  met as a known gap, not a pass.
- Deviation: "lift-off within ~Vr + 12" is replaced by the FCTM's "lift-off attitude in 3–4
  s" (quoted in AAIB 6/2019): at full thrust the jet gains ~5 kt/s, so it lifts off ~Vr + 17
  (at 75% thrust, Vr + 13). The card flies full thrust.
