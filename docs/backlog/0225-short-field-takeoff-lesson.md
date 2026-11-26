---
id: 0225
title: Short-field takeoff lesson at Addison: flaps 10, hold the brakes, lift off slow, clear a 50 ft obstacle
status: ready
priority: P2
size: M
lens: content
created: 2026-11-26
pr:
---

## Why
The Drills group has the short-field landing (0181) and the soft-field takeoff (0182) but not the other half of the
pair a private pilot is tested on: the short-field takeoff and maximum-performance climb (ACS Area IV, FAA-H-8083-3C
ch. 6). The physics already has a card for it (tests/flight/c172.test.js, the POH short-field roll and 51 KIAS lift-off);
this turns that card into something a player flies and is graded on. Search results (2026-11-26) quote the 172S POH as
10° flaps and an obstacle-clearance speed of 56 KIAS (https://www.pprune.org/private-flying/494408-takeoff-flaps-obstacle-clearance.html,
second-hand): the Builder reads Section 4 of the POH already cited in the c172 cards and uses its figures, not these.

## What
Mission `kads_16_short_field_takeoff` (lazy chunk `src/shortTakeoff.js`, `shortTakeoff: true`, Drills group), built
like softField.js: the C172 holding on KADS 16, flaps 10, brakes held. Coach: full power with the brakes on, release,
rotate at the POH's speed, hold the obstacle-clearance speed, then the climb speed after the obstacle. A 50 ft
obstacle is the height graded at the roll's distance (a virtual one, no mesh needed). Graded: ground roll against the
POH table for the day's pressure altitude and °C (shortField.js pohRollFt gives the shape), distance to 50 ft,
lift-off speed, speed held ±5 kt through the climb, centreline. Kid: hands-off, graded on the roll and the obstacle.
Touches missions.js, main.js (loader), coach.js DRILL_TEXT, results text. No physics change.

## Acceptance criteria
- [ ] The mission is in the Drills picker; every speed and distance in it cites the POH section and table.
- [ ] A scripted handbook pilot (flaps 10, full power, rotate at the POH speed, hold the obstacle speed) grades A or B;
      an early rotation or a flaps-up, low-pitch roll grades lower with the reason named.
- [ ] Clearing 50 ft later than the POH's distance x 1.15 caps B.
- [ ] Works at 390x844 touch and 1280x720 keyboard; boot JS budget unchanged (lazy chunk).

## Test plan
tests/flight/shortTakeoff.test.js flies the scripted pilots on both flight models; unit test for the grader;
e2e (desktop + mobile) picks the mission and reaches the results card.

## Out of scope
Soft-field technique (0182), obstacle meshes, weight changes.
