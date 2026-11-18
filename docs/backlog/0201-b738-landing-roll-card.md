---
id: 0201
title: 737 landing-roll flight card: max manual braking stops within Boeing's dry-runway landing distance at DFW and 2,000 ft; autobrake ordered
status: shipped
priority: P2
size: M
lens: authenticity
created: 2026-11-18
pr: 286
---

## Why
`tests/flight/b738.test.js` cards the 737's airborne distance (50 ft to touchdown, ACAP §3.4.3) but not what happens after the wheels touch: the stop. Every card for the ground roll today is the Cessna's (0051) or the rejected takeoff (0107). A pilot expects a 65 t 737 on a dry runway at Vref to stop in roughly 4,000-5,000 ft from the 50 ft point with max manual braking, and noticeably longer on autobrake 2. Source: Boeing "737 Airplane Characteristics for Airport Planning" (D6-58325-6), §3.4 landing runway length charts; and the FCTM autobrake section. Pillar 0: physics you can check.

## What
Add a describe block to `tests/flight/b738.test.js` (and harness.js helper if needed) flying the 737 at 65 t, flaps 30/40, sea level and DFW field elevation, dry runway, no wind: touch down at Vref, spoilers and reversers as the game models them, then (a) max manual braking and (b) autobrake 2 and MAX. Assert the stop distance from the touchdown point and from 50 ft against the ACAP landing chart (±15%) and that MAX stops shorter than 2. Gaps found become `it.fails` cards with a new ticket tag (check-gaps.mjs). Only touch `src/` if a card needs a one-line fix; otherwise ticket the gap.

## Acceptance criteria
- [x] At least 3 new cards with the ACAP page cited in each name
- [x] (none failed) A failing card is an `it.fails` with a ticket that exists and is ready (check-gaps passes)
- [x] `npm test` and `node scripts/check-gaps.mjs` pass; no existing card changes tolerance

## Test plan
The cards themselves (headless, `tests/flight/`). No e2e change.

## Out of scope
Wet or contaminated runways (wetRunway.test.js), thrust reverser animation, brake fade.

## Builder notes (2026-11-18): scope as shipped
The acceptance boxes above were written before the source was read; flaps 40 and autobrake
distances against the ACAP are not possible (see below). Shipped instead:
Read ACAP D6-58325-7 Rev C §3.4.3 p. 3-51 at 300 dpi before writing the cards. That page is
flaps 30 only, max manual braking (the FAR landing field length, ÷ 0.6 for the airplane's
distance), and has no autobrake or flaps 40 curves; no other public Boeing chart gives autobrake
landing distances. So the shipped cards are what the page does show:
- dry, 65 t, at DFW (607 ft, interpolated between the sea-level 5,690 ft and 2,000 ft 5,965 ft
  curves): 0.6 × 5,775 ≈ 3,465 ft; the model 3,243 ft (−6%).
- dry, 2,000 ft, 65 t (3,580 ft; model 3,324) and MLW (3,645 ft; model 3,369).
- the altitude slope: 2,000 ft adds ~165 ft (model +116, inside ±50%).
- autobrake (FCOM decelerations, aircraft.js): autobrake 2 stops well past the ACAP distance
  (model 7,437 ft vs 3,465), MAX between it and the pedals (3,405 vs 3,243).
Flaps 40 and any autobrake distance target need a cited chart (Boeing QRH/FCOM PI landing
distance tables are not public): filed as 0204 (proposed). The new cards also check the ground
spoilers are out within 2 s and still out at 80 kt, and that each autobrake setting engaged. The model stops 6-8% short of every dry
point (sea level and 2,000 ft alike): inside ±12%, consistent, worth a look if a source for the
737's rolling/braking μ turns up.
