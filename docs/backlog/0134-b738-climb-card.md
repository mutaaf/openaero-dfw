---
id: 0134
title: B738 card: the climb from 10,000 ft to the cruise level matches the published climb schedule and rate
status: shipped
priority: P2
size: M
lens: authenticity
created: 2026-11-02
pr: 167
---

## Why
The 737 has takeoff, go-around, final, cruise (0113), ceiling and descent (0119) cards, but nothing
between the lift-off and the top of climb: a player who climbs to FL350 (or a tour that does) meets
the thrust lapse and drag model with no check, and the thrust-lapse gap (0116) and ceiling gap
(0129) are only measured at their far ends. EUROCONTROL's Aircraft Performance Database lists a
nominal climb speed schedule and rate bands for the B738
(https://learningzone.eurocontrol.int/ilp/customs/ATCPFDB/details.aspx?ICAO=B738, graphs per
phase). Pilot-forum quotes of the 737-800 performance manual give 250 kt to FL100, then 280-300 kt,
then Mach 0.78 (secondhand: do not cite them as a source).

## What
Read the B738 climb figures from that APD page (write the values, the URL and the date read in the
card's comment). Fly the 737 at 65 t at full climb thrust through the schedule (250 kt CAS to
FL100, then the published CAS/Mach) in the headless harness and add cards in
`tests/flight/b738.test.js`, beside the 0113 and 0119 cards: the mean rate of climb between two
levels (e.g. FL100-FL200 and FL200-FL300) lies within ±20% of the published band. A card the model
misses becomes `it.fails` with its own ticket; no src change unless trivial. If the APD graphs
cannot be read as text from the sandbox, say so in the PR, add no uncited numbers, and open a
`proposal/` PR with the question instead.

## Acceptance criteria
- [x] A card quotes the APD climb figures with the URL and the date read
- [x] The climb rate at the published schedule is within ±20% of the band, or a known-gap card with
      a new ticket exists
- [x] No existing 737 card regresses; the 65 t mass and the harness helpers are the ones the other
      737 cards use

## Test plan
Flight cards as above; the card flies the schedule with the same pitch-hold helpers as 0113.

## Out of scope
VNAV logic, step climbs, any thrust-lapse change (0116), the buffet boundary (0129).
