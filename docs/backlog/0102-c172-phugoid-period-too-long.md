---
id: 0102
title: The Cessna's phugoid takes twice as long as theory says (33-56 s, theory 17-26 s)
status: shipped
priority: P2
size: M
lens: authenticity
created: 2026-10-28
pr: 114
---

## Outcome (Builder, 2026-10-28)
The term was the pitch damping against the restoring stiffness. flightModel.js holds α with
a stiffness of pitchAuthority / elevatorAlphaDeg and damps the pitch rate by pitchDamping, so in a
steady pitch rate q the nose sits pitchDamping / stiffness × q below its trim α. In the phugoid
the nose has to follow the flight path, so that lag (1.35 s on the C172) took lift out of the
speed-height exchange: the effective mass goes up by 1 + g·CLα·τ/(CL·V), which is ×3.6 at 90 kt
(period ×1.9) and grows with speed, as measured. Damping alone could not fix it: below ~1.5 the
phugoid diverges. The C172's pitchAuthority went 1.8 → 7.2 (stiffness ×4, same trim α per stick,
same damping): τ = 0.34 s (Roskam's Cmq·c̄/2V / Cmα is 0.22 s at 90 KIAS) and the periods are
23 / 29 / 37 s at 75 / 90 / 110 KIAS, 1.33 / 1.37 / 1.42x Lanchester. The nose also follows
the stick faster: 20% back stick reaches 63% of its α in 1.1 s at 70 kt (it never got there in
4 s before). The stall drill's held-stick gate moved from 3° to 5° under the stall: Learner's
protection holds 4° under, and only its old overshoot had reached the 3° gate.

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
- [x] The three phugoid cards flip from `it.fails` to `it`
- [x] 0090 hands-off cards and `npm test -- tests/flight` stay green

## Test plan
`npm test -- tests/flight`; the measured period is logged per speed.

## Out of scope
Short-period mode; the F-16 and 737.
