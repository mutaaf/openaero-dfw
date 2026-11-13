---
id: 0172
title: The 737 keeps a 150 ft runway hands-off in a 5 kt crosswind on the flaps 5 roll
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-11-11
pr:
---

## Why
Found by 0070's physics panel. tests/flight/groundSteer.test.js flies the 737 in Pilot, pedals
neutral, wings level, full power to Vr in a 5 kt METAR crosswind (0110). At flaps 10 (Vr 135) the
airplane drifts ~16.9 m and the wheels stay on a 150 ft runway. At the takeoff spawns' flaps 5
(0070, Vr 145) the longer roll drifts ~20.7 m: a main wheel ~0.7 m past the edge. The card is
`it.fails('KNOWN GAP (0172): ...')`.

## What
Find why a 5 kt crosswind pushes the jet ~20 m sideways on a dry runway with the nose wheel centred
(tyre side force, cornering stiffness, the weathervane moment against the nose wheel's hold in
src/gear.js) and fix it from a cited tyre or crosswind-handling source, not a fitted number. If no
source turns up, record that.

## Acceptance criteria
- [ ] The 0172 card passes and is promoted to `it`
- [ ] The flaps 10 card and every other groundSteer card stay green

## Test plan
tests/flight/groundSteer.test.js.

## Out of scope
Rudder technique; Kid/Learner's centreline holds (already carded).
