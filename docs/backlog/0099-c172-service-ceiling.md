---
id: 0099
title: The Cessna climbs 183 fpm at its 14,000 ft service ceiling (POH: 100 fpm)
status: shipped
priority: P2
size: S
lens: authenticity
created: 2026-10-27
pr: 111
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
- [x] `ceiling` removed from GAPS.flightModel; card passes within ±35%
- [x] 729 fpm and 315 fpm cards and the 8,000 ft cruise card still pass

## Test plan
The `ceiling` card in tests/flight/c172.test.js flips from `it.fails` to `it` (drop it from
GAPS.flightModel); run `npm test -- tests/flight`.

## Out of scope
Climb speed schedule (the card holds 74 KIAS).

## Shipped
The power lapse was δ/√θ alone, which is SAE J1349's *indicated* power ratio; the engine's
friction power does not shrink with altitude, so brake power falls faster. engine.js now takes
Gagg-Ferrar's friction share (1/8.55 of sea-level indicated power, P/P0 = σ − (1 − σ)/7.55) off
δ/√θ: 67% at 10,000 ft, 57% at 14,000. Measured (flightModel.js, 74 KIAS, ISA): sea level
702 → 697 fpm, 10,000 ft 328 → 270 (POH 315, card ±15%), 14,000 ft 182 → 103 (POH 100),
8,000 ft cruise 121.2 → 118.6 KTAS (POH 124). JSBSim, for comparison: 670 / 279 / 115.
