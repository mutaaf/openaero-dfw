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
150 ft, threshold 562 ft". A real pilot reads exactly this line off the chart; a kid learns what a
long runway is.

## What
One line under the runway/density-altitude line on the start screen (and the first-Fly toast
only if there is room; the 0111 toast is already one line): runway ident, magnetic heading
(magvar.js), length x width in ft, threshold elevation in ft MSL, from the mission's runway
end. Pure formatter in `src/airports.js` or a tiny helper, unit tested. Label honestly:
"OurAirports survey" is the data source, no "official". Mind the boot budget (AGENTS.md § 5):
build the string in an existing function, not a new module.

## Acceptance criteria
- [x] KDFW 35C reads 13,400 x 150 ft (OurAirports and the FAA diagram: 17C/35C is 150 ft wide; 17R/35L is the 200 ft one) with its surveyed elevation and a magnetic heading within 1° of `approachGeometry`'s course less magvar
- [x] Tours/drills with no runway show no line (no stale text)
- [x] Fits one line at 390x844, 844x390 and 1280x720; no overlap with #txtDensityAlt (e2e bounding boxes)
- [x] Boot JS stays under the budget

## Test plan
Unit test the formatter for every runway end in `RUNWAYS` (length/width/elevation round-trip). E2E: the line for the default mission and for a drill.

## Out of scope
Declared distances (TORA/LDA), displaced thresholds, taxiway names, anything not in the existing survey data.

## Shipped notes (#134)
The line reads `RWY 35C: 13,400 × 150 ft · 358°M · THR 562 ft (OurAirports)` (MSL left off to fit one line at 390 px, as on FAA diagrams). THR is the
landing threshold's elevation, down the runway's slope by any displaced threshold (the same
number the approach geometry flies to). The heading is the true course less WMM-2025's 2.7° E
(magvar.js); FAA charts print 356° for 35C on an older variation. The FAA lists the DFW
north-south runways at 13,401 ft; OurAirports has 13,400 for three of them, and the line names
its source.
