---
id: 0159
title: 737 and F-16 accelerated-stall cards: stall speed rises with the square root of load factor
status: shipped
priority: P2
size: S
lens: authenticity
created: 2026-11-05
pr: 198
---

## Why
Pillar 0. Only the C172 has the bank-angle stall card (0067). The 737 and F-16 are flown through banked turns on every approach, yet nothing checks their wings stall higher in a bank. Stall speed scales with sqrt(load factor): 45° bank is +19%, 60° bank is +41% (FAA-H-8083-3C ch. 5 "Load Factor and Stalling Speed", https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/airplane_handbook). The sim's lift is CL·q·S, so this should pass; it is a cheap net for any later CLmax or limiter edit (the F-16's AoA limiter, 0121, could mask it, so measure where the limiter lets go).

## What
Reuse `stallInTurn(spec, bankDeg, stallAoa, opts)` from `tests/flight/harness.js` in `b738.test.js` (flaps 30, Vref region, 3,000 ft) and `f16.test.js` (clean, 15,000 ft). Add one `it` per airframe at 45° and 60°. No `src/` change unless a card fails: then `it.fails` with the measured number and a ticket.

## Acceptance criteria
- [x] 737 flaps 30: stall CAS at 45° and 60° bank is within ±8% of the 1-g stall × sqrt(1/cos bank)
- [x] F-16 clean: the same, measured at the AoA limiter's break, or a KNOWN GAP with a ticket
- [x] Each card fails when CLmax is mutated by 10% (proved in the PR body)

## Test plan
Two cards per airframe in the existing flight test files, flown headless at 1/60 s.

## Out of scope
Spin entry, post-stall behaviour, JSBSim comparison for the 737/F-16.

## Shipped
- tests/flight/stallTurnCard.js checkStallInTurn: harness.js stallInTurn (the C172's 0067 pilot) to the break wings level
  and at 45°/60°; checks the flown turn, then the book (1-g × √(1/cos φ), ±8%), the √n law with the flown load factors
  (±3%), and the spec's straight lift line carrying the wing's share of the load (harness `nWing`: load less T·sin α, ±3%).
- 737 flaps 30, 3,000 ft, break at its 14.12° stall: 120.7 KEAS wings level; 142.5 at 45° (book −0.8%), 168.5 at 60°
  (book −1.3%); lift line within 0.1%.
- F-16 clean, 15,000 ft: the limiter (0121) keeps α under the 28° stall and binds early in a turn (flown to 24° the 60°
  turn sagged to 1.67 g and read −9%), so the break is 20° α, under Fig. 63's 20.4° knee: 132.6 KEAS at 1 g; 154.7 at 45°
  (book −1.9%), 182.1 at 60° (book −2.9%); lift line within 0.2%.
- Mutation: the lift model's CL × 0.9 and × 1.1 (aero.js liftCoefficient) fail all four cards on the lift-line check
  (+5.3% / −4.8%); the two ratio checks cannot see a uniform lift error, which is why the third exists.
