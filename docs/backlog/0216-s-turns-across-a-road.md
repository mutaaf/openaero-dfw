---
id: 0216
title: S-turns across a road: two half circles of equal radius, graded on symmetry in a wind
status: proposed
priority: P2
size: M
lens: content
created: 2026-11-22
pr:
---

## Why
The Private Pilot ACS Area V Task B lists S-turns beside turns around a point (0211) and the rectangular
course; a student flies them to learn that the wind, not the bank, decides the ground track. Only 0211 exists
in the backlog (grep `S-turn`: that ticket only), so the second maneuver is missing. Sources: FAA Airplane Flying
Handbook (FAA-H-8083-3C) ch. 7, https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/airplane_handbook/08_afh_ch7.pdf ;
the ACS tolerances (600-1,000 ft AGL, altitude ±100 ft, airspeed ±10 kt, bank 45° max) were seen only in a
third-party summary: the Builder reads FAA-S-ACS-6 Task V.B itself before coding any number.

## What
Blocked on 0211 (reuse its ground-track sampler, wind-aware reference and lazy drill chunk; do not build a second
one). A lazy `src/sTurns.js` drill: the C172 at 800 ft AGL abeam a road or runway line near KADS entering
downwind perpendicular to it; two half circles on opposite sides of the line, graded on the radius of each
half (equal within the ACS tolerance), crossing the line wings level and perpendicular, and altitude and speed.
Coach words reach `coach.js` through `s.ds` like the other drills.

## Acceptance criteria
- [ ] Pure unit cases: a perfect still-air S (equal radii) scores full marks; a crab-less constant bank in 15 kt scores below it with the "bank steeper downwind" tip
- [ ] Flight card (tests/flight/sTurns.test.js): a scripted pilot holding bank constant in wind is graded worse than one varying it
- [ ] The line, entry heading and the two circles are drawn or named on the HUD/coach at 390x844 and 1280x720 without overlap
- [ ] Boot JS budget unchanged (lazy chunk, no new boot `import()`)

## Test plan
Unit + flight card as above; one Playwright smoke that loads the mission and sees the coach's first line.

## Out of scope
The rectangular course (0217), new aircraft, scoring beyond the ACS items.
