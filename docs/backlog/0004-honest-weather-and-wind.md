---
id: 0004
title: Make the wind real in the physics and stop calling scenario weather "live"
status: ready
priority: P1
size: M
lens: authenticity
created: 2026-10-16
pr:
---

## Why
The UI says "Live NOAA METAR" and shows `35021G31KT`, but the METAR string is hard-coded
and `sim.windDirDeg` / `windSpeedKts` / `windGustKts` are never used by the integrator:
the aircraft flies in still air. That's both untrue and a missed opportunity, since a gusty
north wind on a north-flow approach is exactly the kind of thing a pilot wants to feel.

## What
- In the integrator, compute airspeed, AoA and sideslip from velocity **relative to the
  air mass** (ground velocity minus wind vector), with gusts as smoothed noise between
  the steady and gust speed. Keep it in a pure helper in `src/aero.js` with unit tests.
- Show the crosswind/headwind components for the active runway on the HUD or ribbon.
- Relabel the ribbon to "SCENARIO WX" and remove "Live NOAA METAR" from the modal copy
  until a live source exists. Fetching real METARs (e.g. aviationweather.gov) needs a new
  runtime host: open a `proposal/` PR for the operator rather than adding it.

## Acceptance criteria
- [ ] Unit test: with a 20 kt headwind, indicated airspeed exceeds groundspeed by ~20 kt
- [ ] Unit test: with a pure crosswind, sideslip/drift is non-zero and in the right direction
- [ ] The words "Live" and "NOAA" no longer appear in the UI
- [ ] Holding the 35C approach with AP off now requires a small crab into the wind (e2e: heading drifts without input)

## Test plan
Unit tests for the wind-relative airspeed helper; e2e asserting the copy change and that
track ≠ heading after a few seconds of hands-off flight in a crosswind scenario.

## Out of scope
Turbulence models beyond simple gusts, live weather fetching (separate proposal).
