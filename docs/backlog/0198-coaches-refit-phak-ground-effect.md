---
id: 0198
title: Re-fit three coaches the old ground-effect float hid (power-off 180 in 10 kt, turn-back need in a headwind, Kid's base speed)
status: proposed
priority: P1
size: M
lens: player-feel
created: 2026-11-17
pr:
---

## Why
0183 replaced aero.js's ground-effect curve with one through PHAK's 1.4 / 23.5 / 47.6% (the old one
took ~11 / 36 / 62% off the induced drag, and still ~1% at 600 ft). Less float and a truer climb moved
three coaches that had been tuned on the old curve with hair-thin margins. 0183 re-centred what a
constant could re-centre (power180.js FLOAT_M 95 → 40, TURN_FT 170 → 180; engineOut.js EO_MARGIN_FT
25 → 15) and left three KNOWN GAP (0198) cards:

1. tests/flight/power180.test.js: in a 10 kt wind the coached power-off 180 lands +299 ft (wind 160°)
   and −39 ft (250°) from the spot (window: 0 to 250). The flap notches are too coarse: lined up 50 ft
   over the flaps-up glide but short of what flaps 20 needs, nothing takes the height off. No setting
   of FLOAT_M, TURN_FT, FINAL_M or FLAPS_FT put all eight winds in (swept in 0183's PR).
2. tests/flight/engineOut.test.js: in a 10 kt headwind the turn back from 400 ft makes the runway
   (graded D) where turnbackHeightFt says it needs 444 ft. Safe-side, but untrue.
3. tests/flight/pattern.test.js: Kid's autothrottle sits 6-9 kt under its 67 kt flaps 20 target on the
   downwind and base (feed-forward ~0.25 throttle short, a slow integrator) and touches the coach's
   58 kt slow line on base in the 340° wind, so Kid hears "Slow".

## What
1. power180.js: a way to lose height between notches, e.g. the coach asks for a slip (AFH ch. 9, forward
   slip) or for the next notch earlier with a "hold it off" plan, or turns base later when it can see
   the final will land between notches.
2. engineOut.js turnbackHeightFt: find the headwind term that over-counts close in (the drift during
   the turn, or the glide back's groundspeed) and fix it from the geometry, not by a fudge.
3. assists.js / autopilot.js: Kid's autothrottle holds its target within ~3 kt with flaps out (the
   feed-forward from trimThrottle, or more integrator authority).

## Acceptance criteria
- [ ] The three KNOWN GAP (0198) cards pass and become plain cards.
- [ ] `npm test -- tests/flight` green, no card regressed; tests/e2e/power180.spec.js, engineOut and
      pattern specs green.

## Test plan
The three cards above; the power-off 180's wind table in the PR body.

## Out of scope
Ground effect itself (0183); ground effect on lift.
