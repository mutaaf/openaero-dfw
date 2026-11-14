---
id: 0182
title: Soft-field takeoff lesson: hold the nose wheel light on a rough surface (Addison, grass-strip rolling drag)
status: ready
priority: P2
size: M
lens: content
created: 2026-11-14
pr:
---

## Why
Short-field is ticketed (0181) but the other half of the private-pilot pair is not: the soft-field takeoff,
where the lesson is the opposite of the instinct to stay on the ground until Vr. The Airplane Flying Handbook
(FAA-H-8083-3C ch. 5) asks for enough back-elevator through the roll to keep weight off the nose wheel (reduce,
not eliminate), a level lift-off in ground effect, then accelerating to Vy before climbing. AOPA warns that
"nose wheel off the surface" is a misconception that is not required. Sources:
https://www.aopa.org/training-and-safety/students/maneuvers/skills/soft-field-techniques and
https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/airplane_handbook/01_afh_front.pdf
(read the chapter PDFs from the handbook's index first; web search could not open the chapter text).

## What
A `c172_soft_field_takeoff` mission on a Addison runway with a rolling-resistance coefficient raised for the
roll (flightModel.js wheel friction; the POH's soft-field correction is not published for the 172S, so pick the
coefficient from a cited aeronautical source and say it is a game surface, not a measured one). Coach (a
takeoffCoach.js branch): flaps 10, full back stick at the start, "ease it off" as the nose wheel lightens, hold
level in ground effect, accelerate to 74 KIAS, then climb. Graded on nose-wheel load fraction through the roll,
lift-off speed, and not climbing out before Vy.

## Acceptance criteria
- [ ] The mission is in the picker and starts on the runway at Addison with the surface drag applied.
- [ ] Holding the stick forward the whole roll takes visibly longer and grades below B; the AFH technique earns A.
- [ ] The surface drag is named in the briefing as a game setting, and the source of its value is in the code comment.
- [ ] Works at 390x844 touch and 1280x720 keyboard; no frame-time regression.

## Test plan
tests/flight card: a scripted soft-field technique lifts off within the cited speed band; stick-forward takes
longer. Unit test for the grader. e2e: the mission loads and the card shows.

## Out of scope
A per-surface map of the world; wet runways; a grass-strip airport.
