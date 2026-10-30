---
id: 0101
title: Kid's 737 flares to a gentle touchdown in the zone instead of balloon-and-sink
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-10-28
pr: 129
---

## Why
Found shipping 0098 (Kid's final guide now goes on down the runway). Hands off on KDFW 35C in
the 737 (headless, tests/flight/kidFinal.test.js), Kid's auto-flare (assists.js: the pitch hold
never below the sink profile flareSinkMps, 0.2/s of the wheel height from 12 m, at least
0.8 m/s) overshoots: the wheels level at ~2.4 m with the sink at +60 fpm (a small balloon),
then the pitch loop lags the profile as the speed bleeds and the jet sinks onto the runway at
~350 fpm, 648 m past the threshold (calm). landing.js gives the rate 75+ only under 240 fpm and
full zone marks only to 600 m. The Cessna lands at ~200 fpm, 340 m in (fine). Before 0098 the
737 floated to 1,149 m at 142 fpm instead.

## What
Tune Kid's auto-flare for the jet without touching the Cessna's: e.g. start the flare's pitch
up from the wheel height and sink together (a sink-rate error term, not only a floor), or a
per-aircraft flare height (spec.flareFtKid) like the real 737's ~20-30 ft flare (Boeing FCTM
737 NG: flare at ~20 ft, touchdown 1,000-1,500 ft past the threshold).

## Acceptance criteria
- [x] tests/flight/kidFinal.test.js: the `it.fails` 737 card (calm, < 600 m) passes and moves to
      `it`; add < 240 fpm to it; both 737 cards and all three Cessna cards still pass
- [x] tests/flight/pattern.test.js and tests/e2e/assists.spec.js still land
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
Promote the `it.fails` card in tests/flight/kidFinal.test.js; assert the touchdown rate.

## Out of scope
Learner and Pilot (no auto-flare). The crosswind de-crab (0100).

## Shipped
A per-airframe flare profile: `spec.kidFlarePerS` (737: 0.315 of the wheel height per second; the
Cessna keeps autopilot.js's 0.2). Headless the 737 now lands 220-350 m in at 60-180 fpm, calm to a
25 kt headwind and in a 10 kt crosswind; in the game the default final went from 576 m / 328 fpm to
273 m / 219 fpm (grade A). An attitude flare (pitch up N° at a height) and a sink-rate feedback loop
were tried first and were worse: the jet's path lags its nose, so both ballooned or sank.
Panel: inside the flare band Kid's hands-off guide no longer lowers the nose while the airplane
climbs (a pull, balloon and let-go dived into the runway at 622-710 fpm headless); the Cessna's
cards are unchanged. Known: a 10 kt tailwind still lands ~745 m in (gentle, inside the TDZ, as
before); the F-16 under Kid still lands ~610 m / ~350 fpm and the autoland keeps the 0.2 profile
(both untouched here).
