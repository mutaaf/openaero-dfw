---
id: 0051
title: Replace the brakes card with the POH short-field landing roll, for both flight models
status: shipped
priority: P2
size: S
lens: authenticity
created: 2026-10-19
pr: 83
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
- [x] The landing-roll card cites the POH table and runs on flightModel.js and JSBSim
- [x] The μ-based brakes card is removed, along with JSBSim's 'brakes' known gap
- [x] A model that misses the card is pinned with `it.fails`; no reference is loosened

## Test plan
`npm test -- tests/flight`.

## Out of scope
Anti-skid, tyre models.

## Shipped notes (#83)
`shortFieldLanding` (tests/flight/harness.js) flies Fig. 5-11's conditions from 50 ft: 61 KIAS,
idle, a round-out and hold-off to a near-stall touchdown (52-53 KCAS, 90-160 fpm, no bounce,
checked by its own always-on test), then nose wheel down, brakes after 0.5 s, flaps up.
Measured: roll ~365 ft (flightModel) and ~355 ft (JSBSim) vs 575; total 1125 / 1297 ft vs
1335. Pinned `it.fails`: landRoll on both, landTotal on flightModel; JSBSim's total passes.
The pilot holds the nose wheel on the runway rather than the POH's "full back": gear.js has
no braking pitch moment, so full back wheelies the Cessna to 15° and the wing, not the
brakes, carries the weight. Both gaps are ticket 0082.
