---
id: 0109
title: C172 post-stall pitch break from a cited source: full back stick should not hold α 40°
status: proposed
priority: P2
size: M
lens: authenticity
created: 2026-10-29
pr:
---

## Why
Found shipping 0094. With the stick held full back at idle after a stall, both flightModel.js
and our JSBSim C172 settle at α ~40-42° (tests/flight/c172.test.js, "full back stick after the
stall"; the flightModel.js `it.fails` card is this ticket's). Both use Roskam's linear Cmα (-0.89) and Cmδe (-1.28) to any
angle, so full up elevator is worth 36.7° of α past the trim. A real airplane's pitching
moment is not linear past the stall (the tail's own lift and the wing's downwash change), so a
deep 40° settle is probably too deep, but how deep a 172 goes needs a source. JSBSim here
cannot check it because it flies the same linear data.

## What
Find an open, citable post-stall pitching moment for a high-wing light airplane (NASA
wind-tunnel or flight-test reports on NTRS are the likely source; not a game wiki and not
GPL data without the operator). Give flightModel.js a Cm(α) past the stall (or an elevator
effectiveness that falls with tail α) from it, and the same in public/jsbsim/ if it applies.

## Acceptance criteria
- [ ] The source is cited in aircraft.js with its figure or table number
- [ ] Full back stick after the stall settles at an α the source supports (flight card)
- [ ] The stall-recovery cards, the hands-off and phugoid cards and the 0094 trim cards stay green

## Test plan
Promote the `it.fails` card (α ≤ 40°) or replace its bound with the cited value; tighten the 45° bound on both models.

## Out of scope
Spins, the F-16 and 737 post-stall.
