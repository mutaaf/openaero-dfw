---
id: 0153
title: Roll-rate cards: the Cessna and the F-16 roll at the rate their aileron data says
status: ready
priority: P1
size: M
lens: authenticity
created: 2026-11-05
pr:
---

## Why
Every claim about the aircraft is checkable except how fast it rolls. 0152 carded the turn
(kinematics); 0152's own out-of-scope list says "roll rate and aileron authority (no cited
source yet)". The sources exist: the Cessna has an open JSBSim reference (c172p, already the
oracle in tests/flight/jsbsimNode.js), and the F-16 has NASA TP-1538 (Nguyen et al. 1979,
https://ntrs.nasa.gov/citations/19800005879, already cited in f16.test.js) whose roll damping
and aileron derivatives give a steady roll rate p = -(Clda/Clp)·δa·(2V/b). A sim that rolls
a trainer like a fighter (or the reverse) feels wrong to anyone who has flown either.

## What
`tests/flight/c172.test.js`: full aileron at 90 KIAS, 5,000 ft, flaps up, rudder coordinated;
the steady roll rate within ±25% of JSBSim's c172p for the same input (reuse jsbsimNode).
`tests/flight/f16.test.js`: full lateral stick at 350 KIAS / 10,000 ft; the steady rate within
±25% of the TP-1538 derivative estimate (the ticket's arithmetic goes in the test comment).
Out-of-band results become `it.fails` KNOWN GAPs with a follow-up ticket; do not detune the
model to pass. Touches tests and, only if a card fails, `src/flightModel.js` roll damping.

## Acceptance criteria
- [ ] A C172 roll-rate card against JSBSim and an F-16 card against TP-1538, each stating its source in a comment
- [ ] The 737 is logged (not carded) with its rate, so a later ticket can source it
- [ ] Mutation: halving roll damping in flightModel.js fails both cards
- [ ] `npm run check:fast` green; no src change unless a card exposed a real gap

## Test plan
The two new `it` cards above, plus the mutation check recorded in the PR body.

## Out of scope
Aileron adverse yaw, roll-in time constants, autopilot bank limits, the 737 card.
