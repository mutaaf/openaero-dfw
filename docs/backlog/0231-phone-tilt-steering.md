---
id: 0231
title: Optional phone tilt steering (DeviceOrientation) as a stick alternative
status: ready
priority: P2
size: M
lens: accessibility
created: 2026-11-27
pr:
---

## Why
Pillar 1 is flyable on any device. The on-screen stick hides under a thumb and covers a corner of
a 390x844 phone; many phone flight games let you tilt the phone like a yoke. 0001 left
"device-tilt steering" out of scope, and nothing has filed it since. It must be opt-in: iOS asks
permission, and a tilt that fights a kid on a bus is worse than no tilt.
Reference: MDN DeviceOrientationEvent (`requestPermission()` on iOS 13+, needs a user gesture),
https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent.

## What
- New `src/tilt.js` (lazy chunk): `tiltToStick(beta, gamma, screenAngle, neutral)` pure. Roll
  from gamma, pitch from beta, both relative to a neutral captured on "Calibrate", deadzone 3°,
  full stick at ±25°, rotated for landscape/portrait via `screen.orientation.angle`.
- Options: "Tilt steering" toggle (touch devices only, off by default, remembered in
  `openaero_prefs_v1`). Turning it on calls `DeviceOrientationEvent.requestPermission()` where it
  exists from that tap; a denial or no sensor leaves it off with a one-line reason.
- Feeds the same `input.js` axes the stick writes, so assists, Kid shaping and the replay need no
  change. Touching the on-screen stick overrides tilt while held. Paused, start screen, results
  card, hidden tab: zero input. A "Re-centre" chip on the Options sheet.

## Acceptance criteria
- [ ] Off by default; no permission prompt until the toggle is tapped
- [ ] iOS denial, missing sensor, desktop: toggle absent or off with a reason, no console error
- [ ] Pure mapping: neutral gives 0, deadzone, ±25° gives ±1, clamp, portrait and landscape
- [ ] Tilt cannot move controls while paused or behind the start screen
- [ ] No effect on keyboard, gamepad, or default touch flying

## Test plan
Unit `tests/unit/tilt.test.js` for the mapping. e2e (mobile project): dispatch synthetic
`deviceorientation` events, assert the stick axis in `?debug`, then paused and stick-override cases.

## Out of scope
Tilt for the throttle, flaps or gear. Motion-sickness tuning beyond the deadzone and calibrate.
