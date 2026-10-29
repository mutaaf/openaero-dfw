---
id: 0108
title: A wet runway from the METAR: longer stops and a coach that says so
status: shipped
priority: P2
size: M
lens: authenticity
created: 2026-10-29
pr: 124
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
- [x] Unit: METAR strings with RA/-RA/+RA/TSRA/DZ set wetRunway, clear ones and `VCSH`-only do not
- [x] Flight card: the same 737 and C172 landing rolls, wet vs dry, stop distance longer by 30-100%, landings still gradable
  (C172 +33%, also +14% from 50 ft against the UK CAA's +15%; 737 +98%, on the pessimistic side of Boeing's
  good-vs-dry advisory pattern (25.109(c)'s default 0.80 efficiency, no reverse); 121.195(d)'s 115% of the ACAP
  field length is only a loose sanity ceiling)
- [x] Dry cards unchanged (no existing flight card regresses)
- [x] The HUD/coach says "wet" only with a wet METAR; offline fallback is dry and says nothing
- [x] No boot-budget increase beyond headroom (194.35 → 195.00 kB of 201)

## Shipped notes
The wet friction is 14 CFR 25.109(c)(1)'s wet tyre-to-ground braking coefficient (a cubic in
groundspeed per tyre pressure) times (c)(2)'s anti-skid efficiency, never above dry
(systems.js brakeMu). 737: 205 psi, fully modulating 0.80. C172: 38 psi (the rule's 50 psi
row), no anti-skid, 0.37 fitted to UK CAA Safety Sense Leaflet 7's +15% wet paved landing
distance. A thunderstorm with no precipitation (`TS`) is not wet: only RA/DZ falling at the
field is. The wet runway's side grip and rolling resistance are unchanged; JSBSim
(`?fdm=jsbsim`) does not read the flag yet. The wet friction also applies to a rejected
takeoff (a 737 stop from 140 kt: 1,922 ft dry, 4,100 ft wet), as 25.109(c), the accelerate-stop
rule, intends.

## Test plan
`tests/unit/weather.test.js` parsing; `tests/flight/` wet vs dry landing roll cards; one e2e
that injects a scripted wet METAR and checks the label.

## Out of scope
Hydroplaning, standing water visuals, braking-action reports (Good/Medium/Poor).
