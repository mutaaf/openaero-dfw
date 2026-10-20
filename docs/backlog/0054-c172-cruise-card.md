---
id: 0054
title: Cessna 172S cruise speed and fuel-flow cards from the POH performance tables
status: shipped
priority: P2
size: S
lens: authenticity
created: 2026-10-20
pr: 53
---

## Why
The C172 cards cover stalls, takeoff roll, climb, glide and turns, but not cruise, which is
where most of a real flight is spent and where a wrong drag or power lapse shows. The 172S POH
(Section 5, Cruise Performance table, e.g. 2,500 / 5,000 ft, 2,400 rpm) gives true airspeed at
75%, 65% and 55% power, and an earlier fix (#42, gear drag) was found only because top speed
was 155 kt instead of the POH's ~126. Pin it with a card so the next drag change cannot
regress it silently. Source: the Cessna 172S POH (the PDF already cited in tests/flight/c172.test.js).

## What
A harness helper that trims level at a given altitude and holds a power setting, then cards at
5,000 ft: ~75% power gives the POH KTAS (±5%), and 55% gives its lower KTAS (±5%). Run on both
flightModel.js and JSBSim like the other C172 cards; pin any miss with `it.fails`.

## Acceptance criteria
- [ ] Two cruise cards quote the POH table row they read (altitude, power, rpm, KTAS)
- [ ] Both flight models are exercised; a miss is `it.fails` with a ticket, never loosened
- [ ] The harness pilot is shown to settle (print IAS over a minute) before trusting the number

## Test plan
`npm test -- tests/flight`.

## Out of scope
Fuel burn and range accuracy beyond a single KTAS pair, leaning procedures.
