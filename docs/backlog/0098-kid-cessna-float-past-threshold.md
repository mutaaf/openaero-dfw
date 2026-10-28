---
id: 0098
title: Kid's Cessna lands on any final instead of floating the runway at 37 ft
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-10-27
pr: 106
---

## Why
Found flying the traffic pattern (0048) hands off in the game (Kid, the Cessna): across the
threshold Kid's guide in main.js applyAssists stops (`ap.distM > 0`) and falls back to level
flight (guide 0/0). The Cessna crosses at ~45 ft, levels inside the auto-flare band (wheels
< 12 m) at ~37 ft with the autothrottle still holding speed (it retards only below 8 m), and
floats the whole 7,000 ft of Addison's runway, then climbs away. 0048 fixed it for the pattern
mission only (pattern.js kidGuide keeps the 3° path to the aim point past the threshold);
every other final flown in the Cessna on Kid still floats.

## What
In main.js applyAssists, keep the final's guide to the aim point: `ap.distM > -AIM_POINT_M`
(glidepathGammaDeg already flies the 3° path to it), so the auto-flare takes the airplane to
the runway. Boot budget: pay for the bytes first.

Shipped as assists.js kidFinalGuide: to the aim point was not enough (the 737 ballooned when the
guide went level there), so past the threshold it flies the path on over the runway, but only a
landing: under ~100 ft over the first third, never steeper than 2° (validation panel: a 737 let
go at 60-100 ft was dived at the runway into a crash, and a go-around or takeoff climbing through
1,000 ft over its runway was dived back at it), and not while a bounce settles.

## Acceptance criteria
- [ ] Headless: Kid in the Cessna on kads_16_final, hands off, touches down in the touchdown
      zone (landing.js: < 600 m past the threshold) under 400 fpm
- [ ] The 737's Kid final (tests/e2e/assists.spec.js) still lands
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
A flight card in tests/flight/ flying Kid's guide as main.js does (tests/flight/pattern.test.js
shows how), for the Cessna and the 737.

## Out of scope
The crosswind offset (0097).
