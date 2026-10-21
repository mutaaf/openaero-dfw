---
id: 0070
title: Aircraft systems: hydraulic gear and flaps, autobrake, reversers, belly landings
status: in-progress
priority: P1
size: L
lens: authenticity
created: 2026-10-21
pr:
---

## Why
The operator asked for "better physics like hydraulics and all that". The gear and flaps
moved the instant a key was pressed, the brakes were on or off, the 737 had no autobrake or
reverse thrust, and a gear-up landing rolled out like any other. Real airplanes have levers
that command systems: the hydraulics take seconds to move the gear and flaps, the 737's flap
load relief protects the flaps 40 placard, Boeing's autobrake holds a set deceleration, and
reverse thrust takes the sleeves a couple of seconds to deploy.

## What
`src/systems.js` (pure, run every sub-step by `stepFlightModel`): gear travel (gearPos, door
drag in transit), flap travel at the airframe's rate with fractional notches interpolated in
`aero.js`, flap load relief (737: 40 → 30 above 162 kt), brake pressure with a lag and the
anti-skid limit, autobrake 1/2/3/MAX holding 4/5/7.2/14 ft/s² (737 NG FCOM) and disarming on
the pedals or forward thrust, thrust reversers (ground only, ~2 s sleeves, 35% effectiveness:
estimate), a belly when the gear isn't locked. GPWS mode 4A "too low, gear". The landing grade
crashes a gear-up landing. Panel: AUTOBRK (K), REVERSE (R), HYD; gear TRANSIT, flaps 18→30°.
Finals spawn with autobrake 2 armed (airline practice).

## Acceptance criteria
- [x] Flight cards: gear locks after ~10 s, flap load relief, autobrake 1/2/3/MAX within 12%
      of Boeing's decelerations, reverse shortens the rollout, gear-up sits on the belly
- [x] Every existing flight card still passes
- [x] e2e desktop + phone suites pass

## Test plan
`tests/flight/b738-systems.test.js` flies the 737 headless: gear lock time, load relief,
autobrake 1/2/3/MAX decelerations against Boeing, pedals vs MAX, reverse, gear-up belly.
`tests/unit/systems.test.js` covers notch interpolation, seeding, reverser ground logic,
autobrake disarm, brake friction, "too low, gear" and the gear-up CRASH grade. The smoke and
gamepad e2e accept flaps in transit ("33→40°").

## Out of scope
Per-wheel oleo struts and nose-wheel steering (a follow-up), hydraulic failures, engine-out,
brake temperatures, a touch control for the reversers.
