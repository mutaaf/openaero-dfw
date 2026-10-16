---
id: 0009
title: Fly with a gamepad
status: ready
priority: P1
size: S
lens: player-feel
created: 2026-10-16
pr:
---

## Why
A gamepad is the most natural way to fly on a couch or a laptop, and the Gamepad API
is free in every modern browser. Today the sim ignores it.

## What
`src/gamepad.js`: poll `navigator.getGamepads()` each frame; left stick → roll/pitch with
a small deadzone and expo curve, triggers → throttle up/down, shoulders → rudder,
A = flaps, B = gear, X = brakes, Y = camera. A pure `gamepadTargets(axes, buttons)` mapping
is unit-tested. Gamepad input wins over keyboard while a stick is deflected.

## Acceptance criteria
- [ ] Unit test: deadzone returns 0 below 0.12, expo keeps sign and full scale at 1
- [ ] e2e: a stubbed `navigator.getGamepads` deflecting the left stick changes `#meterAil`
- [ ] A connect/disconnect toast names the controller

## Test plan
Vitest for the mapping; Playwright with `addInitScript` stubbing getGamepads.

## Out of scope
Rebinding UI, force feedback.
