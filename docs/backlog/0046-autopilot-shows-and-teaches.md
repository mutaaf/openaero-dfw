---
id: 0046
title: The autopilot shows and teaches (captions, voice, glowing controls, Your turn)
status: shipped
priority: P1
size: M
lens: player-feel
created: 2026-10-19
pr: 43
---

## Why
Operator request: "auto pilot should show and teach". Pressing ILS AUTOLAND lands the
aircraft, but a kid or a first-timer learns nothing from it: the coach goes silent and the
controls move with no explanation. Watching a good pilot fly while they talk through it is
how people actually learn to land; the autopilot can be that pilot.

## What
- `src/apTutor.js` (pure, like `coach.js`): a caption for what the autopilot is doing and
  why, per phase (lining up, high/low on the 3° path, speed and power, on the PAPI, flare,
  idle, touchdown; heading/altitude hold). Urgent phases interrupt; others must persist
  1.5 s and each caption stays ≥ 3.5 s so it can be read.
- The coach card shows it labelled "Autopilot"; spoken with on-device speech when sound is
  on, above 100 ft (the GPWS callouts own the last 100 ft) and never cutting off a callout.
- The stick and throttle glow amber with an "AP" tag while the autopilot moves them.
- **Your turn** hands over: autopilot off, and on a final the coach picks up from there.
- Remembered setting `openaero_tutor_v1 = { v: 1, on, at }`; "Autopilot explains what it's
  doing" in the start modal; Hide on the card turns it off.

## Acceptance criteria
- [x] Unit: captions per phase, debounce/read time, urgent interrupt, setting survives throwing storage
- [x] e2e: autoland shows Autopilot captions, controls glow, Your turn hands control and the coach back
- [x] e2e: works on a tour with heading/altitude hold; Hide persists across a reload
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse
- [x] No frame-time regression (DOM touched only when the caption changes)

## Test plan
`tests/unit/apTutor.test.js`, `tests/e2e/tutor.spec.js`, coach spec updated (the tutor
takes the card while the autopilot flies).

## Out of scope
Ghost "demo then replay" mode, captions for takeoff/climb autopilot modes.
