---
id: 0113
title: 737 cruise and ceiling cards: Mach at FL350 and the certified ceiling
status: ready
priority: P1
size: S
lens: authenticity
created: 2026-10-30
pr:
---

## Why
`tests/flight/b738.test.js` pins the 737's takeoff, landing, go-around and systems, but nothing
above 10,000 ft: no card says the jet cruises where a 737-800 cruises. The operator's focus is
"grow tests/flight (737 and F-16 cards with cited data)". Cruise Mach and the certified ceiling
are public, checkable numbers, and a player who climbs the jet to altitude should find it
behaving like one.

## What
Cards in `tests/flight/b738.test.js` (headless harness, no game code unless a card fails):
at ~65 t (the model mass the other cards use) in level flight at FL350, ISA, the thrust needed
for the published long-range cruise Mach (~0.78-0.79) is within the engines' available thrust
at that altitude, with the margin stated; the jet cannot hold level flight above the certified
maximum altitude (41,000 ft) at that mass, or if it can, the card is `it.fails` with a ticket.
Read the exact Mmo and maximum operating altitude from the FAA type certificate data sheet
A16WE (a copy: https://www.caat.or.th/wp-content/uploads/2016/04/TC-B737-800.pdf; the FAA's
own is in its Regulatory and Guidance Library); cite the page in the card. If a figure is not
stated there, do not invent it: card only what is cited. A card the model misses is a KNOWN GAP
`it.fails` with a new ticket (engine.js turbofan Mach/density lapse is the likely cause).

## Acceptance criteria
- [ ] At least two new cards (cruise Mach thrust margin at FL350; ceiling) each citing its source and page
- [ ] Any miss is an `it.fails` with its ticket id, never a loosened bound
- [ ] `npm test` green; existing cards unchanged

## Test plan
`tests/flight/b738.test.js` additions only; `npm run check:fast`.

## Out of scope
Fuel burn and range, climb schedules, RVSM, any change to engine.js beyond what a failing card needs (that is its own ticket).
