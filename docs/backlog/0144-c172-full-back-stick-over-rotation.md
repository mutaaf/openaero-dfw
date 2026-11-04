---
id: 0144
title: C172 held back stick at Vr pitches up to ~45°/s, to ~57° a foot off the runway, then hops back on
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-11-03
pr:
---

## Why
Found building 0141 (headless, flightModel.js, Pilot, flaps 0 or 10, full power). A keyboard or
touch player who pulls the stick fully back at Vr (55 KIAS; the game's stick reaches -1 in ~0.3 s)
sees the Cessna pitch up at ~45°/s: the mains leave at ~10-12° pitch, and from then on nothing
limits it (flightModel.js clamps pitch to `maxGroundPitchDeg`, 15° by default, only while
`onGround`, and snaps it from ~45° back to 15° on every touch), so it reaches ~54-57° with the
wheels well under a foot up, then falls back onto the mains and repeats every 2.5-4 s. A partial
pull is not much better (device panel, #177): a 20-25% pull held from Vr reaches ~14° by
"positive rate", 40-60% reaches 22-34°, held 3-6 s it reaches 35-82°. That is the "hop back onto the runway" the 2026-10-30 lesson (#131) saw in takeoff.spec,
and no takeoff trim fixes it (0141 sets the trim for Vy; a pilot's 6-9° rotation then climbs away
hands off). A real 172 pulled full aft at 55 kt rotates far slower, and its tail would meet the runway
long before 57° (the CG-over-mains tip-back angle in gear.js is ~15°; a tail-strike angle needs a
source).

## What
Measure the C172's pitch rate after a full aft step at Vr on the runway, and find which term makes
it ~45°/s (pitchAuthority 7.2 at low q, the airspeed/120 scaling, tailVsMainsAccel near lift-off).
Fix that against a cited source (JSBSim c172x's Cmδe/Cmq through our public/jsbsim model is the
obvious cross-check), and give the airframe a tail contact while the wheels are within a few feet
of the ground (not only `onGround`).

## Acceptance criteria
- [ ] Full aft stick held from Vr: peak pitch under ~20° while the wheels are under 5 ft
- [ ] Within 30% of JSBSim's C172 pitch rate for the same step (new card in tests/flight)
- [ ] A held 40-60% pull released at positive rate (touch, gamepad) climbs away at flaps 10
- [ ] Then 0141's Vy takeoff trim can apply with flaps 10 too (trim.js takeoffTrimAoaDeg is flaps
      up only until then): its hands-off card at flaps 10, held pulls included
- [ ] Every c172.test.js card, the 0141 hands-off takeoff card and takeoff.spec still pass

## Test plan
tests/flight/c172.test.js: a full-aft-step card at Vr against the JSBSim model's pitch rate, and
a peak-pitch card near the ground.

## Out of scope
Assist levels (Kid/Learner already cap pitch); the 737/F-16 rotations.
