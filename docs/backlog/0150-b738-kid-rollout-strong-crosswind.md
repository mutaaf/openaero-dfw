---
id: 0150
title: The 737 at Kid level holds the centreline on a rollout in a strong (20 kt) crosswind
status: shipped
priority: P2
size: M
lens: player-feel
created: 2026-11-04
pr: 191
---

## Why
Found while shipping 0100 (Kid de-crabs in the flare). Headless, with 20 kt of crosswind at the wheels,
the 737 at Kid level touches down straight (1.6° drift) but slides off the side of DFW 35C on the rollout:
83 m off in 20 s (159 m before 0100). At 15 kt it holds within 1 m. The 0110 runway hold asks the nose
wheel for at most 4°/s and gives up once it is off the pavement (main.js runwayUnderWheels); the fin's
weathervaning at roll-out speeds outruns it. The game thins the METAR's wind at the wheels (weather.js
surfaceWindFactor, ~70-80%), so a ~25 kt METAR is where a player would meet this. Real crews hold a
crosswind rollout with rudder, into-wind aileron and differential braking (FAA-H-8083-3C ch. 9).

## What
Measure first (tests/flight/kidFinal.test.js, the 0100 rollout card's `it.fails` case): which term
loses, nose-wheel authority, the hold's 4°/s cap, or the 3° heading limit. Then give Kid's
(and Learner's) rollout the authority it needs, in assists.js groundSteerRudder and/or gear.js.

## Acceptance criteria
- [x] The `it.fails` card "b738 … 20 kt from 90° … on the centreline for 20 s" passes (flip it to `it`)
- [x] The 0110 groundSteer cards and the 0100 cards still pass
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
tests/flight/kidFinal.test.js (rollout card) and tests/flight/groundSteer.test.js.

## Out of scope
Pilot's ground handling; the METAR's gust model.
