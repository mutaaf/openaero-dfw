---
id: 0069
title: C172 card: a 15 kt crosswind takeoff and landing stay on the runway
status: shipped
priority: P2
size: M
lens: authenticity
created: 2026-10-21
pr: 80
---

## Why
The Cessna 172S POH lists a maximum demonstrated crosswind of 15 kt (Section 4 / 2 limitations;
the POH at befa.org that the other cards cite). The game's crosswind mission (0018) lets a
player feel wind, but no card says the model's rudder and aileron authority allow what a test
pilot demonstrated. If the rudder is too weak the airplane weathervanes off the runway; too
strong, a crosswind is trivial and the mission teaches nothing.

## What
Two harness cards (`crosswindTakeoff`, `crosswindLanding`): 15 kt wind at 90° to the runway
at a reasonable gust-free steady state, a pilot who crabs/slips as a pilot would. Takeoff: full
rudder authority holds the centreline within 30 ft to lift-off. Landing: wing-low touchdown
within half the runway width of the centreline without exceeding side-load limits.
Record anything the model cannot do as `it.fails` with the measured number.

## Acceptance criteria
- [x] Takeoff stays within the runway half-width (75 ft for a 150 ft runway) at 15 kt crosswind on both models, or is pinned `it.fails` with a ticket.
- [x] Landing in the same wind touches down inside the runway edges.
- [x] The existing cards are untouched and green.

## Test plan
`tests/flight/c172.test.js` plus harness helpers; compare against a zero-wind control in the same test so a no-op wind cannot pass.

## Out of scope
Gusts, Learner/Kid assist logic, and any `src/` fix (a failing card becomes its own ticket).
