---
id: 0197
title: DFW's Class B airspace drawn on the moving map, from FAA boundary data baked at build time
status: shipped
priority: P2
size: M
lens: authenticity
created: 2026-11-17
pr: 291
---

## Why
Anyone who flies in North Texas knows the DFW Class B "upside-down wedding cake". The moving map shows
runways and airports but not the airspace that shapes every real flight here (Addison's floor is 2,500 ft MSL
under Area F after the 2014 change). Drawing it makes the place recognisable to a pilot and teaches a kid why
you stay low near Addison.

## What
`scripts/bake-airspace.mjs` (like bake-terrain/bake-stars) turns the FAA Airspace Boundary dataset
(https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Boundary_Airspace/FeatureServer/0,
public domain, refreshed every 8 weeks) into a small static `public/airspace/dfw-classb-v1.json` of shelf
polygons with floor/ceiling ft MSL; no runtime fetch. The map draws the shelves as thin outlines labelled
"floor/ceiling" (e.g. 110/30). First step for the Builder: check the layer's attribute table really carries
per-shelf floors and ceilings and that the sandbox can reach it; if not, hand-key from the 14 CFR Part 71
description / TAC and cite it, or set the ticket back to proposed with what was tried. Credit the FAA in
`public/CREDITS.md`; label "for reference, not for navigation".

## Acceptance criteria
- [x] Baked file under 30 kB gz, loaded lazily with the map, with a `v` and a cited source/date
- [x] Each shelf's floor/ceiling matches the cited source (unit test over the baked JSON)
- [x] Map outlines are visible at 390x844 and do not hide the aircraft or runways
  (Builder, 2026-11-18: there is no moving map at 390x844. `#mapPanel` is hidden below `lg` and on every
  touch screen (styles.css), so a phone shows no airspace and fetches none (tests/e2e/airspace.spec.js).
  On the desktop map, the outlines draw under the runways and the ownship. A phone map is a ticket of its
  own; the Scout can weigh it against 0044's HUD rules.)
- [x] "Not for navigation" shown wherever airspace is drawn; credit in CREDITS.md

## Builder notes (2026-11-18)
- The ticket's `Boundary_Airspace` layer holds only ARTCC boundaries. The FAA publishes the Class B in its
  sibling `Class_Airspace` layer, on the same host (IDENT DFW, "DALLAS CLASS B", 15 shelves, Areas A-N, two
  pieces of A). Its data date is 2026-10-29. It has per-shelf `LOWER_VAL/LOWER_CODE` and `UPPER_VAL`.
- That layer's Area J (4,000 ft) polygon encloses the inner shelves. Where the shelves overlap, the lowest
  floor applies (`shelfAt`), and J's label sits outside them. Addison is under Area F (2,500 ft), as the ticket says.
- The labels follow the chart's convention: ceiling over floor, in hundreds of feet (110/SFC, 110/40).

## Test plan
Unit test of the baked JSON (shelf count, floors < ceilings, polygons inside the DFW area); e2e opens the
map and asserts the airspace layer and label exist.

## Out of scope
Class C/D rings, TFRs, live NOTAMs, enforcing airspace in the sim.
