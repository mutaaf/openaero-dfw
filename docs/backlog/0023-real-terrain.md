---
id: 0023
title: Real 3D terrain with streamed, sharp satellite imagery
status: shipped
priority: P0
size: L
lens: authenticity
created: 2026-10-17
pr: 17
---

## Why
Operator request: "the openaero map needs to be real satellite and 3d". The world was a flat
y = 0 plane with two fixed rings of 19–38 m/px imagery: blurry under the aircraft, no
terrain, and every airport at DFW's elevation (Love Field is really 120 ft lower, Alliance
up to 117 ft higher), so the 3° path and the PAPI were wrong everywhere but DFW.

## What
- `src/terrain.js`: real ground height. A baked 100 m DEM of the metroplex
  (`scripts/bake-terrain.mjs`, AWS Terrain Tiles / USGS 3DEP, 316 kB) plus every runway
  flattened onto the plane through its surveyed end elevations, blended into the terrain.
- Physics, AGL, MSL, ground contact, ground effect, wind shear, autoland flare, PAPIs,
  approach geometry and spawns all use the real ground (`sim.groundY`, `end.thrY`).
- `src/tileTree.js` + `src/terrainLod.js`: quadtree-streamed Esri imagery (z10 → z16,
  ~2 m/px under the aircraft) draped on the terrain, with skirts, hillshade, an LRU cache.
- Elevation attribution next to the imagery credit.

## Acceptance criteria
- [x] Runways at KDFW/KDAL/KAFW sit at their surveyed elevations; MSL reads correctly
- [x] The DEM loads and the imagery is ≥ z15 near the aircraft on a final
- [x] Takeoff roll rests on its gear on a sloped runway
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse
- [x] No frame-time regression beyond the e2e guard; all existing e2e green

## Test plan
Unit: `terrain.test.js` (codec, sampling, ground model, baked DEM vs all 30 surveyed runway
ends), `tileTree.test.js` (LOD selection, exact coverage, fallback), `airports.test.js`
(threshold heights). E2E: `terrain.spec.js` (DEM + LOD, field elevations, resting on gear).

## Out of scope
Photoreal Google 3D tiles (next ticket), 3D buildings, offline tile cache.
