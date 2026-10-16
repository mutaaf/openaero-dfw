---
id: 0003
title: Rebuild every DFW-area runway from real survey data and fly approaches to any of them
status: ready
priority: P1
size: L
lens: authenticity
created: 2026-10-16
pr:
---

## Why
The modelled runways are hand-placed and wrong: KDFW 35C sits at sim x=0 (the KDFW
airport-reference point, -97.0403°), but the real 35C threshold is at -97.02620°, about
1.3 km east, so the drawn runway and the one in the satellite photo disagree. Only three
KDFW runways and one KDAL runway exist, approach guidance (ILS bars, PAPI, autopilot APR)
is hard-coded to 35C via `sim.pos.x`/`sim.pos.z`, and KDAL 31R is drawn south of DFW
when Love Field is north-east. A pilot notices in five seconds.

## What
- `src/airports.js`: runway ends for KDFW (13L/31R, 13R/31L, 17C/35C, 17L/35R, 17R/35L,
  18L/36R, 18R/36L), KDAL (13L/31R, 13R/31L), KAFW (16L/34R, 16R/34L), KADS (16/34),
  KGKY (16/34), KFTW (16/34, 17/35) with lat/lon, true heading, length, width, elevation
  from OurAirports `runways.csv` (source: https://davidmegginson.github.io/ourairports-data/runways.csv,
  public domain), converted to sim metres with `geo.js`.
- Runway geometry, markings and a PAPI for every runway end built from that table.
- A pure `approachGeometry(runwayEnd, pos)` helper: along-track distance to threshold,
  cross-track (localizer) offset, height above the 3° glidepath. HUD ILS bars, PAPI, the
  approach autopilot and the moving map use the *active* runway end.
- Scenarios spawn on the extended centreline of a chosen runway end at N NM on the 3°
  path, aligned with its true heading (so KDAL 31R is a real Love Field approach).

## Acceptance criteria
- [ ] Unit test: KDFW 35C threshold converts to sim metres within 5 m of the geo.js
      projection of 32.87890°N, -97.02620°W
- [ ] Unit test: `approachGeometry` returns 0 cross-track and on-path height for a point
      on the extended centreline at 3°
- [ ] e2e: each mission loads with the aircraft aligned (|heading − runway true heading| < 2°)
- [ ] e2e: with tiles stubbed, the runway for the loaded approach is visible ahead
- [ ] Moving map shows all runways of the nearby airports in true orientation

## Test plan
`tests/unit/airports.test.js` for conversion and approach geometry; extend the missions
e2e to assert alignment for every mission.

## Out of scope
Taxiways, aprons, terminal buildings; terrain elevation differences between airports
(all fields sit on the flat sim plane, elevation kept for altimeter maths only).
