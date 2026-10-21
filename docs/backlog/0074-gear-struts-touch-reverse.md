---
id: 0074
title: Landing gear on struts (nose + mains), nose-wheel steering, touch REV
status: in-progress
priority: P1
size: M
lens: authenticity
created: 2026-10-21
pr:
---

## Why
The aircraft stood on one contact point under its centre of gravity: the nose never came
down after a touchdown, a wing-low landing touched "everywhere" at once, the airplane turned
on the ground only through the rudder's aerodynamics, and the visual model had to be lifted
to fake the rotation about the main wheels. Touch players had no way to use the 737's
reversers that 0072 added.

## What
`src/gear.js`: three oleo struts at their real positions (737 wheelbase 15.6 m and track
5.72 m, Boeing ACAP; C172 POH; F-16 estimates), each a spring-damper loaded by its share of
the weight, harder rebound than compression damping; their moments through the airframe's
inertia (JSBSim models). Pedal nose-wheel steering (737 ±7°, C172 ±10°). On the ground the
tail works against the mains' moment with q (full at 0.8 Vr): the nose can't be lifted at
taxi speed and comes down by itself after touchdown. Touch: the ILS AUTO button is REV on the
ground for airframes with reversers; the coach names buttons on touch screens.

## Acceptance criteria
- [x] Cards: parked level with the nose carrying ~9% (737) / ~18% (C172); mains-first
      touchdown, nose down by itself; wing-low lands on one main and rolls level; pedal
      steering rate; no nose lift at 60 kt
- [x] Every other flight card passes, except the 737 lift-off attitude, now a KNOWN GAP
- [x] e2e desktop, phone and devices pass

## Test plan
`tests/flight/gear.test.js` (6 cards), `tests/unit/coach.test.js` (touch words). The 737
lift-off attitude card (8–9°) is `it.fails` (KNOWN GAP 0074): with real struts the wheels
leave at ~7.3°, where lift and the thrust's vertical part carry the weight; the single
contact point needed ~5% more lift to move off the runway. Closing it belongs to the flaps 10
lift and Vr fit (0062, 0070).

## Out of scope
Tyre models (slip angles), differential braking, tiller steering beyond the pedals' range,
strut animation on the glTF model.
