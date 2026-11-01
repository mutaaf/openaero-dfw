---
id: 0033
title: Haptic feedback on the phone for touchdown, stall and GPWS pull-up
status: shipped
priority: P2
size: S
lens: player-feel
created: 2026-10-18
pr: 150
---

## Why
On a phone the only feedback for a firm landing or a stall is on-screen text and sound, and
many players fly muted. A short vibration on touchdown (stronger when it is a hard landing),
a pulse pattern on stall warning and on "PULL UP" makes the aircraft feel physical. The
Vibration API (`navigator.vibrate`) is available on Android Chrome/Firefox; iOS Safari ignores
it, so it must be an enhancement only.

## What
New pure module `src/haptics.js`: `touchdownPattern(sinkFpm)` (e.g. 20 ms gentle, 60 ms firm,
[80,40,120] hard) and `alertPattern(kind)` for stall and pull-up, plus a `buzz(pattern)` that
feature-detects and try/catches. Wire into main.js at touchdown (where the landing grade is
computed) and at the stall/GPWS pull-up edge (once per alert onset, not per frame). Respect
`prefers-reduced-motion` (skip alerts, keep a single short touchdown tick) and add a
persisted-free "Haptics" toggle only on touch devices, in the existing menu (store with
`openaero_haptics` `{v:1,on}` and tolerate throwing storage).

## Acceptance criteria
- [ ] `touchdownPattern` returns longer/stronger patterns for higher sink rates (unit-tested)
- [ ] Touchdown calls `navigator.vibrate` once; a stall onset calls it once, not every frame
- [ ] No call and no error when `navigator.vibrate` is undefined or haptics are off
- [ ] Toggle is ≥44 px and visible only on touch devices

## Test plan
Unit tests for patterns and the edge detector; e2e stubs `navigator.vibrate`, lands the
flare mission via autoland, asserts one call on touchdown and zero errors without the API.

## Out of scope
Gamepad rumble (separate ticket if wanted), sound design.
