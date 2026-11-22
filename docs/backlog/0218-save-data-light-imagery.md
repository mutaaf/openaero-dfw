---
id: 0218
title: Honour Save-Data and slow connections: fewer imagery tiles, no photoreal, and say so
status: ready
priority: P2
size: S
lens: performance
created: 2026-11-22
pr:
---

## Why
Pillar 1 says it must run on a phone, often on cellular. The sim streams Esri imagery tiles and, on mutaafaziz.com,
Google 3D Tiles. Nothing in `src/` reads `navigator.connection.saveData` or `effectiveType` (grep: no matches), so a player who turned on
Data Saver or is on 2G still pulls the full tile budget. MDN: https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/saveData
(Chromium-only API; Safari has none, so this must be a progressive enhancement and the default stays unchanged).

## What
A tiny pure helper `lightConnection(nav)` returning true when `saveData` is on or `effectiveType` is `slow-2g`/`2g`.
When true: terrainLod.js lowers its finest zoom by one level and its in-flight tile queue depth, photoreal stays off
(the start screen says "Data saver is on: lighter imagery"), and the player can turn the lighter mode off from Options.
No new host, no storage beyond an `openaero_` key with `v: 1` if the override is remembered.

## Acceptance criteria
- [ ] Unit: `lightConnection` for saveData true, 2g, 4g, undefined `connection`, and a throwing getter
- [ ] e2e with `navigator.connection` stubbed to saveData: fewer tile requests than the unstubbed run over the same 20 s, and the message shows
- [ ] Without the API nothing changes (existing e2e unchanged); boot JS budget unchanged

## Test plan
tests/unit/lightConnection.test.js; one Playwright spec counting `server.arcgisonline.com` requests with a stubbed connection.

## Out of scope
Measuring real bandwidth, a service worker or caching of tiles.
