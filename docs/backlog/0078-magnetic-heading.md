---
id: 0078
title: Show magnetic headings: the HUD compass agrees with the runway numbers and the chart
status: ready
priority: P2
size: S
lens: authenticity
created: 2026-10-22
pr:
---

## Why
Playing the build, the HUD heading box reads `000°` lined up on 35C. Runway numbers, ATC
and every chart are magnetic: a pilot sees "35" and expects the compass near 350, so the
first thing a real pilot checks (heading vs runway number) looks wrong. `src/airports.js`
stores `hdgT` (true), and no module applies magnetic variation (grep for `variation` or
`declination` finds nothing). METAR winds are also reported true, while ATC/ATIS winds
are magnetic, so the wind and heading displays should agree on one convention. Variation is
tiny maths from the public-domain NOAA World Magnetic Model; a single value for the
metroplex (it varies by <0.3° across DFW) is accurate to the chart's own rounding.
Source: https://www.ncei.noaa.gov/products/world-magnetic-model (WMM is US-government,
public domain; the NCEI calculator gives the declination for a lat/lon/date).

## What
New pure `src/magvar.js`: `MAG_VAR_DEG` for the DFW area (east positive) with its source
and epoch in a comment, `trueToMag(deg)`, `magToTrue(deg)`. The HUD heading box, the
heading bug/autopilot heading readout and the runway "RWY 35C 353°" label show magnetic;
physics, geometry and `hdgT` stay true. Label the box `MAG` (or add a small `M` suffix)
so it is honest. The ATIS-style wind text (0030) is out of scope here.

## Acceptance criteria
- [ ] Lined up on a runway end, the HUD heading is within 1° of that end's published magnetic heading (FAA chart), not its true heading
- [ ] Physics, autopilot, approach geometry and every existing test are unchanged (conversion only at display)
- [ ] The heading box is labelled magnetic
- [ ] Works at 390x844 and 1280x720; no HUD overlap introduced

## Test plan
Unit test `magvar.js` (round trip, wrap at 0/360, known value against the NCEI figure
quoted in the file). E2E: spawn on 35C, read the heading box text, assert it equals
`trueToMag(0.3)` rounded and is not `000`.

## Out of scope
Per-airport variation, a time-varying model, the wind direction display (follow-up if wanted).
