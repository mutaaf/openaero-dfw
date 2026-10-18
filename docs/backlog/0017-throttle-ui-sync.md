---
id: 0017
title: Keep the throttle slider in sync when the autopilot or gamepad moves the throttle
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-10-16
pr: 28
---

## Why
The autothrottle (ILS autoland) and the gamepad triggers change `sim.throttle`, but the
desktop `#rngThrottle` slider keeps its old position: after an autoland the slider shows
44% while the readout says 0%. The controls should never disagree with each other.

## What
In `syncUI()` (src/main.js), write `#rngThrottle.value` from `sim.throttle` when it changed
by ≥1% and the slider is not the focused/dragged element (`document.activeElement`), so it
never fights a user drag. Cache the element lookup while there.

## Acceptance criteria
- [x] e2e: after ILS autoland touchdown on the flare challenge, `#rngThrottle` value equals the `#txtThrottle` percentage
- [x] e2e: with a fake gamepad holding RT, the slider value rises
- [x] Dragging the slider still sets the throttle (existing behaviour)

## Test plan
Extend `tests/e2e/gamepad.spec.js` and `tests/e2e/flight.spec.js` with slider assertions.

## Out of scope
Restyling the throttle controls.
