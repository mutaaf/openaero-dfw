---
id: 0102
title: The Cessna's phugoid takes twice as long as theory says (33-56 s, theory 17-26 s)
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-10-28
pr:
---

## Why
Validator flight card (tests/flight/c172.test.js, "phugoid period", `it.fails`). Lanchester's
constant-energy phugoid, T = pi*sqrt(2)*V/g (Lanchester 1908; Etkin & Reid, Dynamics of Flight),
gives 17.5 / 21.0 / 25.6 s at 75 / 90 / 110 KIAS; drag lengthens a real phugoid by tens of
percent, not by a factor of two. flightModel.js (0090's static stability) measures 33 / 42 / 56 s
(1.9x / 2.0x / 2.2x), and the ratio grows with speed, so the speed-height exchange is
too sluggish (damping or the pitch restoring term too strong against it). The 0090
cards (returns to trim speed within 2 kt in 3 min) still pass: this is about how it oscillates,
not whether it settles. Caveat: the reference is the theory's bound, not a C172 flight-test
figure (the POH has none); a citable C172 phugoid measurement would tighten the card.

## What
Find which term lengthens the period (pitch damping vs trim-restoring moment vs ground
speed/lift coupling) and bring it to 1.0-1.6x Lanchester at 75, 90 and 110 KIAS without
moving the 0090 cards or the stall/climb/glide cards.

## Acceptance criteria
- [ ] The three phugoid cards flip from `it.fails` to `it`
- [ ] 0090 hands-off cards and `npm test -- tests/flight` stay green

## Test plan
`npm test -- tests/flight`; the measured period is logged per speed.

## Out of scope
Short-period mode; the F-16 and 737.
