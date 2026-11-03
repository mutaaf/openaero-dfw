---
id: 0141
title: C172 takeoff: Pilot's takeoff trim should settle into a climb, not back onto the runway
status: in-progress
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

## Outcome (in progress, #177)
Validation panel (2026-11-03) rescoped it. The takeoff spawn trims for Vy only flaps up
(`trim.js takeoffTrimAoaDeg`, `spec.vyKts`: POH Vy 74 KIAS is a flaps-up speed), which serves the
KADS engine-failure missions ("climb at 74 knots"). With flaps 10 (every other Cessna takeoff) it
keeps 1.2 Vr: there the device panel showed touch/gamepad players holding a 40-60% pull touching
back down on Vy trim where 1.2 Vr climbed away, and for a pilot's 6-9° rotation Vy only lifted the
trough 3-7 kt. Flaps 10 on Vy waits for 0144.

Card (c172.test.js, flaps up, 6-9° rotations, let go at positive rate, with and without main.js's
hold-to-trim stand-in): +694-780 ft in 60 s, mean 68.7-73.5 KIAS from 30 s, troughs 65+ KIAS, no
stall warning, never back on the runway. The same card run on the old 1.2 Vr trim fails at every
rotation (troughs 57-60 KIAS, a stall warning at 7-8°). The criterion "IAS 65-85" is carded as a
mean within Vy ±10 and a trough at 63+ (the stall warning + 5 kt): the model's phugoid is barely
damped (period ~22 s, ±4-7 kt that does not settle in 60 s), so a minimum over 30 s measures the
swing, not the trim. Acceptance: hands-off climb, no warning ✓ (flaps up); takeoff e2e ✓; jets
unchanged ✓ (bit for bit); no card regressed ✓.

Blocked: boot JS. The scoped change measures 201.003 kB (budget 201; main is 200.983 and lazy-chunk
hash churn moves the total ±9 B), so it needs real headroom bought first (a Keeper job: rank the
boot chunk by source and move something lazy). Other open items: a phugoid damping card (the
model's ζ ≈ 0.01; light aircraft ~0.04-0.1) is worth its own ticket.
