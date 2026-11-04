---
id: 0144
title: C172 held back stick at Vr pitches up to ~45°/s, to ~57° a foot off the runway, then hops back on
status: shipped
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
Shipped in part (the tail contact and the rotation rate). Measured: the rotation's pitch rate was
never the fault: 38-39°/s against JSBSim's 41-43°/s for the same step (the C172 rotates on the
elevator against the mains' weight in both). What lets the nose run to 40°+ a few feet up is the
elevator's 36.7° of α past the trim on Roskam's linear Cmα/Cmδe, which our JSBSim C172 shares
(it peaks at 37-42° under 5 ft too): that needs a cited post-stall pitching moment, ticket 0109,
which now carries criteria 1, 3 and 4 as known-gap cards.
- [ ] Full aft stick held from Vr: peak pitch under ~20° while the wheels are under 5 ft (0109;
      `it.fails` card in c172.test.js, measured 41.6°)
- [x] Within 30% of JSBSim's C172 pitch rate for the same step (new card in tests/flight)
- [ ] A held 40-60% pull released at positive rate (touch, gamepad) climbs away at flaps 10 (0109;
      `it.fails` card, measured: 40% back on the runway, 50-60% a stall warning first)
- [ ] Then 0141's Vy takeoff trim can apply with flaps 10 too (0109)
- [x] Every c172.test.js card, the 0141 hands-off takeoff card and takeoff.spec still pass
- [x] (added) A tail contact while the wheels are near the ground, in the air too (gear.js
      spec.gear.tail, JSBSim's TAIL point: 15.0° about the mains): the tail stops within 3 cm of
      the runway; before, it went 2.1 m into it at ~57°

## Test plan
tests/flight/c172.test.js: a full-aft-step card at Vr against the JSBSim model's pitch rate, and
a peak-pitch card near the ground.

## Out of scope
Assist levels (Kid/Learner already cap pitch); the 737/F-16 rotations.
