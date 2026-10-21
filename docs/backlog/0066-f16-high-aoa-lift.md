---
id: 0066
title: Bend the F-16's lift curve over above 20° AoA like NASA's wind-tunnel data
status: proposed
priority: P2
size: M
lens: authenticity
created: 2026-10-21
pr:
---

## Why
0053's cards (`tests/flight/f16.test.js`) compare the F-16's lift with NASA TP-1538
(https://ntrs.nasa.gov/citations/19800005879, Table III, the F-16's wind-tunnel data). The
model's lift is a straight line to a 28° stall (CL 1.91): within 2% of NASA at 20° AoA, but
10% high at 25° (1.72 vs 1.56). NASA's curve is not a smooth bend: from the same Table III
rows (β = 0, δh = 0, CL = −CZ·cos α + CX·sin α) it is 1.38 at 20°, 1.56 at 25°, 1.82 at 30°
and peaks ~1.89 near 35°, so a fit to the 25° point alone gets the shape wrong. With the jet's 25° AoA limiter (TP-1538 p. 12), CL(25°) puts the power-off 1-g speed
at 12 t, sea level, at about 129 KEAS (our own sum from NASA's CL, untrimmed). The model's
power-off stall is 117 kt and its stall warning (stall + 5 kt, `stallWarningKts`) ~122, so
a pilot can hang the F-16 ~10 kt slower than its lift supports.

## What
Refit the F-16's lift above ~20° AoA in `src/aircraft.js` / `src/aero.js` (a per-airframe
CL table or a second slope, without touching the C172 or 737) so CL(25°) matches NASA's
1.56. Then set `alphaStallDeg` to 25° (the limiter's AoA, so `stallSpeedKts` and the stall
warning follow) or to NASA's peak near 35°, whichever the 129 kt card is written against;
say which in `aircraft.js`. A limiter in the assists alone does not pass the card (it does not
change `stallSpeedKts`, and Pilot has no assists). `stallCleanKts` is read by nothing:
delete it or wire it. Promote the two `KNOWN GAP (0066)` cards to `it`.

## Acceptance criteria
- [ ] Both 0066 cards in `tests/flight/f16.test.js` promoted to `it` and green
- [ ] A new card pins CL(30°) to NASA's 1.82, ±5% (CX 0.15360, CZ −2.00800)
- [ ] The 20° card and every C172 and 737 card stay green
- [ ] `npm test -- tests/flight` green

## Test plan
The cards are the test.

## Out of scope
The full flight-control system (g limiter, pitch-rate command); leading-edge flap scheduling.
