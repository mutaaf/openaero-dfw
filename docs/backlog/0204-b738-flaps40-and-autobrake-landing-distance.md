---
id: 0204
title: 737 landing distance at flaps 40 and on autobrake against a cited Boeing chart
status: shipped
priority: P2
size: M
lens: authenticity
created: 2026-11-18
pr: 299
---

## Why
0201 carded the 737's landing at DFW's 607 ft and at 2,000 ft against Boeing ACAP D6-58325-7
Rev C §3.4.3 p. 3-51. That page is flaps 30 with max manual braking only. The ticket also wanted
flaps 40 and autobrake 2 / MAX stop distances checked against Boeing, but no public Boeing
document read in that run has them. Today autobrake 2 is checked only against its own FCOM
deceleration (5 ft/s², kinematic ±15%; model 7,437 ft from 50 ft at DFW, 65 t).

## What
Find a public, citable source for the 737-800's landing distance at flaps 40 and/or on autobrake.
Candidates: Boeing's operational landing distance tables (QRH PI, "Normal configuration landing
distance"), if a public copy exists; the FCTM's autobrake section; an accident report that quotes
the tables (NTSB, AAIB, ATSB). Read the figure itself, not a search summary. Then add the cards to
tests/flight/b738.test.js beside 0201's.

## Acceptance criteria
- [ ] Each new card names its source document and page
- [ ] A card the model misses is an `it.fails` naming a ready ticket (check-gaps passes)
- [ ] No existing card changes tolerance

## Test plan
Headless flight cards in tests/flight/. No e2e change.

## Out of scope
Wet and contaminated runways (wetRunway.test.js).

## Builder notes (2026-11-21)
Source found and read: Boeing 737 FCOM Performance Inflight QRH, "Normal Configuration Landing Distances,
Flaps 40" (737-800WSFP1/CFM56-7B27, FAA, Category C/N brakes), reproduced as Table 1 on p. 19 of India's
Report on Accident to Air India Express B737-800 VT-AXV, Mangalore, 22 May 2010, §1.6.12.1
(skybrary.aero/sites/default/files/bookshelf/1680.pdf, PDF page 35, an image read at 200 dpi). Cards in
tests/flight/b738.test.js, no reverse (the REF + NO REV columns), 60 t, sea level, dry:

| Braking | QRH | Model | |
|---|---|---|---|
| Max manual | 2,820 ft | 2,845 ft | +0.9% |
| Autobrake MAX | 3,470 ft | 2,952 ft | -14.9%: KNOWN GAP (0215) |
| Autobrake 3 | 4,810 ft | 4,602 ft | -4.3% |
| Autobrake 2 | 6,310 ft | 6,111 ft | -3.2% |
| Autobrake 1 | 7,510 ft | 7,245 ft | -3.5% |

Slopes (±50%): autobrake 2 +5,000 kg +420 ft (QRH +410), +1,000 ft +150 (QRH +170); autobrake 3 +287
(+290), +102 (+120). At DFW (607 ft), 65 t: autobrake 2 6,628 ft (QRH 6,823), autobrake 3 4,956 (5,173).
