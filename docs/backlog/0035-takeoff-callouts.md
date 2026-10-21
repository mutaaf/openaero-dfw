---
id: 0035
title: Call out 80 knots, V1, Rotate and Positive rate on the takeoff roll
status: shipped
priority: P1
size: S
lens: authenticity
created: 2026-10-19
pr: 73
---

## Why
The Takeoff Roll mission only says "release brakes and rotate at 142 kts"; the player has to
stare at the speed tape. A real crew hears a fixed sequence: "eighty knots", "V1", "rotate",
then "positive rate". Landing already has spoken GPWS callouts (0013), so the departure feels
silent and unfinished next to it. Sources are illustrative, not an airline SOP, and wording
varies by operator: https://www.flaps2approach.com/s/Table-3-Speed-and-Events-Takeoff.pdf and
https://support.justflight.com/support/solutions/articles/17000124975-pilot-callouts-and-cabin-announcements-explained

## What
A pure `takeoffCalloutIndex(iasKts, vsiFpm, aglFt, vrKts, lastIdx)` in `src/aero.js` (same
shape as `gpwsCalloutIndex`) returns the next callout once: "eighty knots" at 80 KIAS, "V1" at
`vrKts - 3`, "rotate" at `vrKts`, "positive rate" when AGL > 5 ft and VSI > 300 fpm after
rotate. It only runs while on the takeoff mission's ground roll or just after liftoff and
re-arms on reset. `src/audio.js` speaks them through the existing speech path (muted with
Sound off). The HUD shows the same word briefly in the alert slot. V-speeds come from
`src/aircraft.js` (`vrKts`; derive V1 and 80 kt scaled for the Cessna: skip "eighty knots" below 60 kt Vr).

## Acceptance criteria
- [ ] Unit: sweeping IAS 0 to Vr+10 yields each callout exactly once, in order, for the 737 (Vr 132 since 0058) and the Cessna (Vr 55)
- [ ] Unit: "positive rate" only after rotate, never on a bounced or descending liftoff
- [ ] e2e: on the takeoff mission, with throttle and rotation scripted, the callout words are emitted in order (spy on the audio speak hook)
- [ ] Sound off: nothing is spoken, the on-screen word still shows
- [ ] Works at 390x844 touch (word does not overlap the horizon) and 1280x720
- [ ] No frame-time regression (perf probe within budget)

## Test plan
`tests/unit/aero.test.js` for `takeoffCalloutIndex`; `tests/e2e/flight.spec.js` takeoff case
asserts the order of emitted callouts via the debug snapshot.

## Out of scope
Rejected-takeoff / engine-failure-at-V1 logic, flap or gear retraction automation.
