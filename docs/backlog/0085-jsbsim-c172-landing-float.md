---
id: 0085
title: JSBSim's Cessna floats 24% too far in the short-field flare
status: shipped
priority: P2
size: M
lens: authenticity
created: 2026-10-23
pr: 92
---

## Why
POH Fig. 5-11 (p. 5-23) puts 760 ft between the 50 ft obstacle and touchdown in a
short-field landing (1335 ft total less the 575 ft roll, sea level, 15 °C). Flown by the same
harness pilot (tests/flight/harness.js `shortFieldLanding`: 61 KIAS, flaps 30, idle, a flare
to a near-stall touchdown), flightModel.js covers 754 ft, JSBSim 943 ft (+24%). JSBSim's
total (1485 ft) is only inside the band because the roll is a little short. A pilot on
`?fdm=jsbsim` floats down the runway where a real Skyhawk would be on the ground.

## What
Measure where JSBSim's extra distance comes from before fitting: the approach speed it holds
(the speed hold on JSBSim's real pitch stability), the idle prop's drag (public/jsbsim
`engine/prop76.xml` against flightModel.js's `windmillCd`, fitted to the POH's ~9:1 glide),
and ground effect in `public/jsbsim/aircraft/c172/c172.xml` (the flare happens in it). Fix
what is wrong in the JSBSim data, citing the POH; don't tune the harness pilot per model.

## Acceptance criteria
- [x] `landAir` (tests/flight/c172.test.js) passes on JSBSim and drops out of `GAPS.jsbsim`
- [x] `landRoll` and `landTotal` still pass on both models
- [x] No other flight card regresses (`npm test -- tests/flight`), including the glide and
      climb cards

## Test plan
`npm test -- tests/flight`; the `landAir` card is the measure.

## Out of scope
flightModel.js's flare (it is within 1%); the C172's gearHeight (0082 notes).

## Outcome (2026-10-24)
Measured first: JSBSim's idle glide at 61 KIAS flaps 30 was 7.24:1 against flightModel.js's
7.09:1, and the flare (20 ft to touchdown) was within 1%, so the prop drag, ground effect and
speed hold were not the cause. The float was the spawn: JSBSim's `propulsion/set-running`
starts the engine at 2,283 rpm and 137 hp whatever the throttle, and with the throttle closed
the propeller took ~3 s to wind down, so the first 150-190 ft after "50 ft, power off" were
powered. src/fdm/jsbsim.js now lets the engine settle at the body's throttle with JSBSim's
integrators off (the airframe holds still) on every airborne spawn. Air segment 943 → 751 ft
(POH 760), roll 542, total 1293 (POH 575 / 1335).

Found on the way, not changed here: the harness's `shortFieldLanding` starts at level flight's
attitude on a 3° path (AoA 3° above trim), and JSBSim's spawn trim keeps whatever elevator the
pilot holds at that instant as the opposite trim.
