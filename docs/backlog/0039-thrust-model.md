---
id: 0039
title: Thrust that falls off with airspeed and density (prop and turbofan)
status: ready
priority: P1
size: M
lens: authenticity
created: 2026-10-18
pr:
---

## Why
Thrust is `throttle × maxThrustN` at every speed and altitude, and engines respond
instantly. A fixed-pitch propeller's thrust falls steeply with speed (≈ power/V), and a
turbofan loses thrust with speed and altitude and takes seconds to spool. The flight card
measures a 419 ft C172 ground roll to lift-off where the POH says 960 ft, and pilots
on approach never feel the spool-up lag that real go-arounds are about.

## What
Per-airframe engine block in `src/aircraft.js` (`engine: { type: 'piston-prop', powerKw,
propEff, ... }` / `{ type: 'turbofan', staticThrustN, ... }`) and a pure `src/engine.js`:
prop thrust = min(static, η·P·σ / V); turbofan thrust lapse with Mach and density ratio;
first-order spool (N1 time constant, slower near idle). `stepFlightModel` reads thrust
from it. Engine sound pitch follows N1/RPM.

## Acceptance criteria
- [ ] Flight card "short-field ground roll near 960 ft" promoted to `it` and passing
- [ ] Sea-level Vy climb card still passes (730 fpm ±15%)
- [ ] 737 idle→TOGA reaches 90% thrust in 5–8 s (unit test)
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse
- [ ] No frame-time regression (e2e perf probe within budget)

## Test plan
`tests/unit/engine.test.js` (lapse curves, spool time); promote the takeoff card.

## Out of scope
Mixture, carb heat, fuel burn and weight change, engine failures.
