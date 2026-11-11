---
id: 0175
title: Cessna balked-landing climb card: full power, flaps 30 to 20, the POH rate of climb
status: shipped
priority: P2
size: S
lens: authenticity
created: 2026-11-11
pr: 232
---

## Why
The POH certifies a balked landing: full throttle, flaps at the landing setting, climb out. It
is the number that decides whether a go-around from a low final works, which the go-around
mission (0047) asks every player to fly, yet the cards cover only the clean Vy/Vx climbs
(0054, 0154) and the 737's gradient (0083, 0168). Read the Cessna 172S POH Section 5 "Rate of
Climb - Balked Landing" (flaps 30, full throttle, 2,550 lb) and cite the page and figure; if
the POH values are not machine-readable, say so in the ticket's notes and use the CFR 23.77
floor (the balked-landing climb must reach at least 3.3% gradient at the speed 1.3 Vs0).
Source: https://www.ecfr.gov/current/title-14/chapter-I/subchapter-C/part-23 (versioner API in docs/LESSONS.md works from here).

## What
`tests/flight/c172.test.js`: 2,550 lb, sea level ISA, flaps 30, full throttle, gear fixed, pilot
holds 1.3 Vs0 (~62 KIAS): measure the climb rate over 10 s after the pitch settles; assert
within ±15% of the POH figure, or ≥ 3.3% gradient. A second assertion: the coached go-around
(the lever raises flaps to 20 as the 0047 mission coaches) climbs at least as well. A miss ships
as `it.fails` with its own ticket; no physics change in this ticket.

## Acceptance criteria
- [ ] Card cites the source page/figure or CFR section in its name.
- [ ] Both measurements are taken under the same conditions (gear, flaps, time window), per docs/LESSONS.md 2026-11-11.
- [ ] `node scripts/check-backlog.mjs` and the flight suite pass.

## Test plan
The card above; mutation check: removing the thrust model's full-throttle lapse fails it.

## Out of scope
Changing flightModel.js, the 737 and the F-16.

## Notes (Builder, 2026-11-11)
The 172S POH (July 8/98, Rev. 4, befa.org copy, read with `pdftotext -layout`) has no balked-landing
climb chart: Section 5's figures are 5-1 to 5-11 (5-6 is the clean maximum rate of climb), and Section 4
gives only the procedure (p. 4-5 "Maximum Power, Flaps 20°, 60 KIAS"; p. 4-17 checklist; p. 4-34
amplified). So the card is 14 CFR 23.77(a) as in force until 2017-08-30 (eCFR versioner: 3.3% at sea
level, takeoff power, gear extended, landing flaps, at VREF), with VREF from 23.73(a) (at least 1.3 VS1:
1.3 x 48 KCAS = 62.4). Both climbs fly 63 KCAS (the POH's 60 KIAS through Fig. 5-1, flaps 10 and 30).
Measured (both models, 63 KCAS, settled 60 s from 500 ft, 10 s window at ~840-1,020 ft): flaps 30
5.59% / 360 fpm (flightModel.js), 5.13% / 331 (JSBSim); the lever at 20: 6.65% / 429, 6.20% / 400.
Mutations: the C172's thrust table x0.85 takes flaps 30 to 2.98% (flightModel.js; fails), the throttle lever at 0.85 to 2.73% / 2.90%; flaps 20 given flaps 30's
drag climbs +0.3% (fails the >5% comparison). No physics change; no gap found.
Validation panel (first-timer): the ticket's "the coached go-around (the lever raises flaps to 20 as the 0047
mission coaches)" does not hold for the game's Cessna: its finals fly flaps 20 (aero.js landingFlaps, no
landingFlapsIndex on the c172), so the go-around coach asks it for flaps 10; the drill itself flies the
selected aircraft (the 737 by default). The card flies the POH's own go-around (30 to 20) and says so.
Whether the Cessna's finals should be flaps 30 is a separate question for the Scout.
Validation panel (physics): the Test plan's "removing the thrust model's full-throttle lapse fails it" cannot
hold for a one-sided floor: removing engine.js's piston lapse adds thrust (flaps 30 5.59% -> 6.19%, still
passing). The thrust x0.85 and throttle 0.85 mutations above replace it. The go-around run now spawns at
flaps 30 and moves the lever to 20 after 0.5 s (before, the lever was set before the first step and the
flaps were seeded at 20).
