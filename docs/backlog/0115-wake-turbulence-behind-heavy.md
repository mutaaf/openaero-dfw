---
id: 0115
title: Land past the heavy's touchdown point: a wake-turbulence lesson on the parallel final
status: proposed
priority: P2
size: M
lens: content
created: 2026-10-30
pr:
---

## Why
Every DFW pilot is taught to stay at or above the larger aircraft's flight path and land past
its touchdown point (FAA AC 90-23G, wake turbulence: https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_90-23G.pdf;
the same procedure is in AIM 7-4-5, https://www.angleofattack.com/aim/chapter-7/7-4-5/).
A mission that teaches it with the jet from 0080 in front of you is real procedure, not a gimmick.
Depends on 0080 shipping (the ambient jet); promote when it has.

## What
A lazy-chunk drill like `goAround.js`: the C172 on a 5 NM final behind 0080's jet on the same
runway; the coach says stay above its path and name its touchdown point once it lands; grade
the touchdown beyond that point and the glidepath at or above the jet's. No simulated vortex
force in v1 (a graded procedure, not a wake model; say so on the card).

## Acceptance criteria
- [ ] Touching down short of the jet's touchdown point, or flying below its path inside 2 NM, is capped C with the reason on the card
- [ ] Touchdown past the point on or above the path grades normally
- [ ] Coach words are in the lazy chunk (boot budget), readable at 568x320

## Test plan
Pure state-machine unit tests (above/below path, short/long touchdown), headless flight card with the traffic jet; one e2e flow.

## Out of scope
Vortex physics, departures behind a heavy, crossing runways.
