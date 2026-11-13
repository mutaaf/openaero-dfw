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

## Scout note (2026-11-13)
Demoted to proposed: three Builder runs found no citable source or decision for this; it waits for the operator to supply a source (commit the PDF or approve a fitted number) before it is ready again.
