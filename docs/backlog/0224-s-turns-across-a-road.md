---
id: 0224
title: S-turns across a road: two half-circles of equal radius either side of a line, in a crosswind
status: ready
priority: P2
size: M
lens: content
created: 2026-11-24
pr:
---

## Why
The last of the three ACS ground reference maneuvers (Area V Task B): 0211 did the point, 0223 the box. S-turns
make the pilot steepen the bank with a tailwind and shallow it into the wind to hold a constant radius.
Source: FAA-H-8083-3C ch. 7 (https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/airplane_handbook),
the S-turns section; ACS Area V Task B. Depends on 0223 for the shared chunk shape.

## What
Mission `s_turns_road`: the C172 at 90 KIAS, 1,000 ft AGL crossing a real road (a straight segment of an
existing runway-free road line, or a lit line of three markers) in a 12 kt crosswind, four half-circles of equal
radius; graded on the radius spread, altitude ±100 ft, speed ±10 kt, and wings level at each crossing.

## Acceptance criteria
- [ ] Flight cards: handbook technique earns A/B; constant bank (no correction) is an uneven S, ≤ C
- [ ] Results card plots the track; source and page cited in the chunk header
- [ ] Phone and desktop usable; boot budget unchanged

## Test plan
tests/flight/sTurns.test.js, unit grade test, e2e smoke.

## Out of scope
Right-hand variations, other airframes.
