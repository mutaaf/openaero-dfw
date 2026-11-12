---
id: 0176
title: Cessna forward slip: crossed controls lose height without gaining speed (flight card)
status: shipped
priority: P2
size: S
lens: authenticity
created: 2026-11-12
pr:
---

## Why
0081 gave the Cessna side force from sideslip, but nothing proves the slip does what a pilot
uses it for. The FAA Airplane Flying Handbook (FAA-H-8083-3C ch. 9, "Forward slip") says a
forward slip "is used to dissipate altitude and increase descent rate without increasing
airspeed". If the model's slip does not do that, the mission in 0177 would teach the wrong thing.
Source: https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/airplane_handbook/10_afh_ch9.pdf
(read the chapter text for the exact wording before writing the card).

## What
Cards in `tests/flight/c172.test.js` on flightModel.js (and JSBSim if its slip runs headless):
trimmed at 70 KIAS, flaps up, idle, a straight glide for 10 s gives a baseline descent rate;
then the same airplane with full rudder one way and aileron the other way, wings roughly
level-to-slightly-banked, holding 70 KIAS with the nose, for 10 s. Assert (a) the descent rate
is at least 30% higher than the baseline, (b) the airspeed holds within 5 kt (it must not
climb), (c) the ground track stays within 15° of the start heading while the nose points
off it. Measure first; set the bounds from what the model gives, widen only with a written
reason. If (a) or (b) fails, commit it as a KNOWN GAP `it.fails` with a ticket for the fix.

## Acceptance criteria
- [ ] The slip card exists and passes, or fails as a named KNOWN GAP with a ticket.
- [ ] A mutation (zero the sideslip drag term) makes (a) fail.
- [ ] `node scripts/check-gaps.mjs` passes.

## Test plan
`npm test -- tests/flight/c172.test.js`; record the measured descent rates in the PR body.

## Out of scope
The mission (0177), the 737 and F-16, flaps-extended slips.
