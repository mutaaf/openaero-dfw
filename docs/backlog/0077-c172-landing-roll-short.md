---
id: 0077
title: C172 lands too short: close the POH Fig. 5-11 landing-roll gap on both models
status: proposed
priority: P2
size: M
lens: authenticity
created: 2026-10-22
pr:
---

## Why
The new cards (tests/flight/c172.test.js, `shortFieldLanding`) fly the POH short-field
landing (flaps 30, idle, 61 KIAS at 50 ft, max braking, Fig. 5-11 p. 5-23: 575 ft roll,
1335 ft over 50 ft at 15 °C). Measured: flightModel 468 ft roll (-19%), 1075 ft total (-19%);
JSBSim 424 ft roll (-26%), 1245 ft total (-7%, passes). The roll is too short on both, so
the airplane stops faster than a Skyhawk with a careful pilot does.

## What
Find the cause (braking μ 0.45 ideal brake in flightModel.js; JSBSim main-wheel brake model;
the card pilot's 56 KIAS / 330 fpm touchdown on flightModel) and fit it. Ticket 0051 covers
replacing the μ card with this one.

## Acceptance criteria
- [ ] `landRoll` and `landTotal` cards pass on both models and drop out of `GAPS`
- [ ] No other flight card regresses

## Test plan
`npm test -- tests/flight`.

## Out of scope
Anti-skid, tyre models, grass runways.
