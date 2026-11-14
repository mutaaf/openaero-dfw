---
id: 0158
title: The F-16 at Kid and Learner holds the centreline on a rollout in 25 kt of crosswind
status: proposed
priority: P2
size: M
lens: player-feel
created: 2026-11-05
pr:
---

## Why
Found shipping 0150. The 737 at Kid and Learner now holds a 20-25 kt crosswind rollout (the hold asks 5°/s more of
steered rate per degree at landing speeds, so the rudder surface helps the nose tyre), and so does the F-16 at 20 kt
(5.6 m). But the F-16's nose wheel steers ~190°/s at full pedal at landing speed (10°, a 4 m wheelbase) against the
737's ~35°/s, and the game drives the nose wheel and the rudder surface with one pedal: any pedal big enough for the
rudder surface to beat the fin's weathervaning steers the nose wheel far too hard. At 25 kt from 090 it runs 1,041 m
off in 40 s (1,107 m before 0150); a Learner (crabbed) touchdown in 20 kt 21.6 m. Gains that held it chattered the
pedal or failed the 0110 skip card (the 0150 PR's sweep).

## What
Give the F-16's nose-wheel steering its own authority schedule (the real one has a low-gain mode above taxi speed;
find a cited source for its authority, e.g. the F-16 flight manual's NWS description), in gear.js
noseSteerYawRate / spec.gear, so the pedal at landing speed is the rudder's and the nose wheel's steering is gentle.
Then flip the two `it.fails` KNOWN GAP (0158) cards in tests/flight/kidFinal.test.js.

## Acceptance criteria
- [ ] The two KNOWN GAP (0158) cards pass (flip to `it`)
- [ ] The 0110 groundSteer cards, the 0100/0150 rollout cards and the 30 fps card still pass
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
tests/flight/kidFinal.test.js, tests/flight/groundSteer.test.js.

## Out of scope
The 737 and the Cessna; Pilot's ground handling.

## Source search (Builder, 2026-11-11)
Searched for the F-16's nose-wheel steering authority: only study flashcards (±32°) and sim forums (engage under
~60 kt, weight-on-wheels); no flight-manual excerpt or report found, and no low/high gain mode for the F-16 (that is
the F/A-18's). Not citable yet.

## Builder findings (2026-11-14, not shipped; back to proposed)
**A source is now in hand.** *TO 1F-16CM/AM-1 BMS* (Falcon BMS 4.37.4, 18 April 2024; the Falcon BMS community's
edition of the USAF F-16C/D Block 50/52 flight manual, downloadable here from
cdn.falcon-bms.com/docs/4.37/TO%201F-16CMAM-1%20BMS.pdf). It is a community document, not the USAF original
(publicintelligence.net's GR1F-16CJ-1 resets, af.mil and dtic.mil return 403 here), so cite it as such:
- §10 Nosewheel Steering: "Steering signals are provided through the rudder pedals ... the nosewheel drives to the
  rudder pedal commanded position. NWS is limited to 32 degrees in each direction." The rudder pedals are
  force-sensing (§ flight controls). One pedal drives both, as the game does; the game's ±10° is not the cited 32°.
- Landing: "NWS should not be engaged above taxi speed unless required to prevent departure from prepared runway
  surface." §32.8 Crosswind landing: after touchdown "using the rudder to maintain aircraft track ... With all LG on
  the runway, maintain directional control with rudder, differential braking, and NWS if required ... High rudder
  pedal force may result in a yaw transient when NWS is engaged." No low-gain mode, and no taxi-speed number.

**Measured: NWS off above taxi speed alone makes it worse.** A trial `nwsMaxMps` in gear.js noseSteerYawRate (null,
a castering nose wheel, above 8 or 15 m/s groundspeed) left both KNOWN GAP (0158) cards failing and took the passing
0150 card (F-16, 20 kt from 270°) from 5.7 m to **1,375 m** off in 40 s; the 0100 "nose within 4° for 3 s" card
went 3.5° → 4.02°. Reverted. Why: flightModel.js puts the tyres' side force at the CG (`sideX/sideZ`, no moment),
so with the nose wheel castering nothing on the ground holds the nose to the track. A real F-16's main tyres sit
aft of the CG and their cornering force yaws the nose towards the track; the manual's technique leans on that plus
differential braking, neither of which the game has.

**Route (needs the Scout to re-scope; size L, touches every aircraft's ground cards):**
1. Apply the mains' and nose tyre's side force at their axles (gear.js, per wheel, capped at μ·load), so the
   mains' moment about the CG exists; re-run every groundSteer, kidFinal, crosswind takeoff and 0106 parked card.
2. Then the F-16: steerDeg 32 (cited) with NWS engaged only below taxi speed (a number still needs a source; the
   AFMAN 11-2F-16 v3 is the likely one, 403 here), and the Kid/Learner hold on the rudder (and, if modelled,
   per-main differential braking) above it.
