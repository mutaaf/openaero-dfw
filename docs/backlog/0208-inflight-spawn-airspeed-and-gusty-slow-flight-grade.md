---
id: 0208
title: Spawn in-air missions at their airspeed through the air, then make the slow-flight band fair on a bumpy day
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-11-18
pr:
---

## Why
main.js spawns an in-air mission at its `kias` as a speed along the heading over the ground and ignores the wind.
On the slow-flight drill (heading 0, DFW's usual southerly from behind), the Cessna starts well below its 95 KIAS
through the air: about 66 KIAS in 25G38, 67.5 in 20G40 and 62 in a steady 35 kt, which is already under that day's
band. The drill then starts its hold before the player has slowed down at all. Found by the 0199 physics panel (#289).
A by-the-book test pilot on that spawn holds the band's middle without a stall or a warning, but it grades B-C
(in the band 52-68% of the hold; tests/flight/slowFlight.test.js, the 0199 turbulence cards), because the hold's
first seconds are the spawn's disturbance. The 2 s airspeed filter also passes the gust cycle's swings straight
into the 10 kt band. Kid hands off grades B on 2 of 12 runs, with "too slow" reasons next to "the plane flew it
for you".

## What
1. Spawn: add the wind (the METAR at the spawn's height, weather.js windVector and surfaceWindFactor) to the
   in-air spawn velocity, so `kias` is through the air. List every in-air mission whose cards move.
2. Then re-measure the 0199 slow-flight cards. If a by-the-book pilot still grades under A in 15G25-25G38, decide
   with a card whether the band's grading should read a slower airspeed filter on a gusty day, the way a pilot
   averages the needle.
3. Kid's slow-flight grade reasons: do not tell a hands-off Kid to "lower the nose".

## Acceptance criteria
- [ ] An in-air spawn reads its mission's kias (±2 kt) in a 25 kt tailwind and headwind (unit or flight test)
- [ ] slowFlight.test.js's turbulence cards also assert the grade (A or better for the band's middle, or a written reason)
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
tests/flight/slowFlight.test.js with the spawn made through the air; an e2e that the spawn's IAS matches the mission.

## Out of scope
The turbulence model (0195) and the band's floor (0199).
