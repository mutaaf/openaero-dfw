---
id: 0162
title: The Cessna burns fuel at the POH rate: a fuel readout, and an empty tank stops the engine
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-11-06
pr:
---

## Why
The sim has no fuel model for piston aircraft (`grep -i fuel src/` finds only the 737 engine
citation), so a long flight never costs anything and "range" means nothing. Every real
pilot plans fuel; a flight model "you can check" should reproduce the POH's published
range and endurance. The Cessna 172S spec page gives 53 US gal usable, 518 NM and 4.26 h
at 75% power, 8,500 ft, recommended lean mixture, 45-minute reserve not included in the
cruise figure (POH copy: https://www.befa.org/wp-content/uploads/2019/12/POH-Cessna-172S.pdf,
Section 1 and Section 5 cruise tables).

## What
`src/engine.js` (or a small new pure `src/fuel.js`): fuel flow as a function of throttle
and altitude for the C172, integrated over sim time; usable fuel starts at the full
53 gal on a normal spawn (airborne mission spawns keep a plausible partial load). A small
FUEL readout (gal and minutes remaining) in the Pilot HUD panel row only, never Kid. At
zero the engine quits through the existing `engineOut.js` path, with a caption and a
FUEL EXHAUSTED line on the results card. The 737 and F-16 are out of scope here.

## Acceptance criteria
- [ ] Level cruise at 75% power, 8,500 ft burns within ±10% of the POH's 53 gal / 4.26 h (12.4 gal/h)
- [ ] The existing climb and cruise cards (c172.test.js) are unchanged
- [ ] Fuel reaching zero cuts thrust to zero and the dead-stick glide card still passes
- [ ] Readout shows at Pilot only, fits at 390x844 without covering the horizon
- [ ] No frame-time regression

## Test plan
tests/flight/c172.test.js: a cruise burn card with the cited figures; a flight that runs
the tank dry and asserts engine-out. Unit test for `fuel.js` over throttle/altitude.
e2e: readout visible at Pilot, absent at Kid, at 390x844 and 1280x720.

## Out of scope
Fuel planning screens, fuel tank selector, mixture control, refuelling, 737/F-16 fuel.
