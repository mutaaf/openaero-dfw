---
id: 0157
title: The Cessna climbs steepest at Vx (62 KIAS) and fastest at Vy (74 KIAS), as the POH says
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-11-05
pr:
---

## Why
Found by 0154's cards (`tests/flight/c172.test.js`, "Cessna 172S Vx vs Vy"). The C172S POH Section 4
(Airspeeds for Normal Operation) gives Vx 62 KIAS and Vy 74 KIAS at sea level, flaps up. In both
flight models the best gradient comes at 70-74 KIAS and the best rate near 81 (flightModel.js) and
85 KIAS (JSBSim), 7-11 kt high: at full throttle from 500 ft, flightModel.js climbs 8.85% at 62 KIAS against 9.11% at 74
(JSBSim 8.39% vs 8.76%), and 687 fpm at 74 against 700 at 80 (JSBSim 661 vs 690). A student who
flies Vx over an obstacle in the game clears it lower than at Vy, the opposite of the handbook
(FAA-H-8083-3C ch. 6). The Vy rate card (729 fpm ±10%) still passes because the rate curve is flat.

flightModel.js's full-throttle thrust table (`src/aircraft.js` c172 thrustTableN) is flat from 0 to
38 m/s (2070 → 2105 N), so excess thrust peaks at the minimum-drag speed. A real fixed-pitch prop
makes most thrust static and loses it as it speeds up. A mutation to 3,000 N static falling to
1,700 N at 50 m/s turned the gradient and Vy cards green but pushed the best angle below 56 KIAS, so
the static end needs a source, not a guess. The 2070 N static figure is measured (the static-thrust
study aircraft.js cites): the shape between 0 and 38 m/s is what is unknown. JSBSim (public/jsbsim C172, prop76)
shows the same peaks and needs its own look.

## What
Find a cited thrust (or Ct/Cp vs J) curve for the 172's fixed-pitch prop (for example the
prop file JSBSim's own c172p model ships (check which prop it is), a UIUC propeller database entry of
similar pitch/diameter, or a POH-derived excess-power fit from Fig. 5-6 plus Vx), reshape
thrustTableN under 38 m/s from it, and check the same for public/jsbsim. Keep every other C172 card
(the 729 fpm Vy climb, the short-field takeoff roll, the 124 KTAS cruise, the ceiling) green.

## Acceptance criteria
- [ ] A clear peak, not a 1 fpm win: flightModel.js's vyPeak misses by only 13 fpm today, on a
      flat curve, so a drag tweak could flip it without fixing the shape
- [ ] 0154's `vxGradient`, `vxPeak` and `vyPeak` cards promoted from `it.fails` to `it` for the
      model(s) fixed
- [ ] Every other C172 card passes unchanged
- [ ] The thrust shape's source is cited in `src/aircraft.js`

## Test plan
The three 0154 cards; the full `tests/flight/c172.test.js`.

## Out of scope
Vx/Vy at altitude, a HUD Vx marker, flaps-10 short-field climb speeds.
