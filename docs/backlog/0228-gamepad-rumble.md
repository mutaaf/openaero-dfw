---
id: 0228
title: Gamepad rumble: touchdown thump, stall buffet and ground roll through the pad's dual-rumble motors
status: shipped
priority: P2
size: S
lens: player-feel
created: 2026-11-26
pr: 334
---

## Why
Touch players already feel the touchdown and the buffet (`src/haptics.js`, 0086-era
`navigator.vibrate`); a pad in the player's hands feels nothing. Chromium and Firefox expose
`gamepad.vibrationActuator.playEffect('dual-rumble', {...})`
(https://developer.mozilla.org/docs/Web/API/GamepadHapticActuator/playEffect), the same Gamepad
API `src/gamepad.js` already polls; Safari lacks it, so it must be feature-detected.

## What
Reuse haptics.js's event model (touchdown scaled by sink rate, stall buffet from
`src/buffet.js`, rumble on the rollout) and add a pad sink: when a pad with a `vibrationActuator`
is connected, `playEffect` with short durations (touchdown 120-250 ms, buffet pulses). Same
on/off switch as `openaero_haptics_v1` (the Options toggle), off under `prefers-reduced-motion`,
never throws, no per-frame allocation (reuse one params object). Lazy: only inside gamepad.js's
chunk.

## Acceptance criteria
- [x] A fake pad with a stubbed `vibrationActuator.playEffect` receives a touchdown pulse scaled by sink rate (hard > soft)
- [x] Silent when the haptics setting is off, under reduced motion, and when the actuator is missing or its promise rejects
- [x] Not fired while paused or behind the start screen/results card
- [x] Boot JS size unchanged (chunk-only)

## Test plan
Unit test on the pure mapping (sink rate / buffet level -> magnitudes); e2e with a stubbed
`navigator.getGamepads` asserts the call and the off switch.

## Out of scope
Trigger rumble (Xbox impulse triggers), adaptive triggers, UI to tune strength.
