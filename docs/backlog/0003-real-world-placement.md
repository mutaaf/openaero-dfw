---
id: 0003
title: Put Love Field, downtown Dallas and AT&T Stadium where they really are
status: ready
priority: P1
size: M
lens: authenticity
created: 2026-10-16
pr:
---

## Why
The world is anchored on real coordinates (`DFW_ORIGIN_LAT/LON`) and the imagery is real,
but landmarks were hand-placed in sim metres and are several km off. Converting the real
coordinates with `latLonToSimMeters` (approximate, verify before use):

| Landmark | In the sim (x, z) | Real (x, z) |
|---|---|---|
| KDAL Love Field | 13200, 4200 | ≈17600, 5900 |
| Downtown (Bank of America Plaza) | 17600, 9800 | ≈22300, 13400 |
| AT&T Stadium | −2400, 9600 | ≈−5100, 17000 |

So the 3D towers float over the wrong neighbourhood and the KDAL 31R approach doesn't line
up with the KDAL in the photo. A pilot notices this immediately.

## What
- Add a `LANDMARKS` table in `src/runways.js` (rename the module `world.js` if it reads
  better) defined by **lat/lon** from an authoritative public source (FAA airport data for
  runway thresholds and headings; OpenStreetMap / Wikipedia coordinates for buildings),
  converted with `latLonToSimMeters`. Cite each source in a comment.
- Derive KDAL 13R/31L (and fix the `KDAL_31R` naming if the real runway is 31L) from FAA
  threshold coordinates and true headings, not hand-tuned numbers.
- Update the `kdal_31r_final`, `downtown_skyline` and `att_stadium` scenario start points
  and the radar so they follow the table.

## Acceptance criteria
- [ ] Every landmark and runway position is computed from lat/lon with a cited source
- [ ] Unit test: each landmark's sim position round-trips to within 50 m of its lat/lon
- [ ] Screenshot: the Love Field approach shows the 3D runway over the runway in the imagery
- [ ] The radar shows Love Field and downtown in their new positions

## Test plan
Unit tests in `tests/unit/world.test.js` for the table; an e2e screenshot of the KDAL
approach checked by eye in the PR.

## Out of scope
Adding new airports (KADS, KAFW, KFTW) is a follow-up ticket once this table exists.
