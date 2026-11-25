---
id: 0225
title: Set the altimeter from the ATIS: a stale setting after a pressure drop reads high and the gate catches it
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-11-25
pr:
---

## Why
"High to low, look out below": flying into lower pressure with an old setting makes the altimeter read higher than
the true altitude, so the airplane is lower than shown (FAA AIM 7-2-3,
https://www.faa.gov/air_traffic/publications/atpubs/aip_html/chap7_section_2.html; EASA puts a 10 hPa error at about
280 ft, https://www.easa.europa.eu/community/topics/incorrect-barometric-altimeter-setting; SKYbrary
https://skybrary.aero/articles/altimeter-pressure-settings). `src/atis.js` already speaks the altimeter group, but the
cockpit altimeter never needs it: every flight reads true altitude, so the briefing's altimeter number is decoration.

## What
Add a Kollsman-window setting to the altimeter tape: the indicated altitude is pressure altitude minus
(29.92 - setting) x 1,000 ft per inHg (ISA, `src/atmosphere.js`). Default is the field's live or ISA setting (so a
new player sees no change); a mission variant `pressure_drop` starts 800 ft AGL on a 5 NM final with the setting
0.40 inHg higher than the field's. Keys/buttons to set it (Kid: auto-set on the ATIS read). The stabilized gate and
the results card use TRUE height; the coach says "check your altimeter setting" when the indicated and radio heights
disagree by 300 ft or more. Touches `src/atmosphere.js`, HUD altitude tape, `src/atis.js`, one mission, coach.

## Acceptance criteria
- [ ] Indicated altitude = true altitude at the default setting (existing flight cards and e2e unchanged)
- [ ] With the setting 0.40 inHg stale, indicated reads about 400 ft above true (+-20 ft); unit test
- [ ] `pressure_drop` mission graded on true height; the coach fires the setting prompt once
- [ ] Source URLs cited in the module header; phone and desktop HUD still fit

## Test plan
Unit test on the altimeter function; tests/flight card for the mission; e2e smoke with ?debug readout.

## Out of scope
Transition altitude/flight levels, QFE, metric hPa display.
