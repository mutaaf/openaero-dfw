---
id: 0209
title: C172 card: stall speed scales with the square root of weight (and the fuel burn lightens it)
status: ready
priority: P1
size: S
lens: authenticity
created: 2026-11-19
pr:
---

## Why
Pillar 0 (physics you can check). The Va card (0167) flies the weight, and the accelerated-stall card flies load
factor, but no card says the simplest thing every pilot is taught: stall speed rises with the square root of weight
(FAA PHAK ch. 5 / AFH "Weight": Vs2 = Vs1 * sqrt(W2/W1)). The model has a fuel gauge (0162) that lightens the
airplane, so a card also proves a flight with half the fuel stalls slower, and that the 1-g flaps-up stall at gross
still lands on the POH's 51 KCAS. Source: https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/phak
(Aerodynamics of Flight, "Stalls" / load factor) and the C172S POH Section 5 stall table (gross weight only).

## What
`tests/flight/c172.test.js` (both models, like the Va card): fly the same slow deceleration at 1,800 / 2,200 /
2,550 lb (`atLb`), measure the stall speed from the first stall break, assert each is the gross POH value times
sqrt(W/2550) within +-4%, and that the ratio 1,800 : 2,550 lands in 0.82-0.88 (sqrt = 0.84). One mutation guard:
a spec with `massKg` doubled fails the card. No `src/` change is expected; if a model is off, file the gap as an
`it.fails` with a ticket and a `scripts/check-gaps.mjs` entry instead of tuning to the card.

## Acceptance criteria
- [ ] Three weights x two models give stall speeds inside +-4% of sqrt scaling from the POH gross value
- [ ] The mutation guard (wrong mass) fails the card
- [ ] `npm run check:fast` and the flight suite green; no change to any existing card

## Test plan
Unit only (`npm run test:flight`); no e2e needed.

## Out of scope
CG position, ice, or a weight-and-balance UI.
