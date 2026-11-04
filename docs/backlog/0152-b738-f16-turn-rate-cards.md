---
id: 0152
title: Turn-rate cards for the 737 and the F-16: a bank gives the rate the FAA formula says
status: ready
priority: P1
size: M
lens: authenticity
created: 2026-11-04
pr:
---

## Why
The Cessna has a level-turn card against the FAA handbook (turn rate 1091·tan(bank)/TAS °/s,
and the stall speed in a banked turn, tests/flight/c172.test.js, FAA-H-8083-25B); the 737 and
the F-16 have none, although the pillar says every aircraft's claims are checkable. A turn
rate is pure kinematics in coordinated level flight, so it needs no proprietary data: ω =
g·tan(φ)/V (FAA-H-8083-25B ch. 5, the
load factor 1/cos φ). A standard-rate turn is 3°/s, which is what a 737 crew flies at about
a 15-25° bank at 250 kt and what the autopilot's HDG mode should show.

## What
`tests/flight/b738.test.js` and `f16.test.js`: trim level at 250 KIAS / 10,000 ft (737, 65 t,
flaps up) and 350 KIAS / 10,000 ft (F-16), roll to 30° and 45° bank with the ball centred,
hold level with pitch, and assert the turn rate within ±8% of g·tan(φ)/TAS and the load
factor meter within ±3% of 1/cos φ after the roll-in settles. Same card for the 737 at
flaps 30 / 150 KIAS. Anything outside the band becomes an `it.fails` KNOWN GAP with a
ticket; do not detune a model to pass.

## Acceptance criteria
- [ ] Cards for the 737 (clean, flaps 30) and the F-16 at two bank angles each, citing FAA-H-8083-25B
- [ ] Each passes or is an `it.fails` KNOWN GAP with a ticket, the measured number in the title
- [ ] A held 60° bank on the 737 reads about 2 g and does not stall at 250 KIAS
- [ ] Both flight models (flightModel.js and the JSBSim path where they run) are carded as the Cessna's are

## Test plan
The cards above, run by `npm run test:flight`; the harness already provides trim and a bank
hold (see the Cessna turn card for the pattern).

## Out of scope
Roll rate and aileron authority (no cited source yet); the autopilot's bank limits.
