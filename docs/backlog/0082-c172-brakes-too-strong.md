---
id: 0082
title: C172 brakes stop it ~40% short of the POH, and the Cessna tips back onto its tail on the rollout
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
struts' normal forces: the tyres' braking friction acts below the CG (1.65 m, flightModel's
gearHeight; our JSBSim C172 puts the wheels 1.22 m below it: check which is right) and
adds no nose-down moment, so in flightModel.js full back elevator under braking lifts the
nose to a 15° wheelie (JSBSim, measured in #83, pitches ~2.5° nose down), which is why
the landing harness has to hold the nose on the runway instead of the POH's "full back".
(4) Primary for the wheelie: the C172's gear geometry in aircraft.js. The mains sit 0.3 m aft
of the CG (`gear.mainZ`) with the CG 1.73 m above the axles (`gearHeight` + `strokeM`), a
tip-back angle of atan(0.3/1.73) ≈ 9.8°, about the flare attitude (9.1° at touchdown). Past
it the mains are ahead of the CG and the runway pitches the nose up: with the stick neutral
after touchdown the nose never comes down (11-15° for the whole roll, nose load 0, 571 ft,
which would "pass" for the wrong reason), and with full back it rests at the 15° ground
pitch limit down to 5 kt, where the elevator has no authority (#83 panel probe). A friction
moment alone would hide this only while the brakes bite. (5) flightModel.js applies the
brake μ to the whole normal force, nose wheel included; the C172 has toe brakes on the
mains only (as src/fdm/jsbsim.js models them). (6) Separately, JSBSim floats too far: its
air segment is ~943 ft against the POH's 760 (+24%), so its `landTotal` passes only because
the short roll cancels it; once the roll is fixed its total is ~1520 ft, near the band edge.

## What
Fix the C172's gear geometry (mainZ / gearHeight against a cited source, so the tip-back
angle is a real Skyhawk's), add the tyre friction moment to gear.js (friction at each axle,
about the CG) so braking loads the nose wheel, and apply the brakes per wheel (mains only on
airframes without nose-wheel brakes). Then fit the C172's maximum brake decel (`spec.systems.brakes`) to
Fig. 5-11 on flightModel.js, and the JSBSim C172's brake (public/jsbsim) the same way,
citing the table. Check the 737 braking/autobrake cards and the crosswind rollout cards
don't regress.

## Acceptance criteria
- [ ] `landRoll` and `landTotal` pass on both models and drop out of `GAPS`
- [ ] With brakes on and the wheel full back from 50 kt, flightModel.js's nose-gear load stays > 0 and pitch stays ≤ 1° nose-up to the stop (gear.js unit test)
- [ ] `shortFieldLanding` flies the POH's "control wheel full back" after the nose wheel is down (the 0° nose hold is removed) and the nose wheel stays on the runway to the stop
- [ ] With the stick neutral after touchdown, flightModel.js's nose wheel comes down by itself (as gear.js's header promises)
- [ ] JSBSim's air segment (50 ft to touchdown) is within 15% of the POH's 760 ft, or pinned as its own gap
- [ ] No other flight card regresses (`npm test -- tests/flight`)

## Test plan
`npm test -- tests/flight`; a gear.js unit test that hard braking moves load onto the nose wheel.

## Out of scope
Anti-skid on the Cessna, tyre models, grass runways (Fig. 5-11 note 3).
