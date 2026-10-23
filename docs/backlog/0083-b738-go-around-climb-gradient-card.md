---
id: 0083
title: 737 go-around card: 3.2% climb gradient and the 8-second spool-up
status: shipped
priority: P1
size: S
lens: authenticity
created: 2026-10-23
pr:
---

## Why
The go-around drill (0047) lets a player slam the 737's thrust levers forward on short final, but
no flight test card says the airplane then climbs away the way a certified one must. 14 CFR 25.119
requires a steady gradient of at least 3.2% in the landing configuration, all engines operating, at
the thrust available 8 seconds after the levers leave minimum flight idle, climbing at Vref
(https://www.ecfr.gov/current/title-14/chapter-I/subchapter-C/part-25/subpart-B/subject-group-ECFR14f0e2fcc647a42/section-25.119).
A real 737-800 beats it comfortably; if ours does not, a "go around!" in the game would be a
trap, and if it climbs like a rocket the drill teaches nothing. Pillar 0: a card, against a cited rule.

## What
`tests/flight/b738.test.js`: a new describe. Spawn on a 3° final at Vref (flaps 30, gear down,
~65 t), start from the idle the final needs, command full thrust, run the engine spool-up, then
measure the steady climb gradient (rate of climb / true airspeed) holding Vref, gear down, flaps
30. Also card the time from lever to thrust ≥ 90% of the model's go-around thrust (engine.js
spool lag; FAR 25.119's 8 s is the certification reference, real engines are near 5–8 s). Misses
are `it.fails` with a ticket, never a loosened band. No `src/` change unless a card fails and is
filed.

## Acceptance criteria
- [ ] Card: all-engines landing-configuration climb gradient at Vref ≥ 3.2% (and ≤ 12%, a sanity bound)
- [ ] Card: thrust at lever + 8 s is ≥ 90% of takeoff/go-around thrust at that altitude and speed
- [ ] The pilot harness in the card holds Vref ±2 kt, wings level, and says so in the header comment
- [ ] `npm run check` green; no existing card regresses

## Test plan
Vitest flight cards in `tests/flight/b738.test.js` using `harness.js`; the rule text cited in the
describe header with the 8 s and Vref conditions.

## Out of scope
One-engine-inoperative approach climb (25.121, 2.1%); changing engine spool numbers without a
second source.
