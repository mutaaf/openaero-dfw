---
id: 0203
title: Our JSBSim C172 may count the elevator's lift twice (aero.js's POH-fitted CL table plus Roskam's CLδe)
status: proposed
priority: P2
size: M
lens: authenticity
created: 2026-11-18
pr:
---

## Why
Found by 0170. public/jsbsim/aircraft/c172/c172.xml's `CLalpha` table is aero.js's lift curve (its OAERO
note): 0.35 + 4.8·α, fitted so the POH stall speeds come out. A POH stall is flown with the elevator
well up, so that fit already holds the tail's download. The file then adds Roskam's `CLde` 0.43 per radian
of elevator on top, so full back stick (28° up) costs another 0.21 of CL.

Held full back from Vr, JSBSim climbs only ~100-200 fpm in its first seconds, where flightModel.js makes
400-1,000 fpm. Its peak pitch under 5 ft is 20.0 / 21.7° (flaps 0 / 10). With `CLde` set to 0, JSBSim
peaks at 22.1 / 23.7°, and its α is unchanged (18.9 / 18.8°). Only the trimmed elevator's share is really counted twice (the deflection beyond trim at full aft is real lift lost), so 22.1 / 23.7° is an upper bound. JSBSim also stalls ~1.5 kt fast clean (tests/flight/c172.test.js's JSBSim gaps). That gap is most of what 0170's
"flightModel.js over-rotates 3-5° past JSBSim" was. The 2026-11-14 lesson already warned about this:
grep `OAERO` before calling JSBSim a second opinion.

## What
Decide what JSBSim's lift should be:
- the table with `CLde` applied only to the elevator's deflection beyond the trimmed one, or
- a table re-fitted with `CLde` in it, against the POH stall speeds flown on JSBSim.

Then re-run every JSBSim card: stall speeds, takeoff distances, the Va pull. Its stall speed with the
download double-counted is likely already high.

## Acceptance criteria
- [ ] The PR says which of the two options it chose, and why (with the stall-speed numbers)
- [ ] JSBSim's 1 g stall speeds (flaps 0/10/30) within the cards' POH bands, flown with the elevator it takes
- [ ] The `KNOWN GAP (0202, 0203)` pitch cards in tests/flight/c172.test.js pass once 0202 has shipped, or are re-measured and retargeted if the chosen option leaves part of the gap (the first option may)
- [ ] No JSBSim card regresses (`npx vitest run tests/flight`)

## Test plan
tests/flight/c172.test.js (JSBSim runs), tests/flight/jsbsim*.test.js.
