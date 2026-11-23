---
id: 0211
title: Turns around a point: hold a constant-radius circle in a wind, graded on the radius
status: ready
priority: P2
size: M
lens: content
created: 2026-11-21
pr:
---

## Why
The game has a real, measured wind (0004, 0106) but nothing that makes the player feel what wind does to the
ground track. Turns around a point is the classic ground-reference lesson: the bank must steepen downwind and
shallow upwind to hold a constant radius, and the ACS grades altitude ±100 ft and speed ±10 kt. It teaches
wind drift in one picture, the satellite map under the airplane. Source: FAA Airplane Flying Handbook
(FAA-H-8083-3C) ch. 7 "Ground Reference Maneuvers", https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/airplane_handbook

## What
A Cessna mission over open ground at 1,000 ft AGL in a 10-15 kt wind; a marker (a lit pole) is drawn on the
ground half a mile ahead. Grade the distance from the marker over two full circles: radius standard
deviation, altitude and speed windows, with a results card plotting the track on the map. Touches
missions.js, a new lazy drill module, the results text.

## Acceptance criteria
- [ ] The marker is drawn at the stated ground position; the track plot appears on the results card.
- [ ] A scripted constant-bank pilot fails as an oval; a scripted wind-compensating pilot passes (flight test).
- [ ] Works at 390x844 and 1280x720; lazy chunk, boot budget unchanged.

## Test plan
tests/flight: the two pilots over a 12 kt wind from four directions; e2e: card renders at both viewports.

## Out of scope
S-turns, rectangular course, the 737 and F-16.
