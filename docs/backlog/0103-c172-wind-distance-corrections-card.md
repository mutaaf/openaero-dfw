---
id: 0103
title: C172 card: headwind and tailwind change the takeoff and landing roll like the POH notes say
status: ready
priority: P2
size: S
lens: authenticity
created: 2026-10-28
pr:
---

## Why
Real weather is pillar 3, and the wind already pushes the airplane around, but no card checks
that a headwind or tailwind changes the runway you need by the amount the book gives. The
172S POH prints the correction under both distance charts: Figure 5-5 note 3 (short field
takeoff) and Figure 5-11 note 2 (short field landing): "Decrease distances 10% for each 9 knots
headwind. For operation with tail winds up to 10 knots, increase distances by 10% for each 2
knots" (https://www.befa.org/wp-content/uploads/2019/12/POH-Cessna-172S.pdf, section 5). That
is a ground-speed effect a flight model should produce on its own; if it does not, the
"IAS is not groundspeed" claim on the weather line is only half true. Existing cards fly
calm air (0064, 0051) and the 15 kt crosswind; none flies a headwind or a tailwind roll.

## What
Add cards to `tests/flight/c172.test.js` (both models, like the neighbouring cards) that
rerun the existing 0064 takeoff harness and the 0051 landing harness with the wind from
dead ahead and dead astern:
- takeoff ground roll in a 9 kt headwind is 90% (±6 points) of the calm roll; in a 6 kt
  tailwind it is 130% (±8 points);
- landing ground roll (short-field technique, the 0051 pilot) in a 9 kt headwind is 90%
  (±6 points) of calm; in a 6 kt tailwind 130% (±8 points).
Print the calm and windy distances. If a model misses, record `it.fails` with a short note and
open a ticket for the cause (wind applied to airspeed only, rolling friction and brakes
not scaled by ground speed) instead of retuning coefficients.

## Acceptance criteria
- [ ] Four cards per model cite Fig. 5-5 note 3 and Fig. 5-11 note 2 and print calm and windy distances
- [ ] Wind is the sim's own `sim.wind` (same path the METAR uses), not a faked velocity
- [ ] A card that misses is `it.fails` with a follow-up ticket, never loosened past the stated bands
- [ ] `npm run test:unit` time grows by under 5 s

## Test plan
Headless flight cards only; no e2e. The cards must fail if the wind is zeroed (control run).

## Out of scope
Grass runways, slope, crosswind (already carded), the 737 and F-16.
