---
id: 0037
title: Apply lift and drag in wind axes, not body axes
status: shipped
priority: P0
size: M
lens: authenticity
created: 2026-10-18
pr: 42
---

## Why
`src/flightModel.js` applies lift along the body Y axis and drag along body Z. Lift is
perpendicular to the relative wind and drag is parallel to it; at angle of attack α,
body-axis lift leans aft by α and acts as extra drag of L·sin α. At the C172's glide AoA
(~7°) that is ~12% of the weight: the flight test card measures a 4.6:1 glide where the
POH gives ~9:1 (1.5 NM per 1000 ft at 68 KIAS); it blocks 0036 (dead-stick glide, 8–11:1). Every climb, glide and approach is
affected; pilots notice the airplane "falling out of the sky" at idle.

## What
In `stepFlightModel`, build the lift and drag forces in the wind (stability) frame from
α and β and rotate them to body axes (lift ⟂ relative wind in the plane of symmetry,
drag along −relative wind, sideforce from β). Keep thrust along the body X axis. Then
re-check and re-tune what leaned on the old behaviour: `trimAoaDeg` spawn trim, the
autoland/autothrottle gains in `autopilot.js`, the coach, and `tests/e2e/flight.spec.js`.

## Acceptance criteria
- [x] `tests/flight/c172.test.js` glide card promoted from `it.fails` to `it` and passing (9.1:1 ±15%)
- [x] All other flight cards still pass or remain documented gaps; none regress
- [x] Autoland on KDFW 35C still lands (e2e `flight.spec.js`), coach final still flyable
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse
- [x] No frame-time regression (e2e perf probe within budget)

## Test plan
Promote the glide card; add a unit test that at α = 10° with zero thrust the
along-path force is −D only (no lift component along the velocity vector).

## Out of scope
Atmosphere (0038), thrust model (0039), flap CLmax (0040).
