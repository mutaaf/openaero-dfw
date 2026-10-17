---
id: 0024
title: Google Photorealistic 3D Tiles over the metroplex
status: shipped
priority: P0
size: L
lens: authenticity
created: 2026-10-17
pr: 18
---

## Why
Operator request: "the openaero map needs to be real satellite and 3d"; the operator chose
Google Photorealistic 3D Tiles (Google Earth's mesh: real buildings, stadiums, trees) with
the free terrain (#0023) as the fallback, inside a hard 32-roots/day quota.

## What
- `src/photoreal.js`: lazy 3d-tiles-renderer + Draco; every tile's vertices remapped
  ECEF → sim through the runways' own lat/lon mapping (exact across the metroplex, no
  curvature error); vertical calibration against the nearest runway threshold; Google
  logo + data attributions; our imagery, runway surfaces and stand-in landmarks hidden
  under it (PAPIs stay).
- `src/googleSession.js`: one root per page, started only when the player starts flying;
  mission changes reuse it; 403/429 → free terrain, remembered (quota: until midnight
  Pacific); memory-only session (Google's no-caching policy); usage counters.
- `src/ecef.js`: WGS84 + GEOID18 plane fit.

## Acceptance criteria
- [x] With a key on mutaafaziz.com, the photoreal mesh streams and lines up with the runways
- [x] Nothing billable before "start flying"; one root per page; mission changes reuse it
- [x] 403/429 fall back to the free terrain without our own console errors, and back off
- [x] No key / other origins: no Google requests at all
- [x] Works at 390x844 and 1280x720

## Test plan
Unit: `ecef.test.js` (round-trips, all 30 thresholds land on the runways at their surveyed
height), `googleSession.test.js` (once per page, no content stored, back-off). E2E:
`photoreal.spec.js` with a stubbed root + a generated glTF tile placed in ECEF at KDFW.

## Out of scope
Persisting sessions across reloads (not allowed by the policy), shadows, night lighting of
the photoreal mesh.
