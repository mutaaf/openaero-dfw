---
id: 0215
title: The 737's autobrake MAX stops ~15% short of Boeing's QRH flaps 40 distance
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-11-21
pr:
---

## Why
0204 carded the 737's landing against Boeing's QRH "Normal Configuration Landing Distances, Flaps 40"
table (737-800WSFP1/CFM56-7B27), reproduced as Table 1 on p. 19 of India's VT-AXV Mangalore accident
report (skybrary.aero/sites/default/files/bookshelf/1680.pdf, PDF page 35). Max manual braking and autobrake
1, 2 and 3 land within 1-5% of it (no reverse, 60 t, sea level). Autobrake MAX does not: the QRH gives
3,470 ft from 50 ft (its NO REV adjustment is 0), the model stops in ~2,950 ft. Its flat 14 ft/s²
(aircraft.js systems.autobrake) brakes almost as hard as full pedals (2,845 ft; QRH 2,820), where the QRH's
MAX averages ~10 ft/s² over the roll. Forum copies of the FCOM say MAX is 14 ft/s² above 80 kt and 12 below,
which would close only ~100 ft. Autobrake 1-3 also land 3-5% short, all the same way, while the model's air
distance (~1,100 ft) is longer than the QRH's 1,000: the ground roll is short everywhere, so the first suspect
is the brakes' onset (systems.js starts the autobrake's integrator at 0.3, or 1 for MAX, at touchdown, with a
0.3 s pressure lag; Boeing's figures include a ramp-up).

## What
Find what the QRH's MAX AUTO assumes (the autobrake's pressure ramp-up, a lower deceleration target, the
3,000 psi MAX pressure limit, or a later brake onset) from a source read in full: Boeing's FCOM 14.20 autobrake
description, an FCTM landing section, or an accident report (NTSB, AAIB, ATSB, DGCA) that quotes the
deceleration schedule. Change systems.js / aircraft.js to match, so the KNOWN GAP (0215) card in
tests/flight/b738.test.js passes and is promoted to `it`. On a real 737 NG, RTO is its own selector position
at full pressure, separate from MAX, and tests/flight/rto.test.js uses autobrake 4 (MAX) as its RTO stop: split
RTO from MAX (a systems.js position or an RTO flag at full pressure) so softening MAX does not lengthen the RTO.
If no source is found, write that in a Builder note and send the ticket back to proposed: do not tune the
model to the number.

## Acceptance criteria
- [ ] The 0215 card passes (flaps 40, 60 t, sea level, MAX, no reverse: 3,470 ft ±5%) and becomes `it`
- [ ] The other QRH flaps 40 cards, the ACAP cards and the RTO cards (rto.test.js uses MAX/RTO braking) stay green
- [ ] The source and page are named in aircraft.js's comment

## Test plan
tests/flight/b738.test.js (QRH flaps 40 cards), tests/flight/rto.test.js, tests/flight/b738-systems.test.js.

## Out of scope
Reverse thrust credit; wet or contaminated runways (the same QRH table's braking-action rows).
