---
id: 0164
title: Slow-flight mission: hold 5-10 kt over the stall warning, level, graded to the FAA test standard
status: shipped
priority: P2
size: M
lens: content
created: 2026-11-06
pr:
---

## Why
Slow flight is the Private Pilot checkride maneuver that sits between 0161's steep turn and
0087's stall recovery: fly just above the stall warning, level, with the nose high and the
power doing the work ("behind the power curve"). It is the lesson that makes a kid feel why
speed and pitch are linked, and it exercises the flight model where it is most carefully
checked (stall speed, stall warning, flap CLmax). Tolerances reported for the Private ACS
(FAA-S-ACS-6C, Area VII Task A): altitude ±100 ft, heading ±10°, bank ±10° in turns,
airspeed +10/-0 kt over the target, and the stall warning must not sound
([summary](https://www.flightschoolusa.com/private-pilot-checkride-maneuvers/),
[lesson plan](https://www.cfinotebook.net/lesson-plans/private-pilot-airplane/slow-flight-and-stalls/maneuvering-during-slow-flight-lesson-plan)).
One flashcard source says +5 kt: the Builder must read the current ACS PDF
([Sporty's copy](https://www.sportys.com/media/pdf/acsprivate2017.pdf), or faa.gov) and
cite the exact figures in the code comment; if it cannot be read from the sandbox, take the
next ticket and say so.

## What
A Cessna mission `c172_slow_flight` (kind `drill`, 4,500 ft AGL over a fixed point, C172,
flaps and gear as the ACS asks) with a pure state machine in a new lazy chunk
`src/slowFlightDrill.js` (pattern of `goAround.js`): `setup` (slow below the target with
power) -> `holding` (a 45 s timer runs while airspeed sits in the band, altitude and
heading in tolerance) -> grade. Target speed derives from the aircraft's own stall-warning
speed (`stallWarningKts`) plus the band, never a hard-coded number. Grade inputs: seconds in
tolerance, worst altitude and heading deviation, a stall warning (caps the grade), an
actual stall (fail). Coach lines reuse `coach.js` style ("Add power, raise the nose").
Results card via the existing path with its own best key (`@kid`/`@learner` per invariant 6).
Touches missions.js, coach.js, a new module, small main.js wiring, tests.

## Acceptance criteria
- [ ] The mission is in the start-screen picker and deep-links with `?mission=c172_slow_flight`
- [ ] A scripted hold inside the tolerances for the full timer grades A or S
- [ ] A hold that trips the stall warning is capped at C; a stall fails the drill
- [ ] Target speed is read from the aircraft model, not hard-coded; tolerances cite the ACS in a comment
- [ ] Works at 390x844 touch and 1280x720 keyboard; Kid still lets the airplane reach the warning (no hidden floor)
- [ ] No frame-time regression; the new chunk is outside the boot budget

## Test plan
Unit: `tests/unit/slowFlightDrill.test.js` drives the state machine with synthetic traces
(in band, drifting altitude, warning sounds, stall, never slows). Flight: a card in
`tests/flight/c172.test.js` flies a scripted hold headless and asserts it stays in band
without the warning. E2E: the mission loads and the card appears after a scripted hold.

## Out of scope
Turns in slow flight beyond a gentle heading hold, other aircraft, stall recovery (0087).
