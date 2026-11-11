---
id: 0175
title: Cessna balked-landing climb card: full power, flaps 30 to 20, the POH rate of climb
status: ready
priority: P2
size: S
lens: authenticity
created: 2026-11-11
pr:
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
