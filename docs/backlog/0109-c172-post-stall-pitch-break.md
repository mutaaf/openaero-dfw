---
id: 0109
title: C172 post-stall pitch break from a cited source: full back stick should not hold α 40°
status: shipped
priority: P1
size: M
lens: authenticity
created: 2026-10-29
pr: 222
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
- [x] The source is cited in aircraft.js with its figure or table number (NASA CR-3097 Figs. A3/A21,
      CR-3201 Figs. A3/A15; the tables in src/pitchBreak.js)
- [x] Full back stick after the stall settles at an α the source supports (flight card: α 15-20°,
      measured 17.0°, JSBSim 16.8°; the tables alone balance at 16-18°, tests/unit/pitchBreak.test.js)
- [x] The stall-recovery cards, the hands-off and phugoid cards and the 0094 trim cards stay green

Moved to 0170 (measured: not the post-stall pitch, or not only it):
- (from 0144) Full aft stick held from Vr: peak pitch under ~20° while the wheels are under
      5 ft. Now flightModel.js 24.7° / 25.0° (flaps 0 / 10), JSBSim 20.0° / 21.7° (was ~37-42°).
- (from 0144) A 40-60% pull held from Vr to positive rate, then let go, climbs away at flaps
      10 on Vy's trim without a stall warning. Now no stall warning and α ≤ 17.5°, but still back
      on the runway (~57 KIAS at the release, trimmed for 74).

## Test plan
Promote the `it.fails` card (α ≤ 40°) or replace its bound with the cited value; tighten the 45° bound on both models.

## Out of scope
Spins, the F-16 and 737 post-stall.

## Shipped notes
Sources (open NASA contractor reports on NTRS, the Langley spin-tunnel rotary-balance series):
NASA CR-3097 (Bihrle & Hultberg 1979), high-wing model B (NACA 2412, AR 7.37, a Skyhawk-like
layout), static Cm at δe 0 and +23° to α 90°; NASA CR-3201 (Hultberg, Chu & Dickens 1980),
high-wing model C, the series' only up-elevator run (δe −15°). The up-elevator share is model C's
applied to the C172 (model B has no up-elevator run). The same tables are in public/jsbsim/c172.xml
(Cmde_up, Cmde_down, Cm_break). Not used: NASA TN D-6573 (a T-tail jet), Ananda & Selig 2016
(a low-wing model).
