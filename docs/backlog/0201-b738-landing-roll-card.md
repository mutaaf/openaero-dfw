---
id: 0201
title: 737 landing-roll flight card: autobrake and max manual braking stop within Boeing's dry-runway landing distance
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-11-18
pr:
---

## Why
`tests/flight/b738.test.js` cards the 737's airborne distance (50 ft to touchdown, ACAP §3.4.3) but not what happens after the wheels touch: the stop. Every card for the ground roll today is the Cessna's (0051) or the rejected takeoff (0107). A pilot expects a 65 t 737 on a dry runway at Vref to stop in roughly 4,000-5,000 ft from the 50 ft point with max manual braking, and noticeably longer on autobrake 2. Source: Boeing "737 Airplane Characteristics for Airport Planning" (D6-58325-6), §3.4 landing runway length charts; and the FCTM autobrake section. Pillar 0: physics you can check.

## What
Add a describe block to `tests/flight/b738.test.js` (and harness.js helper if needed) flying the 737 at 65 t, flaps 30/40, sea level and DFW field elevation, dry runway, no wind: touch down at Vref, spoilers and reversers as the game models them, then (a) max manual braking and (b) autobrake 2 and MAX. Assert the stop distance from the touchdown point and from 50 ft against the ACAP landing chart (±15%) and that MAX stops shorter than 2. Gaps found become `it.fails` cards with a new ticket tag (check-gaps.mjs). Only touch `src/` if a card needs a one-line fix; otherwise ticket the gap.

## Acceptance criteria
- [ ] At least 3 new cards with the ACAP page cited in each name
- [ ] A failing card is an `it.fails` with a ticket that exists and is ready (check-gaps passes)
- [ ] `npm test` and `node scripts/check-gaps.mjs` pass; no existing card changes tolerance

## Test plan
The cards themselves (headless, `tests/flight/`). No e2e change.

## Out of scope
Wet or contaminated runways (wetRunway.test.js), thrust reverser animation, brake fade.
