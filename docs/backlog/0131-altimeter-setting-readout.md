---
id: 0131
title: Show the altimeter setting under the altitude tape, from the METAR
status: ready
priority: P2
size: S
lens: authenticity
created: 2026-11-01
pr:
---

## Why
The sim already flies on the METAR's altimeter setting (`sim.altimInHg`, ticket 0038) but
never shows it, so a pilot cannot see why the tape reads 40 ft off the field elevation on a
low-pressure day, and the "29.92" they would set at 18,000 ft (FAA AIM 7-2-1, altimeter
setting; https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap7_section_2.html) is
invisible. A small "29.92 IN" under the altitude tape is how every real PFD and altimeter
shows it, and it makes "today's weather" visible in the cockpit.

## What
In `src/hudLayout.js` / the canvas HUD in `main.js`, one text line under the altitude tape
reading `sim.altimInHg` to two decimals ("30.11 IN"), labelled as the scenario value when
the METAR is not live (same honesty rule as the wind box). Updated once a second with the
wind box's text refresh; no per-frame allocation. Hidden in clean view on phones if it would
overlap the AGL box at 390x844.

## Acceptance criteria
- [ ] With a METAR altimeter of 30.11 the HUD shows "30.11"; offline it shows 29.92 and says scenario
- [ ] Does not overlap the wind box or tape at 1280x720, 390x844, 844x390 (screenshots)
- [ ] The number is the one physics uses (`sim.altimInHg`)
- [ ] Boot JS within budget

## Test plan
Unit: the label function for live vs scenario, rounding. e2e: set a mocked METAR via the
fixtures and read the HUD text or the exposed debug snapshot.

## Out of scope
A settable Kollsman knob, transition altitude, flight levels.
