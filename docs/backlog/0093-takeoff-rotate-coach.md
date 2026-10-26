---
id: 0093
title: Takeoff coach: keep it straight, rotate smoothly, then climb
status: proposed
priority: P2
size: M
lens: player-feel
created: 2026-10-26
pr:
---

## Why
The landing has a coach (0073) and the takeoff has callouts (0035: "eighty knots", V1,
rotate), but nobody says how: a first-timer on the 35C takeoff roll drifts off the
centreline or yanks the nose to a tail strike. Coaching the roll (centreline, power set, a
smooth rotation to the real pitch attitude, positive rate, gear up) finishes the "approachable
for a kid" half of the vision for the other half of every flight.

## What
Extend `coach.js` (pure state machine) with a takeoff phase: power set, centreline cue while
rolling, "Rotate" with a target pitch (C172 about 7°, 737 8-9°, from `aircraft.js`), a
tail-strike-aware "ease the nose" if pitch exceeds the geometry limit, then "Positive rate:
gear up". Reuses the 0035 callout events.

## Acceptance criteria
- [ ] Unit: each phase transition and the prompt text for the three aircraft
- [ ] A prompt never repeats within 4 s; speech respects the mute setting
- [ ] 390x844 and 1280x720: the coach card does not cover the PAPI/horizon or the touch controls

## Test plan
`tests/unit/coach.test.js` takeoff cases; e2e: takeoff mission with the coach on shows "Rotate".

## Out of scope
Crosswind takeoff technique, rejected takeoffs.
