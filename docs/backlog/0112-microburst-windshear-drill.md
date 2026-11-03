---
id: 0112
title: Microburst windshear drill on a short final (max thrust, hold the pitch, do not chase airspeed)
status: shipped
priority: P2
size: M
lens: content
created: 2026-10-29
pr: 131
---

## Why
DFW's thunderstorm season is the reason windshear recovery is taught: a microburst is under ~2.5 miles across and lasts 5 to 15 minutes, with downdrafts up to 6,000 fpm (FAA AC 00-54 Pilot Windshear Guide, 1988; AIM 7-1-24). The FAA-Boeing Windshear Training Aid recovery is maximum thrust plus rotation to a target pitch attitude, and not pitching down to chase lost airspeed (NASA Ames paper https://ntrs.nasa.gov/api/citations/19910002374/downloads/19910002374.pdf). It is a missions-that-teach-something-real drill that the goal-oriented first-timer and the pilot both learn from, and the Scout's earlier idea (stale draft #99, ticket never landed) is still missing.

## What
A lazy-chunk drill like `goAround.js`/`stallDrill.js`: the 737 (or C172) on a 3 NM final to a DFW runway; at ~600 ft AGL a scripted microburst (headwind falls ~35 kt over ~15 s, then a ~1,500 fpm downdraft) acts through `weather.js`'s wind and a vertical-air term in `flightModel.js` input. A state machine grades: warning noticed, thrust to max within 3 s, positive climb through 500 ft AGL with no ground contact, no stall or stick-shaker, and no nose-down chase. Kid/Learner assists stay off the shear's recovery until it is over (`drillAssist`, as the stall drill). Coach words live in the chunk (`DRILL_TEXT`).

## Acceptance criteria
- [x] A headless card flies the encounter: an unreacted 737 sinks below 100 ft AGL, the recovery (max thrust, hold pitch) climbs away without a stall
- [x] The drill grades a held-nose-down chase worse than the recovery
- [x] Boots with the mission registered in the picker; boot JS unchanged within budget (chunk is lazy)
- [x] Works at 390x844 touch and 1280x720

## Test plan
Unit test for the state machine and shear profile; a flight card in `tests/flight/` for the recovery vs the chase; one e2e that starts the mission.

## Out of scope
Forward-looking windshear alerts, a radar overlay, a real storm model.

## Shipped notes
The 737 on DFW 35C (Delta 191's microburst, NTSB AAR-86/05, was on DFW 17L). The shear runs 46 s
from 600 ft; the warning comes 7 s in; the downdraft fades out below 400 ft (Oseguera-Bowles, NASA
TM-100632: no vertical air at the ground). Headless (tests/flight/windshear.test.js): flown on at
approach power it hits ~1.4 km short; full power with no pull-up gets down to ~140 ft (D); a 1 s escape
loses ~150 ft (S); a 3 s escape ~245 ft (B); a dive for speed ~370 ft (C); a 6 s reaction ~370 ft (D).
Kid's assist (power held through the outflow, then full power and its 12.75° pitch cap) loses
~280 ft in the game (S). No published height-loss figure
exists for this shear, so the cards are relative. Out of scope still: a predictive (radar) alert,
a C172 version, the shear on other runways.
