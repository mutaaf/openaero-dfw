---
id: 0006
title: Stream sharper satellite tiles near the aircraft
status: proposed
priority: P2
size: L
lens: performance
created: 2026-10-16
pr:
---

## Why
`buildSatelliteTerrain` requests all 81 zoom-13 tiles (~4 km each, 256 px) at boot. On
final at 1,000 ft the ground is blurry (~15 m per pixel), and on the takeoff roll it's
mush. Meanwhile tiles 15 km away get the same resolution as the one under the wheels, and
nothing is ever disposed.

## What
A simple quadtree/ring LOD in a new `src/terrain.js`: keep the z13 grid as the base layer,
then load z15–z16 tiles in a small ring around the aircraft (and always around the active
runway), swapping as the aircraft moves. Cap concurrent requests, cache by tile key, and
`dispose()` textures and geometries that fall out of range. Pick anisotropy from
`renderer.capabilities.getMaxAnisotropy()`.

## Acceptance criteria
- [ ] Ground under the aircraft on the 35C approach is visibly sharper (screenshot)
- [ ] Number of live textures stays bounded during a 2-minute flight (exposed for tests via `renderer.info.memory.textures`)
- [ ] No frame-time regression (e2e perf probe within budget)
- [ ] Still only `server.arcgisonline.com` requested

## Test plan
Unit tests for the tile-selection function (given position and altitude → set of tile
keys). An e2e test that flies the approach for ~20 s with tiles stubbed and asserts the
texture count stays under a cap.

## Out of scope
Elevation/terrain height data, 3D buildings from imagery.
