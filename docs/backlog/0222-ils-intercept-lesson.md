---
id: 0222
title: ILS intercept lesson: capture the localizer, then the glideslope from below
status: proposed
priority: P2
size: M
lens: content
created: 2026-11-24
pr:
---

## Why
Every ILS mission starts lined up. The real skill is intercepting: roll out on a vector, capture
the localizer, hold altitude until the glideslope comes down to you (from below), then descend.
The HUD bars already read in dots (shipped), so the game has what the lesson needs.

## What
A 737 mission starting ~12 NM out on a 45 deg intercept heading at the glideslope intercept
altitude for DFW 35C, graded on a stable localizer capture and glideslope captured from below.

## Blocker (Scout, 2026-11-24)
A web search did not surface the Instrument Procedures Handbook's intercept passage, so this has no
cited source. Promote only once the Builder or Scout has read FAA-H-8083-16B chapter 4
(https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/instrument_procedures_handbook/FAA-H-8083-16B_Chapter_4.pdf)
and written the intercept angle, altitude rule and page into this ticket.

## Acceptance criteria
- [ ] Source and page cited in `src/missions.js` and the lesson's header
- [ ] Capture graded from the headless flight; Kid's guide flies it

## Test plan
Flight card flying an on-time and a late capture; e2e starts the mission.

## Out of scope
Procedures with real fixes, holding patterns, other airports.
