---
id: 0036
title: Dead-stick challenge: engine out over Dallas, glide the Cessna to a runway
status: shipped
priority: P2
size: M
lens: content
created: 2026-10-19
pr: 98
---

## Why
Every mission so far is a normal approach or a tour. The best way to teach what a pilot
actually learns is an engine-out: pitch for best glide, pick a field, fly a pattern to a spot.
It is a short, replayable puzzle that uses the real airport table, and the Cessna 172 is
already in the aircraft database but has no mission of its own. The FAA treats best-glide
speed as the first memory item after "aviate", and the glide ratio rule of thumb (about 9:1
for a 172) is something a casual player can feel:
https://www.cfinotebook.net/notebook/maneuvers-and-procedures/emergency/emergency-approach-and-landing

## What
New mission kind `deadstick` in `src/missions.js`: Cessna 172S, 3,500 ft AGL, abeam KADS
Addison's short runway 16/34 about 2 NM to the side, engine failed (throttle forced to 0, prop
drag modelled as `maxThrustN` -> small negative thrust). `src/aircraft.js` gains `vGlideKts: 68`
for the 172 (POH best glide at max gross weight). The coach (pure state machine in `src/coach.js`)
gets a dead-stick script: "Pitch for 68 knots", "pick a runway", "you're high / low on your
base turn". Landing grade (`src/landing.js`) adds a "made the runway" bonus and the results
card says how far from the threshold you stopped if you did not. Personal best keyed
`deadstick_kads_16` inside the existing v1 schema.

## Acceptance criteria
- [x] Unit: with throttle forced to 0 from the spawn, the Cessna's no-wind glide ratio at 68 KIAS is between 8:1 and 11:1 (aero model check)
- [x] Unit: coach prompts fire in the right order from synthetic inputs (speed low, speed high, high on base)
- [x] e2e: the mission loads at ~3,500 ft AGL with engine thrust 0; the throttle slider cannot restore thrust
- [x] e2e: scripted glide at 68 KIAS reaches the Addison threshold area; the results card shows the made-it or miss-distance line
- [x] Works at 390x844 touch and 1280x720; no new console errors; no new hosts

## Test plan
`tests/unit/aero.test.js` (glide ratio), `tests/unit/coach.test.js` (dead-stick script),
`tests/e2e/missions.spec.js` or a new `deadstick.spec.js`.

## As built (PR #98)
The engine failure is `engineFailed` on the flight model (flightModel.js and the JSBSim
adapter: no power whatever the throttle; the idle prop's windmill drag, already fitted to the
POH glide, not a negative `maxThrustN`). The coach is its own lazy module, `src/deadStick.js`
(prompts fed to coach.js as `s.ds`), not new code in coach.js; its words are `DS_TEXT`. The
glide-ratio check is a flight card in `tests/flight/c172.test.js` (both models, throttle full
forward), plus cards that fly the mission's pattern. The card's miss distance is to the
runway's pavement (the threshold for a landing short of it). Spawned at 85 KIAS (the failure
happens in cruise), trimmed for 68.

## Out of scope
Engine-out after takeoff ("impossible turn"), restart procedures, random failures in other
missions, other aircraft.
