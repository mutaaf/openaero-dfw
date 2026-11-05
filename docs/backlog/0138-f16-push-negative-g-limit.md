---
id: 0138
title: F-16 fly-by-wire limits a push too (negative g and AoA)
status: shipped
priority: P2
size: M
lens: authenticity
created: 2026-11-03
pr:
---

## Why
Found by 0121's physics panel. 0121 limits a pull to TP-1538 Fig. 63 (9 g, 1 g at ~25° AoA), but the
figure covers positive g only, so a push is still the raw stabilator: full forward stick at 434
KEAS, 15,000 ft pulls about −11.5 g and α runs to −90° (the nose goes over); an inverted full push
at 150 kt does the same. A pilot should not be able to tumble a Viper by pushing. (A held slow
pull stays under ~27° since 0121's panel fix; a zoom to a tail slide can still reach α 90°, which
TP-1538's conclusions say the real control laws could not prevent at very low airspeed either.)

## What
Find a cited negative-g command limit and negative-AoA limit for the F-16's flight control system
(TP-1538 App. A or Fig. 62, Stevens & Lewis, or a NASA/USAF source), and apply it to a push in
`src/fbw.js` the way 0121 applies Fig. 63 to a pull.

## Acceptance criteria
- [ ] A card: full forward stick at 434 KEAS, 15,000 ft stays within the cited negative-g limit and
      α never passes the cited negative AoA limit
- [ ] Every 0121 and 0118 card still passes; released-stick behaviour (0090) unchanged

## Test plan
Flight cards in `tests/flight/f16.test.js` beside 0121's.

## Out of scope
Rolling g limits, spins, the CAT III store limiter.
