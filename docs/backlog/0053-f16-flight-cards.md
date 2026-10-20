---
id: 0053
title: F-16C flight test cards against public USAF and manufacturer figures
status: proposed
priority: P2
size: M
lens: authenticity
created: 2026-10-20
pr:
---

## Why
The F-16 has no test cards at all, so nothing says its numbers are right. The restricted
flight manual (T.O. 1F-16CM-1) is not open data, so cards may only use figures that are
published openly: the USAF fact sheet (https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104505/f-16-fighting-falcon/)
gives thrust class (about 29,000 lbf with the F110/F100), speed (Mach 2 class), ceiling above
50,000 ft, wingspan 32 ft 8 in, wing area 300 ft² and empty weight; Lockheed Martin's F-16
datasheet repeats them. Anything not openly sourced stays out; an uncited card is worse than none.
In the session sandbox a search found only game wikis and forum posts for climb, roll and stall,
so do not use those.

## What
New `tests/flight/f16.test.js` on the existing harness: (a) geometry in `aircraft.js` matches
the fact-sheet span and area; (b) static thrust-to-weight at the spec's clean mass is within
published bounds (thrust class / loaded weight); (c) the model can exceed Mach 1.2 and 40,000 ft
in a clean zoom without NaN or stall (a capability bound, honestly labelled as such, not a
performance claim); (d) low-speed: documented as a known gap with `it.fails` if the model's
`stallCleanKts: 120` cannot be tied to an open source. Write down in the file header what the
open data does not cover.

## Acceptance criteria
- [ ] Every assertion cites a URL in a comment; no figure comes from a game wiki or forum
- [ ] Missing open data is listed in the file header as a gap, not guessed
- [ ] `npm test -- tests/flight` green

## Test plan
The cards are the test.

## Out of scope
Changing F-16 aerodynamics, flight-control-system (g-limiter) modelling.
