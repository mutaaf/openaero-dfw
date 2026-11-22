---
id: 0206
title: Phone tilt-to-steer, opt-in (hold the phone like a yoke)
status: ready
priority: P2
size: M
lens: accessibility
created: 2026-11-18
pr:
---

## Why
Pillar 1 says flyable on any device. The on-screen stick is a 2-D thumb pad; some players (kids, players with
limited thumb precision, anyone holding a tablet with two hands) find tilting the device a more natural yoke, and
every mobile flight game offers it. Nothing in `src/` reads device orientation today (grep `deviceorientation`: none).
iOS 13+ only delivers the event after `DeviceOrientationEvent.requestPermission()` from a user gesture
(https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static), so it must be
off by default and explained.

## What
- `src/tilt.js` (pure): map `{beta, gamma}` plus the screen orientation angle to `{roll, pitch}` stick fractions
  in [-1, 1], with a calibrated neutral (taken when the player taps "Level here"), a 3 deg dead zone and full
  deflection at +/-30 deg; low-pass filtered. Handles portrait, both landscapes, and `screen.orientation.angle`.
- Option in the start modal / Options, shown only when `DeviceOrientationEvent` exists and the primary pointer is
  coarse: "Tilt to steer". The click calls `requestPermission()` where it exists; a denial turns the option
  off with a plain-words message. Remembered in prefs.
- When on, tilt feeds the same stick input path the touch pad and gamepad use (so every assist level, the autopilot
  hand-over and the Kid helper behave unchanged); the on-screen stick still works and wins while touched.

## Acceptance criteria
- [ ] Unit: neutral calibration, dead zone, saturation at 30 deg, and the sign of roll/pitch in portrait, landscape-left and landscape-right
- [ ] With a stubbed `deviceorientation` event stream at 390x844 and 844x390, tilting right banks the aircraft right in both
- [ ] Permission denied or event never firing leaves touch controls working and the option reads off
- [ ] The option is absent on a desktop (fine pointer, no events) and no HUD box moves (hudLayout no-overlap spec still passes)
- [ ] No frame-time regression

## Test plan
`tests/unit/tilt.test.js`; one Playwright spec that dispatches synthetic `DeviceOrientationEvent`s in a mobile context.

## Out of scope
Motion-sensor throttle, shake gestures, any haptic change.
