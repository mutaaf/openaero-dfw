---
id: 0081
title: Side force and dihedral in a sideslip, so a crosswind slip needs a believable wing-low bank
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-10-22
pr:
---

## Why
The 0069 crosswind cards (PR #80) found that `src/flightModel.js` has no side force from
sideslip (fuselage and fin; Roskam CYβ −0.31 for the C172) and no roll from it (dihedral
effect; Roskam Clβ −0.089). Sideways, only drag's component pushes. In a 15 kt wing-low
slip at 70 KIAS (β ≈ 12.5°) our model holds the centreline with ~1.2° of bank. JSBSim,
flying our `public/jsbsim/` C172 built on those Roskam derivatives, needs ~4.2°. On the
takeoff roll the wind never asks for aileron. A pilot practising crosswind landings in the
game learns the wrong amount of wing-low, and the POH's "ailerons into the wind" does
nothing.

## What
In `stepFlightModel`: a body side force `CYβ·β·q·S` (per-aircraft `spec.cyBeta`, from
Roskam / the JSBSim data for the C172, a cited estimate for the 737 and F-16), and a
roll moment from sideslip (`spec.clBeta`) in the rate model, scaled like the existing
roll terms. Check the autopilot's and the assists' coordination laws still settle (lesson
2026-10-19: a model with real stability shows the control laws' shortcuts).

## Acceptance criteria
- [ ] The `it.fails` card "banks for a 15 kt wing-low slip within 30% of JSBSim" in `tests/flight/c172.test.js` passes and is promoted to `it`
- [ ] Every other card in `tests/flight` stays green (turns, stalls, crosswind, 737, F-16)
- [ ] Kid and Learner still line up and land in today's wind (e2e missions green)

## Test plan
`npm test -- tests/flight`; the gap card is the test that fails without the change.

## Out of scope
Rudder side force (CYδr), adverse yaw, propeller slipstream effects.
