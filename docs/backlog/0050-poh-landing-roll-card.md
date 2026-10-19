---
id: 0050
title: Replace the brakes card with the POH short-field landing roll, for both flight models
status: ready
priority: P2
size: S
lens: authenticity
created: 2026-10-19
pr:
---

## Why
The brakes card (tests/flight/c172.test.js) uses a reference that flightModel.js assumes
(braking μ 0.45, ≈ 102 m from 58 kt). It is not a published figure. JSBSim brakes the main
wheels only and moves the load onto the nose wheel, giving 0.36 g and 138 m, so the card is
a known gap for JSBSim. The POH publishes the real number: short-field landing, 2550 lb,
flaps 30, maximum braking, sea level 15 °C, ground roll 575 ft (Section 5, landing distance
table).

## What
A harness `shortFieldLanding(spec)` that touches down at the POH technique speed and brakes
to a stop, then a card for both models against 575 ft (±15%). It replaces the μ card.

## Acceptance criteria
- [ ] The landing-roll card cites the POH table and runs on flightModel.js and JSBSim
- [ ] The μ-based brakes card is removed, along with JSBSim's 'brakes' known gap
- [ ] A model that misses the card is pinned with `it.fails`; no reference is loosened

## Test plan
`npm test -- tests/flight`.

## Out of scope
Anti-skid, tyre models.
