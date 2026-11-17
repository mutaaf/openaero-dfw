---
id: 0194
title: The Cessna rolls left at full power in flightModel.js (prop torque); the yaw (P-factor, slipstream) is 0200
status: shipped
priority: P2
size: M
lens: authenticity
created: 2026-11-17
pr: 280
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

## Shipped (2026-11-17)
The torque, not a fitted yaw. A probe of our JSBSim C172 found it needs ~0 rudder in any steady
full-power climb (50-110 KIAS): its only left-turning term is the prop's torque (`p_factor` 0), and its
6.6° in the power-on card comes from that roll and the wings-level hold standing off it. No C172 figure
for the rudder P-factor or the slipstream's swirl takes could be found, so a yaw term would have been a
number fitted to JSBSim's outcome with a mechanism JSBSim does not have. Instead flightModel.js gets the
torque at its cited size: Q = T·D/2π·CP/CT (prop76, 0.229 m arm) = 474 N·m static, the POH's 180 hp at
2,700 rpm; it takes 0.047 / 0.030 of right aileron at 74 / 90 KIAS (JSBSim 0.045 / 0.031). That alone
yaws the no-rudder power-on entry 4.5° left (bank −2.1°; JSBSim 6.6°, −2.7°): the gap card is a plain `it`.
In the air only (the gear takes it on the wheels). The autopilot and Kid/Learner feed it forward; raw
Pilot holds a touch of right stick. P-factor and swirl: 0200.
