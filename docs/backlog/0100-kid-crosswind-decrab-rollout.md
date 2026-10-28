---
id: 0100
title: Kid de-crabs in the flare and holds the centreline on the rollout in a crosswind
status: proposed
priority: P2
size: S
lens: player-feel
created: 2026-10-27
pr:
---

## Why
Since 0097 Kid's hands-off final flies the ground track, so in a crosswind the airplane
arrives on the centreline crabbed 5-8° into the wind. Nothing de-crabs it: on the ground
`shapeControls` (src/assists.js) hands the controls back to the player, a hands-off kid's
rudder is 0, and the tyres' side force (src/flightModel.js, "rolls where it points") carries
it along the nose. In the Cessna that is ~3-4 m/s sideways at touchdown speed, so on a 30 m
runway it can reach the edge within seconds while the results card is up (found by 0097's
first-timer panel from the code; measure it before building). Pilots kick the nose straight
with rudder in the flare and hold the centreline with rudder and into-wind aileron on the
rollout (FAA-H-8083-3C ch. 9, crosswind approach and landing).

## What
In assists.js shapeControls (Kid, wheels below the flare height): rudder to bring the nose to
the track before touchdown (bank cap already keeps the wings near level); on the ground,
Kid's hands-off rudder steers the nose wheel onto the centreline until taxi speed.

## Acceptance criteria
- [ ] Headless: Kid's Cessna pattern card in a 10 kt crosswind touches down within 2° of the
      track and stays within 8 m of the centreline for 20 s of rollout
- [ ] A calm Kid landing and Pilot's ground handling unchanged
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
Extend tests/flight/pattern.test.js to keep flying 20 s past touchdown and record the drift
at touchdown and the rollout's cross-track.

## Out of scope
Learner and Pilot (the coach already says "de-crab" for them).
