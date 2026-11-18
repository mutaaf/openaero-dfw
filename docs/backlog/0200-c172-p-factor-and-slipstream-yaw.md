---
id: 0200
title: The Cessna needs right rudder in a full-power climb: P-factor and slipstream swirl, from a cited figure
status: proposed
priority: P1
size: M
lens: authenticity
created: 2026-11-17
pr:
---

## Why
0194 shipped the prop's torque (a left roll the ailerons hold, sized from the POH's 180 hp at 2,700 rpm).
The Airplane Flying Handbook (FAA-H-8083-3C, ch. 3/5) also has the pilot hold right rudder in the climb
and through a power-on stall entry: P-factor and the slipstream's swirl on the fin yaw the nose left at
high power and angle of attack. flightModel.js has no such yaw (the ball stays centred with the feet flat),
and neither does our JSBSim C172 (`p_factor` 0 in public/jsbsim/aircraft/c172/c172.xml): with its ball
centred it needs ~0 rudder from 50 to 110 KIAS at full power (0194's probe), so it cannot stand in.

## What
Find a cited figure first: a C172 (or similar single) flight test or certification report giving the rudder
deflection or pedal force to hold the ball centred at full power at Vx/Vy, or the yawing moment of the
slipstream (NACA/NASA power-effects data on a tractor single). Then add a yaw term to flightModel.js that
grows with thrust coefficient and α, fitted to it, and think about who flies it: touch Pilot has no pedals
in the air (main.js), so a steady yaw would leave them slipping (#256 met the same question with CDβ).

## Acceptance criteria
- [ ] A card in tests/flight against the cited figure
- [ ] Every other C172 card still passes; moved figures listed in the PR

## Test plan
`npm test -- tests/flight`.

## Out of scope
Spins; the jets.

## Back to proposed (2026-11-18, Builder)
Still no figure. A web search (NASA NTRS, flight-test reports) for a C172 or similar tractor single's rudder
deflection or pedal force to hold the ball at full power, or its slipstream yawing moment, found only general
results: NASA TP-2535-era wind-tunnel notes that thrust raises rudder effectiveness, and that trim changes are
largest at high power. None gives a number for this airplane, and 0194's run found none either. Promote it
again when someone has the document and page: e.g. a Cessna/FAA certification flight-test report, a NACA/NASA
power-effects test of a high-wing tractor single, or a measured pedal force at Vy full power.
