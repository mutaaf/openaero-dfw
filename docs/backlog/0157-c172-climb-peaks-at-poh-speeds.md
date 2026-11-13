---
id: 0157
title: The Cessna climbs steepest at Vx (62 KIAS) and fastest at Vy (74 KIAS), as the POH says
status: proposed
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

## Builder findings (2026-11-06, not shipped; back to proposed)
Source now in hand: the Cessna 172S NAV III (GFC 700) information manual, a reprint of the POH
(172SPHBUS-00, 2007; hosted by CAP at sanfernando35.cap.gov/media/documents/c172gfc700poh_F8505EA32059C.pdf).
Section 4 gives Vx 62 KIAS at sea level and 67 KIAS at 10,000 ft, Vy 74 at sea level and 72 at 10,000 ft. Fig. 5-6
lists the climb speed by altitude (74 at sea level, 73 at 2,000-6,000 ft, 72 at 8,000-12,000 ft). The 10,000 ft
card now flies 72 (280 fpm, was 279 at 74).

There is still no prop thrust curve, so the "POH-derived excess-power fit" route was measured on
flightModel.js's own drag (steady climbs at 500 ft, 2 kt steps: drag lowest at ~72 KIAS, 993 N):
- **Vx alone is cheap.** T(62 KIAS) needs to beat T(68) by ~35 N and T(74) by ~40 N. The hump
  `[0, 2070] [20, 2160] [28, 2195] [32, 2200] [35, 2148] [38, 2105]` (unchanged above 38 m/s) turns
  vxGradient and vxPeak green, and so do steeper ones. Every other C172 card passes except the **15 kt crosswind
  takeoff**: its "wind is felt" check (mean pedal over the whole roll < −0.1, `tests/flight/c172.test.js`)
  reads −0.1006 today, a 0.6% margin, and any extra thrust through 40-60 KIAS takes it to −0.096 … −0.098 (the
  steady pedal, the roll's second half, stays −0.18). That check needs a decision before Vx can ship: it is not the
  Builder's to loosen. Scout or operator: either the shape is wrong or the check should read the steady pedal
  (harness.js already reports it).
- **Vy at 74 costs the 10,000 ft climb.** Vy needs thrust falling ~22 N per m/s through 38-42 m/s TAS. The
  table is in TAS and the climb at 10,000 ft flies 43-44 m/s, so it loses ~30-40 N there: 260-265 fpm against the
  card's 268 floor (POH 315, the model already −11%). A sharper fall (peak 2,370 N at 16 m/s) also took the takeoff
  roll to 802 ft (floor 816) and the ceiling card out of its band. Fixing Vy probably needs the altitude
  climb fixed first (the power lapse above 8,000 ft, the 10,000 ft and ceiling cards' shared −11%), or a thrust
  model in J with the rpm, not a TAS table.
- JSBSim was not touched (its prop76 table has the same flat shape).

## Out of scope
Vx/Vy at altitude, a HUD Vx marker, flaps-10 short-field climb speeds.

## Scout note (2026-11-13)
Demoted to proposed: three Builder runs found no citable source or decision for this; it waits for the operator to supply a source (commit the PDF or approve a fitted number) before it is ready again.
