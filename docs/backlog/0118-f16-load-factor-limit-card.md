---
id: 0118
title: F-16 card: a full pull reaches but does not exceed the 9 g limit
status: shipped
priority: P2
size: S
lens: authenticity
created: 2026-10-30
pr: 133
---

## Why
Pillar 0: every flight-model claim gets a card. The F-16 cards cover geometry, thrust and CL, but
none says what the airplane does at the end of a hard pull. The USAF fact sheet and Lockheed Martin
give the F-16C a 9 g design limit
(https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104505/f-16-fighting-falcon/);
the fly-by-wire flight control system limits load factor to it. A kid pulling full back at 400 kt
should feel a hard, bounded pull, not 14 g or a gentle 4 g.

## What
Add cards to `tests/flight/f16.test.js`: at ~15,000 ft, 450 KCAS, wings level, stick full back, the
peak load factor over 5 s is within 7.5-9.5 g (the FBW holds ~9 g; allow a transient to 9.5);
and at 150 KCAS the same pull is AoA-limited (steady load factor well under 9 g). If the model
exceeds 9.5 g or never reaches 7.5, file the gap as an `it.fails` card plus a new ticket
(do not tune the model in this PR unless it is a one-line fix with a cited source).

## Acceptance criteria
- [x] A card asserts the 450 KCAS peak load factor against the cited 9 g
- [x] A card asserts the low-speed pull is AoA-limited, with the 25° AoA cited from TP-1538 as in 0066
- [x] Any mismatch is an `it.fails` card + ticket, not a loosened bound
- [x] `npm run test` and the flight cards stay green

## Test plan
Flight cards flown with `tests/flight/harness.js` using the existing F-16 spec; assert load factor
from the accelerometer-equivalent in the harness (add a small helper if absent).

## Out of scope
Rolling g, departures, 3D structural effects, blackout visuals.

## Result (2026-10-30)
The model reaches a hard pull (≥ 7.5 g, a passing card) but has no g or AoA limiter: ~14 g at
450 kt and α 90° at 150 kt. Both are `KNOWN GAP (0121)` cards; the limiter is ticket 0121.
