---
id: 0082
title: C172 brakes stop it ~40% short of the POH, and braking doesn't push the nose down
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-10-22
pr:
---

## Why
The POH short-field landing cards (0051, tests/flight/c172.test.js `landRoll`/`landTotal`)
fly Fig. 5-11 (p. 5-23: 575 ft roll, 1335 ft from 50 ft at sea level, 15 °C). From the same
near-stall touchdown both models stop in ~355-370 ft: they decelerate at ~0.36 g where the
book's roll averages ~0.2 g from a 50 kt touchdown. A player on the raw airplane stops far
shorter than a real Skyhawk, so short-field numbers learned in the sim don't transfer.
Likely causes, to measure before fitting: (1) flightModel.js treats the C172's toe brakes
as tyre-limited (μ 0.45, systems.js DEFAULTS); a light single's small disc brakes are
torque-limited well below the tyre's grip; (2) the transition from touchdown to full
braking (nose down, flaps up) is instant in the harness; (3) gear.js applies only the
struts' normal forces: the tyres' braking friction acts ~1.7 m below the CG and adds no
nose-down moment, so in flightModel.js full back elevator under braking lifts the nose
to a 15° wheelie (JSBSim pitches ~2.5° nose down, as the real airplane does), which is why
the landing harness has to hold the nose on the runway instead of the POH's "full back".

## What
Add the tyre friction moment to gear.js (friction at each axle, about the CG), so braking
loads the nose wheel. Then fit the C172's maximum brake decel (`spec.systems.brakes`) to
Fig. 5-11 on flightModel.js, and the JSBSim C172's brake (public/jsbsim) the same way,
citing the table. Check the 737 braking/autobrake cards and the crosswind rollout cards
don't regress.

## Acceptance criteria
- [ ] `landRoll` and `landTotal` pass on both models and drop out of `GAPS`
- [ ] With brakes on and the wheel full back, flightModel.js keeps the nose wheel on the runway (a unit or flight test)
- [ ] No other flight card regresses (`npm test -- tests/flight`)

## Test plan
`npm test -- tests/flight`; a gear.js unit test that hard braking moves load onto the nose wheel.

## Out of scope
Anti-skid on the Cessna, tyre models, grass runways (Fig. 5-11 note 3).
