---
id: 0189
title: Power-off 180 accuracy landing: pull the power abeam and put the Cessna on a spot at Addison
status: ready
priority: P2
size: M
lens: content
created: 2026-11-16
pr:
---

## Why
The game teaches the engine-out (0036 dead stick, 0104 engine failure after takeoff) and the
circuit (0048, 0187), but not the classic exercise that joins them: the commercial-pilot
power-off 180° accuracy approach. From downwind, at no more than 1,000 ft AGL, the instructor
closes the throttle abeam the touchdown spot and the pilot must plan a gliding 180° turn and
touch down on the spot or up to 200 ft beyond it, never short, with no drift and the nose
along the centreline (FAA-S-ACS-7A, commercial airplane, Task "Power-Off 180° Accuracy
Approach and Landing"). It is a short, replayable puzzle a kid can feel ("am I high? low?") and
a real pilot recognises. Sources:
https://www.cfinotebook.net/notebook/maneuvers-and-procedures/takeoffs-and-landings/power-off-180-approach-and-landing
and https://www.aopa.org/news-and-media/all-news/2019/july/pilot/technique-on-target
(read the ACS text itself before writing the grade; the search only returned summaries).

## What
New mission `pad_180_kads_16` in `src/missions.js` (Drills group): the C172 on a left downwind
for Addison 16 at 1,000 ft AGL, abeam the spot (the 1,000 ft marker: a point on the runway from
airports.js `AIM_POINT_M`'s family, cite where it is placed), at 85 KIAS, engine failed on the
first frame the player flies (reuse `sim.engineFailed` from deadStick.js; no new physics).
New lazy chunk `src/power180.js` (like deadStick.js): a pure grade of the touchdown against
the spot: on it to 200 ft beyond = full marks, short of it capped C (the ACS fails short),
beyond 200 ft scaled down, drift and nose alignment as in landing.js, a stall or a go-around
under power capped D. Coach prompts from `coach.js` DRILL_TEXT: best glide 68, "turn base
now / later" from the angle to the spot, flaps late. Kid's hands-off guide flies the same
pattern (reuse deadStick.js's guide). Results card strip marks the spot (touchdownStrip.js).
Best keyed `pad_180_kads_16` inside the v1 schema.

## Acceptance criteria
- [ ] The mission loads on downwind at 1,000 ft AGL abeam the spot with the engine failed once flying starts, not behind the start screen.
- [ ] A scripted pilot that flies the 180° and lands 0-200 ft past the spot grades A or B; one that lands 50 ft short grades no better than C and says "short of the spot"; one 600 ft long says how far.
- [ ] Flight card (tests/flight/power180.test.js): from the spawn, the Cessna at best glide with 20° flaps late reaches the spot with 0 to 400 ft of slack in still air (the mission is solvable; cite the POH glide figure used).
- [ ] No ad, ad request or network call fires in flight; no new host.
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse; no console errors.

## Test plan
tests/unit/power180.test.js (grade bands), tests/flight/power180.test.js (solvable, and a
wrong-turn pilot lands short), tests/e2e/power180.spec.js (loads, engine out, card shows the
spot line), tests/unit/missions.test.js picks it up.

## Out of scope
Wind-corrected tuning beyond a still-air solve plus the METAR wind the game already applies;
the 737 or F-16; a spot other than Addison's.
