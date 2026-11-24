---
id: 0223
title: Rectangular course lesson: fly a box around a field in a 12 kt wind, graded on a constant distance
status: shipped
priority: P2
size: M
lens: content
created: 2026-11-24
pr: 321
---

## Why
0211 shipped turns around a point; the other ground reference maneuver in the same ACS task is the
rectangular course, which teaches the pattern's drift correction (crab in on the downwind-to-base turn,
steeper bank with the wind behind you) that the traffic-pattern mission only names. Same airframe, same
chapter, same grading idea, so a Builder can reuse aroundPoint.js's wind, track plot and filters.
Sources: FAA-H-8083-3C (Airplane Flying Handbook) ch. 7 "Ground Reference Maneuvers", the rectangular
course section, https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/airplane_handbook
(the same chapter 0211 read, p. 7-3 onward); FAA-S-ACS-6C Area V Task B (altitude ±100 ft, airspeed ±10 kt).

## What
Mission `rectangular_course` (Drills group): the C172 at 90 KIAS, 1,000 ft AGL, over the fields north-west of
Alliance in 0211's scenario wind, one lit marker at each corner of a rectangle ~1/2 NM from the flight path
(the handbook: a field with sides 1/2 to 1 mile; the path a constant distance, 1/4 to 1/2 mile, off its
boundary). Reuse src/aroundPoint.js's scenario wind and its trackPlot.js card. New lazy chunk
`src/rectCourse.js` (pure state machine, graded like aroundPoint.js): two laps, left-hand, entry downwind.
Graded on the spread of the distance to the nearest side (the ACS sets no radius number: use 0211's ±150 ft
for a B), altitude ±100 ft, airspeed ±10 kt (2 s filter), the steepest bank (45° cap as 0211). Kid: the guide
banks for the wind as aroundPoint.js's circleBankDeg does. Coach words reach coach.js through s.ds.

## Acceptance criteria
- [ ] The mission is in the Drills group and loads its chunk lazily (boot JS budget unchanged)
- [ ] A flight card flies the box with the handbook technique (crab and bank into the wind) and earns an A/B,
      the same box with a fixed 20° bank and no crab earns ≤ C (drifted off the rectangle in 12 kt)
- [ ] The results card plots the track against the box; the source and page are in the chunk's header
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse; the coach card does not cover the horizon
- [ ] No ad, network call or storage key is added

## Test plan
tests/flight/rectCourse.test.js (the two cards above), a unit test for the grade, e2e start-and-fly smoke
(desktop and phone) like aroundPoint.spec.js.

## Out of scope
S-turns across a road (0224), right-hand courses, other airframes, a wind input.
