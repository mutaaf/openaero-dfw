---
id: 0211
title: Turns around a point: hold a constant-radius circle in a wind, graded on the radius
status: in-progress
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
- [x] The marker is drawn at the stated ground position; the track plot appears on the results card.
- [x] A scripted constant-bank pilot fails as an oval; a scripted wind-compensating pilot passes (flight test).
- [x] Works at 390x844 and 1280x720; lazy chunk, boot budget unchanged.

## Test plan
tests/flight: the two pilots over a 12 kt wind from four directions; e2e: card renders at both viewports.

## Out of scope
S-turns, rectangular course, the 737 and F-16.

## Builder notes (2026-11-23)
Shipped as `turns_around_point` (src/aroundPoint.js, lazy). The AFH ch. 7 text (FAA-H-8083-3C, `airplane_handbook/08_afh_ch7.pdf`)
backs the setup: 600-1,000 ft AGL, entered downwind, ≤ 45° and ≤ VA, two or more turns, bank ∝ groundspeed (its examples are
tan φ = Vg²/(gR)). The ACS (FAA-S-ACS-6C Area V Task B, PA.V.B.S7) grades altitude ±100 ft and airspeed ±10 kt and S4 sets no number for the radius: the
radius bands (spread ±150 ft for a B, ±350 ft an oval = D) are the game's and the card says so. The wind is a scenario 12 kt from
the south (labelled SCENARIO WX), not the live METAR: a live wind would need the spawn turned to its downwind, a follow-up.
The flight cards fly the four winds with the entry turned downwind for each (a crosswind entry starts off the radius: not the
handbook's). The pole is out of a forward view while circling (under the lowered wing, AFH p. 7-7), so the HUD shows its distance
and clock position under the heading box.
