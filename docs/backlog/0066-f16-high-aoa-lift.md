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
10% high at 25° (1.72 vs 1.56), where the real curve bends over towards its ~1.89 peak near
35°. With the jet's 25° AoA limiter (TP-1538 p. 12), its slowest 1-g flight at 12 t is about
129 KIAS; the model flies to 117 and stall-warns at 120 (`stallCleanKts`), so a pilot can
hang the F-16 ~10 kt slower than the real one.

## What
Refit the F-16's lift above ~20° AoA in `src/aircraft.js` / `src/aero.js` (a per-airframe
CL table or a second slope, without touching the C172 or 737) so CL(25°) matches NASA's
1.56, and either stall at NASA's peak or add a 25° AoA limit to the F-16's assists. Set
`stallCleanKts` from the result. Promote the two `KNOWN GAP (0066)` cards to `it`.

## Acceptance criteria
- [ ] Both 0066 cards in `tests/flight/f16.test.js` promoted to `it` and green
- [ ] The 20° card and every C172 and 737 card stay green
- [ ] `npm test -- tests/flight` green

## Test plan
The cards are the test.

## Out of scope
The full flight-control system (g limiter, pitch-rate command); leading-edge flap scheduling.
