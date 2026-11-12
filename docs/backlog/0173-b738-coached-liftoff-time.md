---
id: 0173
title: The coached 737 takeoff lifts off 3–4 s after Vr, as the FCTM says
status: ready
priority: P2
size: S
lens: player-feel
created: 2026-11-11
pr:
---

## Why
Found by 0070's physics panel. The takeoff coach tells the 737 to rotate to 8° and hold
(src/takeoffCoach.js ROTATE_PITCH_DEG). At flaps 5 the model lifts off at ~8.3° on a continuous
2–3°/s rotation (tests/flight/b738.test.js, 3.8 s), but held at 8° it sits on the runway until
the speed builds: lift-off 4.7 s after Vr at ~167 kt (tests/flight/takeoffCoach.test.js,
`KNOWN GAP (0173)`). The FCTM (quoted in AAIB 6/2019) says 3–4 s. 9° would fix the time but leaves
only 2° to the 11° tail strike, under the coach's 3° margin.

## What
Coach the rotation the way the FCTM flies it (a continuous rotation towards ~15° with the
lift-off at 8–9°, the tail call still in front of the tail), or another cited technique, so a player
who follows the words lifts off in 3–4 s and never meets the tail.

## Acceptance criteria
- [ ] The 0173 card passes and is promoted to `it`
- [ ] The coach's tail-margin and "never says slow or ease" cards stay green
- [ ] Works at 390x844 touch and 1280x720 keyboard

## Test plan
tests/flight/takeoffCoach.test.js, tests/unit/takeoffCoach.test.js, tests/e2e/takeoffCoach.spec.js.

## Out of scope
Changing the flaps 5 lift fit (0070).
