---
id: 0010
title: Put Dallas landmarks at their true coordinates
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-10-16
pr:
---

## Why
Reunion Tower, Bank of America Plaza, the Margaret Hunt Hill Bridge and AT&T Stadium are
hand-placed 4–7 km from where the satellite photo shows them. Flying the skyline mission
should put you next to the real buildings.

## What
A `LANDMARKS` table in `src/landmarks.js` with lat/lon (cite a public source per entry),
real heights, converted through `geo.js`; the buildings and the moving-map "DALLAS" dot
use it. Skyline and AT&T missions spawn relative to the real positions.

## Acceptance criteria
- [ ] Unit test: each landmark's sim position matches its lat/lon via geo.js within 10 m
- [ ] e2e: the skyline mission loads with downtown ahead (within ±15° of the nose)

## Test plan
Vitest for the table; a mission e2e assertion on bearing to downtown.

## Out of scope
Photogrammetry or detailed building models.
