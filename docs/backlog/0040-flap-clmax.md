---
id: 0040
title: Flap lift increments that match the real stall speeds
status: ready
priority: P1
size: S
lens: authenticity
created: 2026-10-18
pr:
---

## Why
`liftCoefficient` adds a fixed CL per flap notch with no cap, and ignores the
`clMaxFlaps` already in `src/aircraft.js`. The C172 stalls at 40 KCAS with full flaps in
the sim; the POH says 48 KCAS (40 KIAS). Landing slow and short is too easy, and the
stall warning disagrees with the airspeed a pilot expects.

## What
Per-airframe flap table in `src/aircraft.js` (ΔCL0 and ΔCLmax per notch, from the
published stall speeds) and a stall AoA that drops slightly with flaps; `liftCoefficient`
in `src/aero.js` uses it. Recompute `stallCleanKts`-style warnings per flap setting.

## Acceptance criteria
- [ ] Flight card "stalls with full flaps near 48 KCAS" promoted to `it` and passing
- [ ] Clean stall card still passes
- [ ] Stall warning fires 5–10 kt above the current configuration's stall speed
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse
- [ ] No frame-time regression (e2e perf probe within budget)

## Test plan
Unit tests in `tests/unit/aero.test.js` for the table; promote the flight card.

## Out of scope
Flap speed limits / structural damage.
