---
id: 0166
title: 737 landing roll card: flaps 30, autobrake, dry runway, stops inside Boeing's published landing distance
status: shipped
priority: P2
size: M
lens: authenticity
created: 2026-11-09
pr: 217
---

## Why
The C172 has a POH landing-roll card (0051) and the 737 has climb, descent, cruise and
turn cards, but nothing checks the 737's stopping distance, the number a pilot actually
plans a landing with. If the brakes, spoilers or reversers are too weak or too strong the
Kid rollout and the RTO drill (0107) are quietly wrong. Boeing publishes landing field
length against weight in the 737 Airport Planning manual (D6-58325-6, section "Landing
runway length requirements") and the flight crew operating manual quick-reference tables
give dry-runway distances by autobrake setting; these are a cited, checkable target.
The Builder must read the figures (Boeing's airport-planning PDF, boeing.com/commercial/airports/plan_manuals)
and cite page, weight, flap setting and conditions in the test comment. If the PDF cannot be
read from the sandbox, take the next ticket and say so in the PR body.

## What
`tests/flight/b738.test.js`: a card that flies a stabilized 737-800 final (flaps 30, Vref at
the card weight, sea level, ISA, dry, no wind) from 50 ft over the threshold through
touchdown, spoilers, reversers and max manual or autobrake to a stop, and compares the
air plus ground distance to the published landing distance within a stated band (start
at +-12%). A mismatch ships as `it.fails` with `KNOWN GAP (NNNN)` against a new ticket
(per 0160), not a loosened band. Touches tests only unless the card shows a real gap.

## Acceptance criteria
- [x] The card cites the document, page, weight, flaps, and conditions in a comment
- [x] Distance is measured from the 50 ft point to a full stop, not from touchdown
- [x] A miss is filed as a ticket and the card is `it.fails` tagged with it
- [x] `npm run check:fast` passes, gap ledger included

## Test plan
The new card in b738.test.js; `node scripts/check-gaps.mjs` accepts it if marked.

## Shipped (#217)
The card already existed (0057); #217 tightened it to ±12%, added the MLW point, the weight
slope and a ground-spoiler assertion, and cited p. 3-51. It flies maximum manual braking with
no reverse, as the ACAP chart is made (14 CFR 25.125); autobrake and reversers are pinned to
the FCOM decelerations in tests/flight/b738-systems.test.js. Model: 3,200 ft vs 3,414 (65 t),
3,239 vs 3,480 (MLW).

## Out of scope
Wet and contaminated runways (0108), reverse-thrust sound, F-16 landing roll.
