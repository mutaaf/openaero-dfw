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

Why no cited tyre fix keeps it on a 150 ft runway: the jet rolls where its nose points, so the wind's
component across the runway stays on the fin whatever the heading (the air-relative velocity always carries the
crosswind's w across the track), and the weathervane keeps turning the nose into the wind: there is no steady
heading with the pedals neutral, and the drift grows with the length of the roll. The table shows it: at 25 s the
nose (1.94°) is already past the relative wind's angle off the runway (1.6°) and still turning, crossing the runway
at 74.1 · sin 1.89° ≈ 2.4 m/s. The crew's answer is the rudder pedals (the handbook's "weathervaning tendency"; not
re-read for this run). How fast the nose turns is set by the nose-tyre hold (gear.js noseWheelYawHold, a yaw-rate
hold at 30/s, not a slip-angle tyre); a cited tyre model (e.g. NASA TR R-64, Smiley & Horne 1960, not read for this)
would change the rate, and nothing here says by how much or which way. Fitting the hold's gain to keep this one roll
on the runway would be tuning to the card.

Pinned instead: `tests/flight/groundSteer.test.js` "the 5 kt drift is the weathervane" (flaps 5 and 10: the nose
and the drift go into the wind, and the nose is still turning into it at Vr). The KNOWN GAP (0172) card is unchanged.

**Needs the Scout or operator:** the card's "pedals neutral keeps a 150 ft runway" has no source, and the
physics says any long enough roll fails it. Suggested: re-aim it at a Pilot who uses the pedals (a centreline card
with the harness's rudder on the runway heading), then close 0172.
