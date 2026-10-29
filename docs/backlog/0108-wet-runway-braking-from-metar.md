---
id: 0108
title: A wet runway from the METAR: longer stops and a coach that says so
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-10-29
pr:
---
## Why
Real weather is pillar 3, but weather only moves wind and visibility. Rain on the METAR
(`RA`, `-RA`, `+RA`, `TSRA`, `DZ`) means a wet runway, and a wet runway is what makes a pilot
reconsider landing distance: braking friction roughly halves and the FAA says to treat it
that way (landing distance on wet runways is planned at about 15% over dry for turbojets under
14 CFR 25.125 / AC 91-79A: https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_91-79A_Chg_2.pdf).
Today the brakes grip the same on a stormy day as a clear one, so the weather is scenery.

## What
`src/weather.js` already decodes the METAR: add `wetRunway` (present-weather group with RA/DZ/
TS, or a scenario flag), expose it with the wind. `src/gear.js` scales the tyre friction
coefficient (and `systems.js` anti-skid slip target) by a wet factor, ~0.55 of dry braking mu
on the mains. Labels stay honest: "wet runway" appears on the HUD wind box / ATIS-style line
only when the METAR (live) or the scripted scenario says so, never invented. Coach says
"wet runway: expect a longer roll, brake early" on a wet final. Dry METARs and offline fallback
are unchanged.

## Acceptance criteria
- [ ] Unit: METAR strings with RA/-RA/+RA/TSRA/DZ set wetRunway, clear ones and `VCSH`-only do not
- [ ] Flight card: the same 737 and C172 landing rolls, wet vs dry, stop distance longer by 30-100%, landings still gradable
- [ ] Dry cards unchanged (no existing flight card regresses)
- [ ] The HUD/coach says "wet" only with a wet METAR; offline fallback is dry and says nothing
- [ ] No boot-budget increase beyond headroom (put the wet text in a lazy chunk if needed)

## Test plan
`tests/unit/weather.test.js` parsing; `tests/flight/` wet vs dry landing roll cards; one e2e
that injects a scripted wet METAR and checks the label.

## Out of scope
Hydroplaning, standing water visuals, braking-action reports (Good/Medium/Poor).
