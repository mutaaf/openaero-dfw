---
id: 0208
title: Spawn in-air missions at their airspeed through the air, then make the slow-flight band fair on a bumpy day
status: shipped
priority: P2
size: M
lens: authenticity
created: 2026-11-18
pr: 298
---

## Why
main.js spawns an in-air mission at its `kias` as a speed along the heading over the ground and ignores the wind.
On the slow-flight drill (heading 0, DFW's usual southerly from behind), the Cessna starts well below its 95 KIAS
through the air: about 66 KIAS in 25G38, 67.5 in 20G40 and 62 in a steady 35 kt, which is already under that day's
band. The drill then starts its hold before the player has slowed down at all. Found by the 0199 physics panel (#289).
A by-the-book test pilot on that spawn holds the band's middle without a stall or a warning, but it grades B-C
(in the band 52-68% of the hold; tests/flight/slowFlight.test.js, the 0199 turbulence cards), because the hold's
first seconds are the spawn's disturbance. The 2 s airspeed filter also passes the gust cycle's swings straight
into the 10 kt band. Kid hands off grades B on 2 of 12 runs, with "too slow" reasons next to "the plane flew it
for you".

## What
1. Spawn: add the wind (the METAR at the spawn's height, weather.js windVector and surfaceWindFactor) to the
   in-air spawn velocity, so `kias` is through the air. List every in-air mission whose cards move.
2. Then re-measure the 0199 slow-flight cards. If a by-the-book pilot still grades under A in 15G25-25G38, decide
   with a card whether the band's grading should read a slower airspeed filter on a gusty day, the way a pilot
   averages the needle.
3. Kid's slow-flight grade reasons: do not tell a hands-off Kid to "lower the nose".

## Acceptance criteria
- [ ] An in-air spawn reads its mission's kias (±2 kt) in a 25 kt tailwind and headwind (unit or flight test)
- [ ] slowFlight.test.js's turbulence cards also assert the grade (A or better for the band's middle, or a written reason)
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
tests/flight/slowFlight.test.js with the spawn made through the air; an e2e that the spawn's IAS matches the mission.

## Out of scope
The turbulence model (0195) and the band's floor (0199).

## Builder notes (2026-11-21)
1. **The game already spawned through the air.** main.js loadScenario has added `sim.windVec` (updateWind(0): the METAR
   at the spawn's height, surfaceWindFactor, the turbulence's first sample) to every airborne spawn since before #237;
   measured in the built game, the slow-flight drill opens at 93-96 KIAS in 18025KT and 36025KT (ground speed 129 / 79 kt).
   The windless spawn was tests/flight/slowFlight.test.js's harness (makeBody's 95 kt along the heading), whose comment
   said main.js did the same. The harness now spawns as main.js does; tests/e2e/spawnAirspeed.spec.js pins the game's
   (median of 5 readings within 3 kt of 95 in a 25 kt tailwind and headwind) and a flight card the harness's (±2 kt).
   No other in-air mission moves: they all go through the same spawn line.
2. Re-measured with the spawn through the air, the handbook pilot at the band's middle (2 s filter) graded B on the speed
   in 6 of 18 runs (15G25 1, 25G38 3, 25 kt 1; plus one on 103 ft of height). FAA-S-ACS-6C Appendix 3 (p. 77, Area VII
   Task A): turbulence may cause momentary deviations; "unsatisfactory performance would arise from an applicant's
   continual deviation from the standard"; Appendix 1 (p. 68): "consistently exceeding tolerances". So on a day whose
   METAR raises the band (gustAddKts ≥ 0.5) the band's share reads a 6 s average from the hold's entry
   (SLOW_IAS_GUSTY_TAU_S; 4 s left 4 B, 6 s none; seeding it at the entry matters: started at cruise it graded worse).
   The coach's words and the slow-down's end still read the 2 s filter. A pilot riding the band's top in 25G38 still
   grades C ("Too fast"), 6 seeds.
3. Kid's B reasons no longer say "lower the nose" / "more power": they say what the bumps did to the plane. Kid's hands-off
   hold now grades S or A in 25G38 and 25 kt, 12 runs in 12.
