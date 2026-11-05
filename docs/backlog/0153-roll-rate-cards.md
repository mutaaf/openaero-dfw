---
id: 0153
title: Roll-rate cards for the Cessna and the F-16 (both KNOWN GAPs, fixed by 0156)
status: shipped
priority: P1
size: M
lens: authenticity
created: 2026-11-05
pr: 189
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
- [x] A C172 roll-rate card against JSBSim and an F-16 card against TP-1538, each stating its source in a comment
- [x] The 737 is logged (not carded) with its rate, so a later ticket can source it
- [ ] Mutation: halving roll damping in flightModel.js fails both cards (met for the C172 only; the F-16 gap is ~10x, see Shipped notes)
- [x] `npm run check:fast` green; no src change unless a card exposed a real gap

## Test plan
The new cards above (the two rate cards are `it.fails` KNOWN GAPs), plus the mutation check recorded in the PR body.

## Out of scope
Aileron adverse yaw, roll-in time constants, autopilot bank limits, the 737 card.

## Shipped notes
Both rate cards are KNOWN GAPs (0156). The C172 card enters a full-aileron roll at 90 KIAS from 120° of left bank
(the window flies faster: gravity steepens the path), so each model is compared at the TAS it flew: JSBSim's
C172 rolls at its own Roskam p·b/2V within 1.8% (63.7 vs 64.9°/s at 104.7 KTAS), and flightModel.js rolls 38.0°/s
where JSBSim's roll power gives 68.5°/s at the model's 112.7 KTAS (−45%). The F-16 rolls 30.9°/s against TP-1538's
308°/s roll-rate command (entered from 170° so a realistic 0.3-0.5 s roll-in reads within 14%). The 737 logs
17.9°/s at 250 KIAS and 17.8°/s at 160 KIAS. Mutation (roll damping halved): the C172 gap card goes red (69 vs 64°/s,
+8%); the F-16's stays out of band (62°/s), as it would for any damping change under ~8x. The ticket said c172p;
the oracle is our own JSBSim C172 (public/jsbsim/), as in jsbsimNode.js. The physics panel found the first cut's
window (from 75°) was not settled and its mutation result an artefact of the roll-in lag; fixed before merge.
