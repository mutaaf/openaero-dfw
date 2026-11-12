---
id: 0178
title: The Cessna's forward slip loses height: flightModel.js gets drag due to sideslip (Roskam CDβ)
status: proposed
priority: P2
size: S
lens: authenticity
created: 2026-11-12
pr:
---

## Why
Found by 0176's card (`tests/flight/c172.test.js`, "Cessna 172S forward slip"). The Airplane Flying
Handbook (FAA-H-8083-3C ch. 9, p. 9-13) says a forward slip "is used to dissipate altitude and increase
descent rate without increasing airspeed". In flightModel.js a full-rudder slip at 70 KIAS, idle, flaps up
(β 23°) sinks 954 fpm against the straight glide's 861 (+11%); the card asks for +30%. JSBSim, flying our
public/jsbsim C172 with Roskam's drag due to sideslip (CDβ 0.17·|β|), sinks 1,308 (+61%). flightModel.js
has no sideslip drag term at all (aero.js dragCoefficient reads only CL, gear, flaps, ground effect and
Mach), so a player who slips off extra height in the game (the 0177 mission) barely gets any.

The handbook also ties the slip's sink to its bank ("the steeper the bank, the steeper the descent"): the game holds
the track with only ~6° of bank at full rudder (JSBSim ~7°), so almost none of the sink can come from tilting the
lift. Drag is the missing piece, but check the bank is still credible after the fix.

## What
Add a per-airframe `cdBeta` to `src/aircraft.js` (the C172's Roskam 0.17, the same source and value as
public/jsbsim/aircraft/c172/c172.xml) and add `cdBeta·|β|` to the drag in flightModel.js (or aero.js
dragCoefficient, with β passed in). A probe of exactly that (not shipped) gave 1,445 fpm at 68.1 KIAS (+68% on the straight glide's 861 fpm at 68.7 KIAS; IAS within the card's 5 kt).
Leave the 737 and F-16 at 0 unless a cited value is found. Re-run the crosswind cards: the 15 kt
wing-low landing (and the slip-bank comparison with JSBSim) fly a ~12° slip and may move.

## Acceptance criteria
- [ ] 0176's flightModel.js `slipSink` card promoted from `it.fails` to `it`
- [ ] `cdBeta`'s source cited in `src/aircraft.js`
- [ ] Every other C172 card passes unchanged (crosswind takeoff/landing, sideslip vs JSBSim, glide 9:1, turns)

## Test plan
`npm test -- tests/flight/c172.test.js`; the full `tests/flight` for the other airframes.

## Out of scope
Pitot-static error in a slip (the AFH notes it); flaps-extended slip limits; the 737 and F-16.
