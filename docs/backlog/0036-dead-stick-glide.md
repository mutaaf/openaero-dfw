---
id: 0036
title: Dead-stick challenge: engine out over Dallas, glide the Cessna to a runway
status: ready
priority: P2
size: M
lens: content
created: 2026-10-19
pr:
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
- [ ] Unit: with throttle forced to 0 from the spawn, the Cessna's no-wind glide ratio at 68 KIAS is between 8:1 and 11:1 (aero model check)
- [ ] Unit: coach prompts fire in the right order from synthetic inputs (speed low, speed high, high on base)
- [ ] e2e: the mission loads at ~3,500 ft AGL with engine thrust 0; the throttle slider cannot restore thrust
- [ ] e2e: scripted glide at 68 KIAS reaches the Addison threshold area; the results card shows the made-it or miss-distance line
- [ ] Works at 390x844 touch and 1280x720; no new console errors; no new hosts

## Test plan
`tests/unit/aero.test.js` (glide ratio), `tests/unit/coach.test.js` (dead-stick script),
`tests/e2e/missions.spec.js` or a new `deadstick.spec.js`.

## Out of scope
Engine-out after takeoff ("impossible turn"), restart procedures, random failures in other
missions, other aircraft.
