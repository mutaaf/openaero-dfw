---
id: 0104
title: Engine failure after takeoff: the "impossible turn" mission, and why you land ahead
status: ready
priority: P1
size: M
lens: content
created: 2026-10-28
pr:
---

## Why
The dead-stick challenge (0036) teaches a glide from pattern altitude. The accident that
really kills pilots is the engine that quits just after liftoff, when the instinct is to
turn back to the runway. The FAA's Airplane Flying Handbook says that before a safe
maneuvering altitude "it is usually inadvisable to attempt to turn back"; AC 61-83J
(2018) asks instructors to teach when and how a 180° turnback can be made; the FAA Safety
Team handout notes the return needs well over 180° of turn once the turn radius is counted
(https://www.faasafety.gov/files/gslac/library/documents/2016/Feb/111580/Engine%20Failure%20on%20Takeoff%20Handout.pdf,
AOPA summary: https://www.aopa.org/news-and-media/all-news/2021/june/pilot/proficient-pilot-unintended-consequences).
The sim already has the pieces (engine-out flag, best-glide coach, graded off-airport
touchdown, headless flight cards), so a player can learn the lesson by living it: fail at
200 ft and try to turn back, then fail at 1,000 ft and make it.

## What
A lazy-chunk mission like 0036 (`src/engineOut.js` or an extension of `deadStick.js`):
the C172 is rolling on Addison 16 (or the Cessna's KDFW-area departure end), takes off
normally, and the engine fails at a chosen height (the mission picker offers 300 ft and
900 ft AGL). The coach says "pitch for 68, land ahead" first, then, below a computed
turnback height, keeps saying so; above it, it allows the turn. The turnback height is
computed from the live glide ratio and a 1 s reaction delay at the bank the assist level
allows, not a hard-coded number. The result is graded: on a runway or a clear field
ahead (the existing off-airport touchdown grader), turnback made, or a stall in the turn
(capped D with "the turn cost you X ft"). Kid's guide lands ahead.

## Acceptance criteria
- [ ] Two missions (300 ft and 900 ft failure) appear in the picker under Addison with a blurb that states the lesson
- [ ] Engine is failed in the physics (`sim.engineFailed`), HUD says "ENG OUT", no autopilot
- [ ] A flight card flies each mission headless: the 300 ft case landing ahead survives, the same case with a turnback stalls or lands short; the 900 ft case turnback reaches the runway
- [ ] The coach's turnback height is computed from glide ratio and wind, and a unit test pins it
- [ ] Works at 390x844 touch and 1280x720; boot JS budget held (new code is lazy)

## Test plan
Unit test for the turnback-height function; flight cards in `tests/flight/` as above (the
fail-then-turn case is the one that must fail without the new coach/grader); one e2e that
starts the 300 ft mission, lets Kid fly it, and sees a graded results card.

## Out of scope
Twin-engine failures (V1 cut), engine-fire checklists, new scenery, the 737.
