---
id: 0135
title: 737 climbs ~3,400 ft/min from FL100 to FL150 at 290 kt, ~70% above EUROCONTROL's 2,000
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-11-02
pr:
---

## Why
Found carding 0134. At 65 t, clean, full throttle, holding 290 KCAS, the model climbs ~3,400
ft/min between FL100 and FL150; EUROCONTROL's Aircraft Performance Database (B738, read
2026-11-02, learningzone.eurocontrol.int/ilp/customs/ATCPFDB/details.aspx?ICAO=B738) lists
2,000 ft/min for the 290 kt climb to FL150. The same schedule is within the band higher up
(FL150-FL240: ~2,375, +19%; 290 KCAS then Mach 0.78, FL240-FL350: ~1,350 vs 1,500), so the excess
sits low down. A 737 that leaps to FL150 makes every departure and climb-out too easy and puts
the top of climb too close to the field.

## What
Find the cause before changing anything. Candidates: full throttle below FL350 is the takeoff
rating (240 kN static, σ^0.94, `src/aircraft.js`), not max climb thrust (only FL350 is anchored
to CFM's max climb figure, 0116), and the APD gives no mass, but mass is not the answer:
at 79 t (the TCDS take-off mass) the same climb is still ~2,590 ft/min (+29%), so the thrust
lapse below FL350 is the lead. Find a cited max-climb thrust or a cited climb rate vs weight (FCOM/FPPM, CFM, BADA)
and fit to it; do not tune to make the card pass.

## Acceptance criteria
- [ ] `tests/flight/b738.test.js` "KNOWN GAP (0135)" becomes a passing `it`
- [ ] The other 0134 climb cards, the takeoff, go-around, cruise and ceiling cards do not regress

## Test plan
Promote the flight card; add a unit check of the thrust source used.

## Out of scope
VNAV, derated or assumed-temperature takeoff, the ceiling (0129), the idle descent (0126).
