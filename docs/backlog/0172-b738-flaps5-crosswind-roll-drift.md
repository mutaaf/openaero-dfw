---
id: 0172
title: The 737 keeps a 150 ft runway hands-off in a 5 kt crosswind on the flaps 5 roll
status: proposed
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

## Builder findings (2026-11-13, not shipped; back to proposed)
Traced the hands-off roll (pedals neutral, wings level, full power, the 5 kt METAR wind from the right at the
wheels' log-law ~2.1 m/s). The drift is not the tyres sliding: the CG's side slip (flightModel.js's stiff
`-vSide · m · 4` tyre term) is under 0.06° of track the whole roll. It is the heading: the nose turns into the wind
at a near-steady ~0.08°/s and the jet rolls where it points, so it drifts **upwind** (right), not downwind.

| t (s) | GS (m/s) | nose right (°) | track right (°) | relative wind (°) | off (m) |
|---|---|---|---|---|---|
| 5 | 16.5 | 0.39 | 0.34 | 7.2 | 0.2 |
| 10 | 32.2 | 0.75 | 0.70 | 3.7 | 1.3 |
| 15 | 47.1 | 1.12 | 1.07 | 2.6 | 4.4 |
| 20 | 61.1 | 1.51 | 1.46 | 2.0 | 10.4 |
| 25 (Vr 145) | 74.1 | 1.94 | 1.89 | 1.6 | 20.3 |

Flaps 10 is the same curve to Vr 135 at 23 s (16.9 m): it passes only because its roll is ~2 s shorter.

Why no cited tyre fix keeps it on a 150 ft runway: a tyre makes no side force at zero slip, so with the nose wheel
centred and no pedal the steady state is the nose on the relative wind (β = 0) and the airplane rolling across the
runway at the crosswind's own speed; the hands-off drift is bounded by **wind × time**: 52.8 m to Vr 145 here
(48.6 m to Vr 135). Tyre stiffness only sets how fast the nose gets there. The model's nose-tyre hold (gear.js
noseWheelYawHold, 30/s on the yaw rate) is already the stiff end: an uncited estimate with a typical aircraft-tyre
cornering power (~0.1 of the load per degree; the nose pair carries ~60 kN) gives a tyre yaw damping ~1e6 N·m·s,
against the hold's ~7e7 (2.39e6 kg·m² × 30/s). A real tyre model (NASA TR R-64, Smiley & Horne 1960, not read for
this) would let the nose reach the wind sooner and drift *more*. The real crew answer is the rudder pedals.

Pinned instead: `tests/flight/groundSteer.test.js` "the 5 kt drift is the weathervane" (flaps 5 and 10: the nose
and the drift go into the wind, and the drift stays under wind × time). The KNOWN GAP (0172) card is unchanged.

**Needs the Scout or operator:** the card's "pedals neutral keeps a 150 ft runway" has no source, and the physics
says it can fail on any long enough roll. Options: re-aim it at a pilot who uses the pedals (a Pilot-level
centreline card), or bound it by the weathervane's wind × time and drop the 150 ft runway, then close 0172.
