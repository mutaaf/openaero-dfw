---
id: 0210
title: Respect Save-Data and slow connections: fewer satellite tiles and no 3D-tile stream on a metered phone
status: ready
priority: P2
size: S
lens: performance
created: 2026-11-19
pr:
---

## Why
The people this has to impress are on an iPhone or Android, often on cellular. `navigator.connection.saveData`
and `effectiveType` (Network Information API, Chromium/Android; absent on iOS Safari) tell the page the user asked
for lighter data. Nothing in `src/` reads them. Honouring the setting is a standard browser-game courtesy and cuts
the first-flight download. Reference: https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/saveData

## What
A tiny `src/netHint.js` (`isDataSaver()` feature-detected, false when the API is missing) read by `terrainLod.js`
to drop one imagery zoom level and cap the concurrent tile fetches, and by `photorealLazy.js` to skip the Google 3D
tiles stream. A one-line note under the start screen's When? row ("Lighter scenery: your browser asked to save data")
so it never looks like a bug. No new hosts; no storage.

## Acceptance criteria
- [ ] With `saveData = true` stubbed, the tile request count in the first 10 s is at most 60% of the default
- [ ] With the API absent (iOS Safari path) behaviour is unchanged
- [ ] The note shows only when saving data and fits at 390x844 without reflow
- [ ] Boot JS growth under 0.3 kB gz

## Test plan
Unit test for `isDataSaver` with a stubbed `navigator.connection`; one e2e counts `/tiles` requests with the stub.

## Out of scope
A manual quality toggle; offline caching.
