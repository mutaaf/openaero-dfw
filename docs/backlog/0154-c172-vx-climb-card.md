---
id: 0154
title: Cessna card: the best angle of climb (Vx) beats Vy on gradient, from the POH table
status: ready
priority: P2
size: S
lens: authenticity
created: 2026-11-05
pr:
---

## Why
The Cessna has a Vy card (729 fpm at 74 KIAS, #42) but nothing for Vx, the speed pilots
fly to clear an obstacle. Every student learns "Vx gives the most height per distance, Vy
the most per time" (FAA-H-8083-3C Airplane Flying Handbook ch. 6,
https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/airplane_handbook). The
172S POH (Sect. 5, Rate of Climb / Takeoff Performance tables, already used by c172.test.js)
lists the Vx speed and the 50 ft obstacle distance. If the sim has them backwards, short-field
climbouts teach the wrong thing.

## What
`tests/flight/c172.test.js`: from the lift-off point, flaps up, full throttle, sea level ISA,
fly Vx and Vy for 60 s each. Assert (1) the climb gradient at the POH's Vx is higher than at Vy,
(2) the rate of climb at Vy is higher than at Vx, (3) the Vx gradient is within ±15% of the POH
rate/TAS at Vx. No `src/` change unless a card fails (then a KNOWN GAP and a ticket).

## Acceptance criteria
- [ ] The POH Vx and its figure number are in the test comment
- [ ] Gradient(Vx) > gradient(Vy) and rate(Vy) > rate(Vx) at sea level
- [ ] Vx gradient within ±15% of the POH
- [ ] `npm run check:fast` green

## Test plan
One new describe block using the existing climb harness.

## Out of scope
Obstacle-clearance mission, HUD Vx marker, hot/high Vx shifts.
