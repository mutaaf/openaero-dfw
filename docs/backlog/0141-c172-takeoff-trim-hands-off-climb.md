---
id: 0141
title: C172 takeoff: Pilot's takeoff trim should settle into a climb, not back onto the runway
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-11-03
pr:
---

## Why
The 2026-10-30 lesson (#131) found that on the C172 takeoff roll, a stick released at lift-off
settles the airplane back to the runway at ~69 kt, because Pilot's trim is the spawn's. Real
C172S procedure sets elevator trim to the TAKEOFF range before the roll, and the airplane
then holds a climb attitude at Vy with roughly neutral stick (Cessna 172S POH Sec. 4, Normal
Procedures: "Elevator Trim - TAKEOFF"; Sec. 5 Vy 74 KIAS). A first-timer who lets go after
rotating should see a climbing airplane, not a hop. Lesson asked for a game decision; this is it.

## What
Set the C172 takeoff-roll spawn's `trimAlphaDeg` to the value that trims for Vy at full power
(measure headless), in `src/missions.js` / the takeoff spawn in `src/airports.js`. Flight cards
in `tests/flight/` fly: full power, rotate at 55 KIAS, release the stick, expect a positive rate
of climb that settles within +-10 kt of 74 KIAS over 30 s with no stall. Cite the POH in the card.

## Acceptance criteria
- [ ] Hands-off after rotation: climb 500+ ft in 60 s, IAS 65-85 kt, no stall warning
- [ ] The existing takeoff e2e (holds the key until "positive rate") still passes
- [ ] 737 and F-16 takeoffs unchanged
- [ ] No existing flight card regresses

## Test plan
New card in tests/flight (C172 hands-off takeoff climb). Unit check that only the C172's takeoff
spawn carries the new trim.

## Out of scope
A takeoff coach (0093); trim UI.
