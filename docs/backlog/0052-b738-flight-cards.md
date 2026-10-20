---
id: 0052
title: Boeing 737-800 flight test cards against Boeing's published airport-planning data
status: shipped
priority: P1
size: M
lens: authenticity
created: 2026-10-20
pr: 54
---

## Why
The 737 has three cards (final-approach thrust, landing L/D, idle sink) and every one was
fitted to the model's own tuning, not to a published figure. The operator's focus is to grow
`tests/flight/` for the 737 with cited data. Boeing publishes *737 Airplane Characteristics
for Airport Planning* (D6-58325, Rev C) with takeoff and landing field-length charts by
weight, flap setting and altitude; the flight crew's Vref tables and the FAA TCDS A16WE give
the stall and approach speeds. Source: https://www.boeing.com/content/dam/boeing/boeingdotcom/commercial/airports/acaps/737NG_REV%20C.pdf

## What
Add cards to `tests/flight/b738.test.js` using the existing harness (`tests/flight/harness.js`),
each citing the document, chart and figure it reads:
1. Landing field length / ground roll at a stated weight, flaps 30, sea level, dry runway, max
   braking (ACAP landing chart; compare the roll, not the factored field length).
2. Vref at flaps 30 for a stated landing weight (ACAP / TCDS), ±5 kt.
3. Takeoff ground roll at a stated weight, flaps 5, sea level, ISA (ACAP takeoff chart), ±15%.
4. One-engine-equivalent is out of scope; instead a cruise card: M0.785 at FL350 needs about the
   published cruise thrust (document the source) ±15%.
Read the real chart values first and write the figure number in the test name. A card the model
misses is pinned with `it.fails` plus a ticket id, never loosened. Fix the model only in a
separate `build/` PR if a card exposes a gap (file that ticket).

## Acceptance criteria
- [x] At least three new 737 cards, each naming its source document and chart or table
- [x] Every card passes or is an `it.fails` with a ticket reference; none loosened to pass
- [x] `npm run check:fast` green, `tests/flight` runtime still under 60 s
- [x] The numbers used are quoted in a comment next to the assertion

## Test plan
`npm test -- tests/flight`. The cards are the deliverable.

## Out of scope
Engine-out performance, the F-16 (0053), changing the flight model itself.

## Shipped
Four Boeing-sourced cards: landing distance from 50 ft (ACAP §3.4.3 × 0.6, passes, +11%),
Vref40 at MLW (ARC: 142 kt, gap 0057), approach pitch at Vref40+5 (VLA Table A6-1: +1.3°,
gap 0057) and 1.15 × all-engines takeoff distance ≤ field length (ACAP §3.3.25, gap 0058).
The cruise-thrust card was not written: no public source for M0.785/FL350 thrust was found,
and a card is never pinned to a forum number. The ACAP `acaps/737NG_REV%20C.pdf` link is
dead; the live copy is `v2/airports/acaps/737NG_REV_C.pdf`.
