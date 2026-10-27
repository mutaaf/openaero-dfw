---
id: 0099
title: The Cessna climbs 183 fpm at its 14,000 ft service ceiling (POH: 100 fpm)
status: ready
priority: P2
size: S
lens: authenticity
created: 2026-10-27
pr:
---

## Why
Validator flight card (tests/flight/c172.test.js, `ceiling`): the C172S POH Section 1
specifications give a service ceiling of 14,000 ft, where the climb falls to 100 fpm.
Measured at Vy-ish 74 KIAS, full throttle, ISA, flightModel.js climbs 252 fpm at 12,000 ft,
183 at 14,000 and only reaches 100 fpm near 16,300 ft (+16% in altitude). JSBSim meets the
card. The sea level (729) and 10,000 ft (315) cards pass, so the lapse is too shallow
above 10,000 ft.

## What
Find why the climb decays too slowly above 10,000 ft (engine.js power lapse vs wing CL/CD at
altitude) and close it without moving the passing cards.

## Acceptance criteria
- [ ] `ceiling` removed from GAPS.flightModel; card passes within ±35%
- [ ] 729 fpm and 315 fpm cards and the 8,000 ft cruise card still pass

## Out of scope
Climb speed schedule (the card holds 74 KIAS).
