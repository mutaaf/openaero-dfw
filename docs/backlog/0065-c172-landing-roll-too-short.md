---
id: 0065
title: C172 stops in 410 ft (flightModel) and 280 ft (JSBSim) where the POH says 575 ft
status: proposed
priority: P2
size: M
lens: authenticity
created: 2026-10-21
pr:
---

## Why
The validator flew the POH short-field landing (Fig. 5-11, p. 5-23: 2550 lb, flaps 30, power
off, max braking, dry paved, no wind, 61 KIAS at 50 ft; 565/585 ft ground roll at 10/20 °C →
575 ft at 15 °C, total 1,335 ft). Measured (tests/flight/harness.js `shortFieldLanding`,
touchdown 51–53 KIAS, flare tuned three ways, result within 2%):

| model | ground roll | vs 575 ft | total from 50 ft | vs 1,335 ft |
|---|---|---|---|---|
| flightModel.js | 410 ft | −29% | 1,204 ft | −10% |
| JSBSim | 280 ft | −52% | 1,242 ft | −7% |

The air distance is fine; the stop is not. The brakes grab at μ 0.45 (flightModel) or move
the load onto the nose wheel (JSBSim, 0.36 g). The POH's figure implies ~0.2 g average
including the pilot's brake onset.

## What
Fit braking so the roll lands in 575 ft ±15% on both models, or document why the POH figure
(which includes reaction time and "without sliding the tires") needs a brake-onset delay in
the harness pilot. Supersedes the μ-based 'brakes' card (ticket 0051).

## Acceptance criteria
- [ ] The `landingRoll` card in tests/flight/c172.test.js passes (promote `it.fails` to `it`) on both models
- [ ] Total distance card still passes; no card regressed

## Test plan
`npm test -- tests/flight`.

## Out of scope
Anti-skid, tyre models.
