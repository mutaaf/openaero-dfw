---
id: 0148
title: The C172's best-rate-of-climb speed is ~80 KIAS in the model, the POH's Vy is 74
status: ready
priority: P2
size: S
lens: authenticity
created: 2026-11-02
pr:
---

## Why
The Validator swept full-throttle climbs at sea level, ISA, 2,550 lb (tests/flight/c172Vxvy.test.js):
56 KIAS 477 fpm, 64: 596, 72: 684, 74: 698, 80: 712, 85: 708, 90: 689, 100: 597. The peak is near
80 KIAS; the POH (Section 5, Fig. 5-6) gives Vy 74 KIAS at sea level (729 fpm). At 74 the model is
within 2% of its own best, so a pilot flying Vy loses nothing, but the curve's top is 6 kt too fast,
which says the drag polar's induced-drag side is a little too low at the slow end (or thrust falls too
slowly with speed: thrustTableN 38 m/s = 74 kt is the table's anchor). Vx (best angle) lands slower
than Vy as it should; the POH quotes it around 60 KIAS.

## What
Fit the thrust table or induced drag (k) so the rate peaks within 3 KIAS of 74 without moving the
729 fpm Vy card, the 10,000 ft card, the ceiling card or the glide card (both models).

## Acceptance criteria
- [ ] The `it.fails` card in tests/flight/c172Vxvy.test.js is promoted to `it` and passes
- [ ] Every other tests/flight card still passes, no tolerance changed

## Test plan
`npm test -- tests/flight`
