---
id: 0226
title: Hot-day takeoff lesson: 100 °F at Addison, full load, and the runway you thought was long enough
status: shipped
priority: P2
size: M
lens: authenticity
created: 2026-11-26
pr: 330
---

## Why
Dallas summers put the density altitude at Addison thousands of feet above the field, which is the accident the
handbook's performance chapter exists to prevent (PHAK ch. 11, https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/phak,
"Density Altitude"; the PHAK's example is a 4,000 ft DA roll nearly doubled). The game already computes density
altitude (atmosphere.js densityAltitudeFt, the start screen's DA line and the thin-air hint) and the POH roll by
pressure altitude and °C (shortField.js pohRollFt), but no mission makes the player feel it. A pilot who flies this once
checks the DA before the next real takeoff; a kid sees the plane run out of runway at the same throttle.

## What
Mission `kads_16_hot_takeoff`: a scenario day (labelled SCENARIO, never "live") of 38 °C, altimeter 29.92, calm, on KADS 16
(4,452 ft), C172 at the POH's heavy-weight figure the performance tables use. The player takes off flaps 10, full power,
leaning not modelled. The coach shows the density altitude and the POH roll before the brakes release, then calls the
normal rotate speed (the IAS stays the same; the ground roll is what grows). Graded: lift-off before the pavement ends,
distance to 50 ft against the POH hot-day figure (pohRollFt at the day's pressure altitude and °C, x 1.15 for B), climb rate
at 200 ft against the POH (it is weaker: say so on the card). A reject (idle and brakes) before Vr on a roll that will not
make the end is graded A for the decision. Touches missions.js, a lazy chunk, coach.js DRILL_TEXT. No physics change.

## Acceptance criteria
- [x] The start screen and the coach show the day's density altitude and say SCENARIO. Builder's note: 38 °C at 29.92 over
      Addison (633 ft) is 3,500 ft of density altitude, ~2,900 ft above the field (the PHAK's rule); "> 4,000 ft above"
      would need ~47 °C. The ticket's 100 °F was kept. KADS 16 is 7,203 ft (the ticket said 4,452).
- [x] A scripted full-power pilot lifts off at the POH roll within the card's band (both models, S). **Not met as written:** a
      pilot who hauls the nose up where the cool day lifted off neither stalls nor settles back in either flight model (it is
      2+ kt short of its lift-off speed there and flies away in ground effect, the same finding as 0225's premature lift-off);
      the flight card asserts and prints what happens, and the grade does not invent a D.
- [x] The results card shows the roll (and the 50 ft and the climb) against the cool-day figure so the player sees the cost.
- [x] 390x844 touch and 1280x720 keyboard (e2e both). Boot JS +0.19 kB (the mission entry and three hooks), not unchanged.

## Test plan
tests/flight/hotTakeoff.test.js (cool vs hot roll ratio against the POH table, both models), unit test for the grader,
e2e (desktop + mobile).

## Out of scope
Mixture leaning, engine temperature, live temperature (the scenario is fixed), other airframes.
