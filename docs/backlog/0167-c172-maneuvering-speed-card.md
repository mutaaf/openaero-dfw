---
id: 0167
title: Cessna maneuvering-speed card: a full back-stick pull at Va stalls before it reaches the 3.8 g limit
status: shipped
priority: P2
size: S
lens: authenticity
created: 2026-11-10
pr: 228
---

## Why
Every Cessna checkride teaches Va: below it, yanking the yoke back stalls the wing before the
airframe is overstressed; above it, the wing can still fly and the airframe can break. It is
the number printed in the POH Section 2 limitations (Vno 129 and Vne 163 KIAS are agreed by
the 172S sources; Va at 2,550 lb is quoted as 99 KIAS in some handbooks and 105 in others, so
the Builder reads the POH and cites the page). The physics is checkable and independent of
that number: Va is the 1-g stall speed times the square root of the limit load factor
(14 CFR 23.337, normal category +3.8 g), so Vs 53 KCAS x sqrt(3.8) = ~103 KCAS. We have
accelerated-stall cards (0159, steep-turn stall) but nothing that pulls the stick abruptly
and reads the g. Sources: https://www.law.cornell.edu/cfr/text/14/23.337 ;
https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/airplane_handbook (FAA-H-8083-3C ch. 5, "Maneuvering speed").

## What
`tests/flight/c172.test.js`: fly level at 2,550 lb, sea level, at Va (as cited in the POH) and
at 1.3 Va, snap the stick full aft in 0.5 s and hold; record peak load factor. At Va the peak
must sit at or below 3.8 g plus a stated transient allowance (start at +0.3 g); at 1.3 Va it
must exceed 3.8 g (the model does not enforce the limit: the card says so, as a pilot's
tool, and nothing breaks). Also check Va scales with the square root of weight (card at
2,100 lb: Va falls by sqrt(2100/2550), about 9%). A miss ships as `it.fails` with a
`KNOWN GAP (NNNN)` ticket, not a loosened band. Tests only unless it finds a gap.

## Acceptance criteria
- [ ] The comment cites the POH page for Va, Vno, Vne and the weight it is for
- [ ] Peak g at Va is at or below limit + allowance; peak g at 1.3 Va exceeds the limit
- [ ] The weight-scaling check passes (or is a ticketed gap)
- [ ] `npm run check:fast` passes, gap ledger included

## Test plan
The new cards in c172.test.js against the flightModel (and JSBSim if the harness takes both).

## Out of scope
Structural failure or a break-up animation; an overspeed warning (0127 owns Vne/Vno/Vfe).
