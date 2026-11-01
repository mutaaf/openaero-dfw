---
id: 0124
title: Alliance's runway ends match their published lengths (and short runways get a 400 ft aim point)
status: ready
priority: P1
size: S
lens: authenticity
created: 2026-10-31
pr:
---

## Why
The runway drawn and graded at Fort Worth Alliance is shorter than the chart says. The
surveyed end coordinates in `src/airports.js` put KAFW 16L/34R 2,936 m apart and 16R/34L
2,529 m apart, but the same rows say 11,000 ft (3,353 m) and 11,125 ft (3,391 m). Every other
runway agrees within 15 m. The 3D runway, the grade's "off the runway" check and the results
card's runway strip (0088) use the end-to-end distance. The start screen's facts line and the
dead-stick miss check use `lengthFt`. So on KAFW the card's far end is up to 860 m short of
the chart. Found by the 0088 physics panel.

Also: AIM Table 2-3-1 puts the aiming point marking at 400 ft (not 1,000 ft) on a runway with
under 4,200 ft available for landing. KFTW 17/35 (4,005 ft) is the only such runway here.
main.js paints the blocks and the 3° path aims at `AIM_POINT_M` (305 m) on every runway.

## What
- Re-check KAFW's end lat/lon (both runways) against the current FAA airport diagram or
  OurAirports, and correct the ends or the lengths so they agree.
- Optional: a per-runway aim point (400 ft under 4,200 ft LDA) for the markings, the PAPI and
  the glidepath, with the PAPI's real position if it is published.

## Acceptance criteria
- [ ] A unit test asserts every runway's end-to-end distance is within 30 m of `lengthFt`
- [ ] KAFW's runways draw and grade at their published length

## Test plan
tests/unit/airports.test.js: for every RUNWAY_DATA row, the haversine distance between its
ends is within 30 m of `lengthFt` (fails today on both KAFW rows).

## Out of scope
New airports or runways.
