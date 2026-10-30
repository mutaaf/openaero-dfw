---
id: 0114
title: Runway facts you can check against a chart: length, width and elevation in the briefing
status: shipped
priority: P2
size: S
lens: authenticity
created: 2026-10-30
pr: 134
---

## Why
The vision says a pilot should "recognise the place and the procedures: runway thresholds and
headings you can check against a chart". `airports.js` already holds each runway's
`lengthFt`, `widthFt` and surveyed end elevations (OurAirports), and the start screen shows
density altitude (0111) for the mission's runway, but the player is never told "35C: 13,400 x
200 ft, field 603 ft". A real pilot reads exactly this line off the chart; a kid learns what a
long runway is.

## What
One line under the runway/density-altitude line on the start screen (and the first-Fly toast
only if there is room; the 0111 toast is already one line): runway ident, magnetic heading
(magvar.js), length x width in ft, threshold elevation in ft MSL, from the mission's runway
end. Pure formatter in `src/airports.js` or a tiny helper, unit tested. Label honestly:
"OurAirports survey" is the data source, no "official". Mind the boot budget (AGENTS.md § 5):
build the string in an existing function, not a new module.

## Acceptance criteria
- [ ] KDFW 35C reads 13,400 x 200 ft with its surveyed elevation and a magnetic heading within 1° of `approachGeometry`'s course less magvar
- [ ] Tours/drills with no runway show no line (no stale text)
- [ ] Fits one line at 390x844, 844x390 and 1280x720; no overlap with #txtDensityAlt (e2e bounding boxes)
- [ ] Boot JS stays under the budget

## Test plan
Unit test the formatter for every runway end in `RUNWAYS` (length/width/elevation round-trip). E2E: the line for the default mission and for a drill.

## Out of scope
Declared distances (TORA/LDA), displaced thresholds, taxiway names, anything not in the existing survey data.
