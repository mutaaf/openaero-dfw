---
id: 0073
title: Landing coach on every final, with HUD aim point, speed bug and flare cue
status: in-progress
priority: P1
size: M
lens: player-feel
created: 2026-10-21
pr:
---

## Why
The operator asked for "better ways to coach while I land". The coach only ran on the
default 35C final, only knew the PAPI, sink rate and flare, went quiet at touchdown, and
never spoke. The HUD's velocity vector moved with the world's east-west speed, not where the
aircraft was going, so it could not be aimed at the runway.

## What
`src/coach.js`: prompts for gear, landing flaps, slow/fast against Vref + 5, which way back
to the centreline, the PAPI, sink, flare, idle, de-crab in the flare, then the rollout
(reverse, brakes, stow by 60 kt, stopped). On every final mission. Spoken when sound is on
(above 100 ft and on the ground; the GPWS owns the last 100 ft). `src/main.js` HUD: a
conformal flight path marker (projected through the camera), an aim-point diamond on the
runway, a magenta target-speed bug with the Vref..Vref+10 band, and a FLARE / IDLE cue.

## Acceptance criteria
- [x] Unit: config, speed, centreline, de-crab and rollout prompts; numbers in the words
- [x] e2e: every final is coached, a takeoff is not; the autopilot hand-over still works
- [x] Screenshot: the green marker sits on the aim diamond on a stable final

## Test plan
`tests/unit/coach.test.js` (landing coach block), `tests/e2e/coach.spec.js`. Every e2e page
is silent (tests/e2e/fixtures.js stubs speechSynthesis; --mute-audio covers Web Audio).

## Out of scope
A touch control for the reversers, an approach replay (0019).
