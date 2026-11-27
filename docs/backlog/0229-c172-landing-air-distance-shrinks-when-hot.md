---
id: 0229
title: C172 landing distance over 50 ft shortens on a hot day; the POH's grows
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-11-27
pr:
---

## Why
POH Fig. 5-11 (p. 5-23), 2550 lb, flaps 30, sea level: 10 °C is 565 ft roll / 1320 ft over a 50 ft
obstacle, 20 °C is 585 / 1350 (+2.3% total). The validator card flies the short-field landing at ISA
-5 and +5 °C: the roll follows (531 -> 548 ft, x1.032 vs x1.035) but the total goes the wrong way
(1288 -> 1277 ft, x0.992). The air segment shrinks (756 -> 729 ft) as the air thins, when the same
indicated speed at higher TAS should carry the airplane farther.

## What
Find why the float from 50 ft shortens with temperature (the harness flare pilot's sink target, the
ground-effect or density term in flightModel.js, or the pilot, not the model) and fix the model if it
is the model. Promote the `it.fails` card in tests/flight/c172.test.js to `it`.

## Acceptance criteria
- [ ] The card "landing total over 50 ft grows with temperature" passes as `it` (±2 points of x1.023)
- [ ] No other flight card changes tolerance

## Test plan
tests/flight/c172.test.js card (already added as KNOWN GAP 0229).

## Out of scope
Altitude columns of Fig. 5-11.
