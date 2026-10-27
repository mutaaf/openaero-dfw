---
id: 0097
title: Kid's hands-off final holds the centreline in a crosswind, not 55 m beside it
status: ready
priority: P1
size: S
lens: player-feel
created: 2026-10-27
pr:
---

## Why
Found flying the traffic pattern (0048) headless from its spawn: in a 10 kt crosswind Kid's
hands-off final settles ~50 m downwind of the centreline and touches down beside a 30 m wide
runway (the card reads D, off the side). `kidLocalizerBankDeg` (src/assists.js) steers the
nose heading onto a 0.15°/m intercept, so a crab angle (8° at 10 kt across 69 kt) leaves a
steady offset of drift / 0.15 ≈ 55 m, as its own comment says ("a crosswind's steady offset
goes as 1/that"). Every Kid final flown on a windy METAR has it; a kid lets go and still
misses the runway. Pilots fly the track, not the heading, onto the centreline (the crab).

## What
In main.js applyAssists, feed the hands-off line-up the ground track (from sim.vel) instead
of the nose heading, or add a slow integral on the cross-track error, so the steady offset
goes to zero with any crosswind. Keep the 45° capture check on heading. Boot budget: 4 B of
headroom after 0048, so pay for it first.

## Acceptance criteria
- [ ] tests/flight/pattern.test.js: the `it.fails` card "10 kt crosswind ... on the centreline"
      passes and is promoted to `it`
- [ ] A calm final and the 737 line-up (tests/unit/assists.test.js) are unchanged
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
Promote the known-gap card in tests/flight/pattern.test.js; add a unit case for the line-up
with a crosswind on the 737 too.

## Out of scope
Kid's de-crab in the flare (the auto-flare's bank cap already keeps the wings near level).
