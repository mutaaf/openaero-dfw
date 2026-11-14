---
id: 0185
title: Kid's crosswind de-crab keeps its S after the Cessna's sideslip drag (0178)
status: proposed
priority: P2
size: S
lens: player-feel
created: 2026-11-14
pr:
---

## Why
0178 gave the Cessna Roskam's drag due to sideslip (CDβ 0.17·|β|, as in our JSBSim C172). Kid's de-crab
(`src/assists.js`, from `DECRAB_FROM_M` 2.5 m, gain 0.7) slips ~12° to line the nose up, and that slip now
sinks the hands-off Cessna ~10 fpm more at touchdown (kads_16_final 10 kt from 250°: 190 → 200 fpm,
57 → 56 KIAS), so the crosswind landing grades A 94 where calm air grades S 95 (first-timer panel, 0100:
a crosswind must not cost Kid the grade). The card is a KNOWN GAP (0185) in `tests/flight/kidFinal.test.js`.

Tried in 0178 (not shipped): de-crab from 2.2 m keeps the S at 10 kt only; from 2.0 m both winds but the
20 kt Cessna lands 5.7° off the track; gain 0.9-1.1 at 2.3-2.5 m keeps the A and costs the 737's and F-16's
nose-on-the-runway cards.

## What
Recover the ~10 fpm another way: e.g. the auto-flare's sink target or retard timing while the de-crab
slips (Kid's throttle retards over 2 s below 8 m), or a de-crab that finishes nearer the wheels with a
yaw-rate feed-forward. Re-run every kidFinal and pattern card.

## Acceptance criteria
- [ ] The KNOWN GAP (0185) cards are promoted to `it` (10 kt from 250°, 15 kt from 70°: S like calm)
- [ ] Every other kidFinal.test.js and pattern.test.js card passes

## Test plan
`npm test -- tests/flight/kidFinal.test.js tests/flight/pattern.test.js`

## Out of scope
The 737 and F-16 (no sideslip drag); Learner (no de-crab).
