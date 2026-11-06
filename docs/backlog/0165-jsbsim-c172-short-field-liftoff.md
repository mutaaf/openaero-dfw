---
id: 0165
title: JSBSim's Cessna lifts off a short-field takeoff at the POH's 51 KIAS, inside the card's 8% band
status: proposed
priority: P2
size: S
lens: authenticity
created: 2026-11-06
pr:
---

## Why
`tests/flight/c172.test.js`'s short-field takeoff card (POH: ground roll ~960 ft, lift-off 51 KIAS)
has been a known gap for the JSBSim model since PR #48, with no ticket behind it until the
known-gap ledger check (0160) asked for one. Measured: JSBSim lifts off at 55.2 kt against the
card's 55.08 band edge (flightModel.js 53.4, passing). The comment there gives the cause: the 11°
rotation hold sags to 10.2° on JSBSim's real tail, because the test pilot flies src/autopilot.js `elevatorForPitch`, which is
proportional only, so the wing reaches lift-off speed later. It is a harness pilot gap, not an
airframe one, until shown otherwise.

## What
Fly the POH's short-field rotation on JSBSim the way it is flown on flightModel.js: give the test
pilot's pitch hold enough authority (an integral term, or a feed-forward elevator for the
attitude) to hold 11° on JSBSim's tail, then re-measure. If the lift-off is still past the band
with the attitude held, record why and leave the card failing; never widen the band.

## Acceptance criteria
- [ ] The JSBSim short-field takeoff card (`GAPS.jsbsim` 'takeoff') passes and leaves the map
- [ ] The rotation attitude is held within 0.5° of 11° on both models (a card or a logged check)
- [ ] Every other C172 card passes unchanged on both models

## Test plan
`npm test -- tests/flight/c172.test.js`; the takeoff card on both models.

## Out of scope
Changing the POH figures or the card's tolerances; flightModel.js's takeoff (it passes).
