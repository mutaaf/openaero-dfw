---
id: 0135
title: 737 climbs ~3,400 ft/min from FL100 to FL150 at 290 kt, ~70% above EUROCONTROL's 2,000
status: shipped
priority: P2
size: M
lens: authenticity
created: 2026-11-02
pr: 174
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

## Outcome
The cause is the rating, not the airframe: full throttle is the take-off/go-around rating
(240 kN static, σ^0.94; 57.5 kN per engine at FL125, Mach 0.55, ~3% above Bartel & Young's
take-off lapse there, a single-point check outside eq. 11's take-off range), while APD's rates are a crew's climb on the max climb (CLB) rating.
`src/engine.js` maxClimbThrustN is Bartel & Young's climb-thrust lapse (J. Aircraft 45(4), 2008,
eqs. 15-19; OpenAP's fits of their tables) anchored to CFM's 26.5 kN max climb at FL350, Mach 0.8
(`spec.engine.climb`): 45.1 kN per engine at FL125, ~22% under full throttle there (~24% at FL100),
equal at FL350 and capped at full throttle above it. On it the 737 climbs ~2,190 ft/min FL100-FL150 (+9%) and ~1,690 FL150-FL240 (-15%). Full
throttle and every other card are unchanged (the go-around, windshear and take-off cards use the
take-off rating, as a real TO/GA does). The FL240-FL350 Mach climb on CLB is ~1,185 (-21%): 0139.
The Why's "too easy" concern is not what the card measured: full throttle is the levers fully
forward, which on a 737NG gives full-rated take-off thrust (there is no CLB detent), and ~3,400
ft/min on it is consistent with that rating (B&Y's take-off lapse, ~3% at FL125); it is not checked
against a measured full-thrust climb. The gap was in what the card compared. A unit card checks full
throttle at FL125 against Bartel & Young's take-off lapse (CFM56-7B26: 117 kN, BPR 5.1).
