---
id: 0204
title: 737 landing distance at flaps 40 and on autobrake against a cited Boeing chart
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-11-18
pr:
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
