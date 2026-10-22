---
id: 0047
title: Go-around drill: fly a bad approach, apply power and climb out, and be graded on it
status: shipped
priority: P1
size: M
lens: authenticity
created: 2026-10-19
pr: 79
---

## Why
The stabilized-approach gate (0020) already says "unstabilized, go around", but nothing lets
the player do it: after the call there is no missed-approach procedure, no coaching and no
credit. A go-around is the single most valuable habit a real pilot practises, and the FAA
stresses it as the right answer to an unstable approach
(https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/airplane_handbook/09_afh_ch8.pdf).
A casual player gets a second, different kind of win: "I recovered".

## What
New mission `go_around_drill` (KDFW 35C, 4 NM final, deliberately 20 kt fast and 1 dot high
via the spawn in `src/airports.js` / `src/missions.js`). The coach (`src/coach.js`) walks:
power up, pitch for climb, flaps one notch, positive rate, gear up (retractable types),
then fly the runway heading to 2,000 ft. Success = climb through 500 ft AGL with positive
rate after the gate evaluated UNSTABILIZED. Graded on the results card; best kept under its
own mission key in `openaero_best`.

## Acceptance criteria
- [x] Mission appears in the start picker (0029) under KDFW with a one-line blurb
- [x] Unit test: pure `goAroundState` flags "go-around complete" only after positive rate through 500 ft AGL following an unstabilized gate result
- [x] Landing instead of going around grades as "should have gone around" (capped grade, stated on the card)
- [x] Works at 390x844 touch and 1280x720 keyboard

## Test plan
Unit test for the state machine; e2e loads `?mission=go_around_drill`, applies full throttle, asserts the results card says go-around complete.

## Out of scope
ATC phraseology, published missed-approach holds, other airports.
