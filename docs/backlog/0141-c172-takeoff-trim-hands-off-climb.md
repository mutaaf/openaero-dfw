---
id: 0141
title: C172 takeoff: Pilot's takeoff trim should settle into a climb, not back onto the runway
status: shipped
priority: P2
size: M
lens: authenticity
created: 2026-11-03
pr: 177
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

## Outcome
The takeoff spawn trims for Vy where the airframe publishes one (`spec.vyKts`, the C172's 74 KIAS,
POH Sec. 5), `trim.js takeoffTrimAoaDeg`; the jets keep 1.2 Vr bit for bit. Card (c172.test.js,
flaps 0 and 10, rotations to 6-9°, released at positive rate with main.js's hold-to-trim stand-in):
+572 to +780 ft in 60 s, settling at 67-73 KIAS mean (the stand-in trims part of the pull away),
troughs 5+ kt above the stall warning, never back on the runway. With 1.2 Vr every case failed.
Over-rotations of 10-12° are logged, not carded: at 12° with flaps 10 the lightly damped phugoid
still dips to ~54 kt (a warning) and touches once. A full aft yank is a separate model gap: 0144.
