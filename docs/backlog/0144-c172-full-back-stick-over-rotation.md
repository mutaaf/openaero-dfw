---
id: 0144
title: C172 full back stick at Vr pitches ~45°/s to ~57° a foot off the runway, then hops back on
status: proposed
priority: P2
size: M
lens: authenticity
created: 2026-11-03
pr:
---

## Why
Found building 0141 (headless, flightModel.js, Pilot, flaps 0 or 10, full power). A keyboard or
touch player who pulls the stick fully back at Vr (55 KIAS; the game's stick reaches -1 in ~0.3 s)
sees the Cessna pitch up at ~45°/s: the mains leave at ~15° pitch, and from then on nothing limits
it (flightModel.js clamps pitch to `maxGroundPitchDeg` only while `onGround`), so it reaches ~57°
with the wheels about a foot up, the tail where the runway is, then falls back onto the mains and
repeats. That is the "hop back onto the runway" the 2026-10-30 lesson (#131) saw in takeoff.spec,
and no takeoff trim fixes it (0141 sets the trim for Vy; a pilot's 6-9° rotation then climbs away
hands off). A real 172 pulled full aft at 55 kt rotates far slower and the tail tie-down would meet
the runway near the tip-back angle (~14°, gear.js geometry).

## What
Measure the C172's pitch rate after a full aft step at Vr on the runway, and find which term makes
it ~45°/s (pitchAuthority 7.2 at low q, the airspeed/120 scaling, tailVsMainsAccel near lift-off).
Fix that against a cited source (JSBSim c172x's Cmδe/Cmq through our public/jsbsim model is the
obvious cross-check), and give the airframe a tail contact while the wheels are within a few feet
of the ground (not only `onGround`).

## Acceptance criteria
- [ ] Full aft stick held from Vr: peak pitch under ~20° while the wheels are under 5 ft
- [ ] Within 30% of JSBSim's C172 pitch rate for the same step (new card in tests/flight)
- [ ] Every c172.test.js card, the 0141 hands-off takeoff card and takeoff.spec still pass

## Test plan
tests/flight/c172.test.js: a full-aft-step card at Vr against the JSBSim model's pitch rate, and
a peak-pitch card near the ground.

## Out of scope
Assist levels (Kid/Learner already cap pitch); the 737/F-16 rotations.
