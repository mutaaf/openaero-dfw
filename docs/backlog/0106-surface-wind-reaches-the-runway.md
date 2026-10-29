---
id: 0106
title: The METAR wind reaches the runway: a headwind shortens the game's takeoff and landing roll
status: shipped
priority: P1
size: M
lens: authenticity
created: 2026-10-28
pr: 117
---

> **Shipped in #117** (2026-10-29) on top of 0110 (#120): the log-law wind at the CG's height,
> static tyre friction when nearly stopped, and a stopped airplane keeps its heading up to its tyres'
> scrub moment, brakes set or not. The panel added: Pilot on touch gets the centreline hold on the
> runway (no pedals: a phone 737 ran off from 40 kt in 10 kt), and the results card pauses the rollout.
> Cards: takeoff and landing roll in the game's wind (C172), parked in 25 kt (C172, 737, F-16;
> JSBSim's C172 creeps ~1.4 m across on its own tyre model, bounded at 2 m). The wind is read at
> the CG, not the C172's high wing (~2.7 m): 69% vs 77% of the METAR, the conservative side.

## Why
0103's cards show both flight models shorten the roll in a headwind the way the FAA handbook
says (FAA-H-8083-25C ch. 11, Fig. 11-19: a wind 10% of the lift-off speed, -19%; a tailwind,
+21%). But they set `body.windVec` directly. In the game, `updateWind` in `src/main.js`
scales the METAR wind by `sqrt(min(1, h / 30))`, where `h` is the wheels' height above the
ground. With the wheels on the runway `h = 0`, so the wind is exactly zero: a 15 kt METAR
headwind gives the calm roll, and the crosswind mission has no crosswind on the runway
(only the crab carried down from the air). Just after lift-off it is still small: at 1 m the factor is ~18%. The METAR wind is measured 10 m (33 ft) above the
ground (WMO/ASOS anemometer height). A boundary-layer profile thins it near the ground, but
not to nothing at the wing (~1-2 m up). The comment says the fade also keeps a parked
aircraft from sliding sideways. That job belongs to tyre friction (gear.js, 0082), not to
the air.

## What
Replace the fade with a wind profile referenced to 10 m: for example a log law
`ln(z/z0)/ln(10/z0)` with an airport z0 (~0.03 m), evaluated at the wing's height (wheels
+ the wing's height above them), with a floor so the wing feels most of the wind on the
runway. Check that a parked aircraft in a 25 kt crosswind stays put on its brakes (gear.js
friction), and re-fly the crosswind and bounce cards and the e2e takeoff and landing specs.

## Acceptance criteria
- [ ] A unit test pins the profile: 100% at 10 m, more than half at 2 m, monotonic
- [ ] An e2e (or a headless test of the wind function main.js uses) shows a 10 kt METAR headwind shortens the takeoff roll by at least 20% vs calm
- [ ] A parked C172 and 737 do not slide in a 25 kt crosswind with the brakes set
- [ ] tests/flight crosswind cards and the e2e flight specs stay green

## Test plan
Move the wind-at-height function out of main.js into weather.js (pure) with a unit test;
one e2e that rolls the C172 with a stubbed 10 kt headwind METAR and compares lift-off
distance with calm.

## Out of scope
Turbulence, gust structure near the ground, terrain sheltering, wind shear (0095).
