---
id: 0197
title: DFW's Class B airspace drawn on the moving map, from FAA boundary data baked at build time
status: proposed
priority: P2
size: M
lens: authenticity
created: 2026-11-17
pr:
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
- [ ] Baked file under 30 kB gz, loaded lazily with the map, with a `v` and a cited source/date
- [ ] Each shelf's floor/ceiling matches the cited source (unit test over the baked JSON)
- [ ] Map outlines are visible at 390x844 and do not hide the aircraft or runways
- [ ] "Not for navigation" shown wherever airspace is drawn; credit in CREDITS.md

## Test plan
Unit test of the baked JSON (shelf count, floors < ceilings, polygons inside the DFW area); e2e opens the
map and asserts the airspace layer and label exist.

## Out of scope
Class C/D rings, TFRs, live NOTAMs, enforcing airspace in the sim.
