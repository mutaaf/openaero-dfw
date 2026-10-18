---
id: 0030
title: A real ATIS-style briefing when you enter the cockpit
status: proposed
priority: P2
size: M
lens: authenticity
created: 2026-10-18
pr:
---

## Why
Pilots recognise a flight by its ATIS: "DFW information Alpha, wind three five zero at one
zero, visibility one zero, altimeter three zero zero zero, ILS runway three five centre in use".
We already have the METAR, the active runway and speechSynthesis for GPWS, but the player gets
only a terse text strip. The FAA lists the required ATIS contents (airport, phonetic letter,
UTC time, wind, visibility, sky, temperature/dew point, altimeter, runways and approaches in
use): https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap2_section_9.html

## What
A pure `buildAtis(metar, activeEnd, now)` in a new `src/atis.js` producing the text (letter from
the UTC hour so it is stable, never claimed to be the real broadcast) and a toast/panel shown
for ~8 s after Enter cockpit and re-openable from the HUD. Spoken only if sound is enabled,
through the existing on-device speech path in `src/audio.js`. Label honestly: "SCENARIO" when
the weather is the offline fallback, the real observation time when live. No new hosts.

## Acceptance criteria
- [ ] Text includes wind, visibility, sky, temp/dew, altimeter (inHg, from METAR), runway in use
- [ ] Offline fallback is labelled scenario, never "live"
- [ ] Speech respects the sound checkbox and is skipped when speechSynthesis is missing
- [ ] Panel does not overlap the HUD at 390x844 or 844x390 and is dismissible by key and tap

## Test plan
Unit tests for `buildAtis` (numbers spoken digit by digit, "niner", altimeter rounding, scenario
label). E2E: stubbed METAR produces the expected string in the panel; no console errors.

## Out of scope
Real ATC voice, ground/tower dialogue, frequencies.
