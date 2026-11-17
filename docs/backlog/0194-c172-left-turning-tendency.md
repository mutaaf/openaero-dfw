---
id: 0194
title: The Cessna yaws left at full power and high pitch in flightModel.js (P-factor, slipstream, torque)
status: proposed
priority: P2
size: M
lens: authenticity
created: 2026-11-17
pr:
---

## Why
0191's power-on stall card (`tests/flight/powerOnStall.test.js`, KNOWN GAP 0194) flies the Cessna at full
power, flaps 10, the nose held at 20° with no rudder: JSBSim's C172 (its stock P-factor and torque) yaws
6.6° left and banks ~3° left by the stall, while flightModel.js, the game's default, holds its heading
exactly (0.0°). The Airplane Flying Handbook (FAA-H-8083-3C, ch. 5, "Full Stalls, Power-On", p. 5-17) has
the pilot "adding right rudder" through the entry, and the ACS grades the heading (±10°): on flightModel.js
the rudder is never needed, so the drill can't teach it. The same tendency matters on every Cessna takeoff
roll and climb.

## What
Add a left-turning yaw (and roll) term to flightModel.js for propeller aircraft that grows with power and
angle of attack and falls with airspeed (slipstream swirl on the fin, P-factor, torque), fitted to a cited
source (a C172 flight-test or POH-adjacent figure for the rudder needed at Vx/Vy full power, or matched to
JSBSim's c172.xml moments as a stand-in, said so). Promote the gap card; re-measure takeoff and climb cards.

## Acceptance criteria
- [ ] The KNOWN GAP (0194) card in tests/flight/powerOnStall.test.js passes and becomes a plain `it`
- [ ] Cessna takeoff and crosswind cards still pass; the moved figures listed in the PR body
- [ ] `node scripts/check-gaps.mjs` passes

## Test plan
`npm test -- tests/flight`.

## Out of scope
The jets (no propeller); spin dynamics.
