---
id: 0136
title: F-16 fly-by-wire limits a push too (negative g and AoA), and a slow pull can still depart
status: proposed
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
at 150 kt does the same. Slow, a held full pull can still pass the 28° stall: idle from ~145 kt
down to 84 kt peaks α 32.8°, gear and flaps at 87 kt 29°, a zoom to a tail slide 90°. (TP-1538's
conclusions note the real control laws could not prevent departures at very low airspeed either.)
A pilot should not be able to tumble a Viper by pushing.

## What
Find a cited negative-g command limit and negative-AoA limit for the F-16's flight control system
(TP-1538 App. A or Fig. 62, Stevens & Lewis, or a NASA/USAF source), and apply it to a push in
`src/fbw.js` the way 0121 applies Fig. 63 to a pull. Decide from the source whether the low-speed
departure is a gap to close or the airplane's real behaviour, and card it either way.

## Acceptance criteria
- [ ] A card: full forward stick at 434 KEAS, 15,000 ft stays within the cited negative-g limit and
      α never passes the cited negative AoA limit
- [ ] A card for the slow, idle full pull (pass, or `it.fails` with the measured α and why)
- [ ] Every 0121 and 0118 card still passes; released-stick behaviour (0090) unchanged

## Test plan
Flight cards in `tests/flight/f16.test.js` beside 0121's.

## Out of scope
Rolling g limits, spins, the CAT III store limiter.
