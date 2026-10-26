---
id: 0092
title: Low-ceiling approach mission: break out at the decision height
status: ready
priority: P2
size: M
lens: content
created: 2026-10-26
pr:
---

## Why
Every mission is flown in clear weather unless the live METAR happens to be bad, so the
"real weather overhead" pillar never teaches the thing that makes weather matter: a ceiling
you cannot see the runway under. A scripted low-IFR day gives a pilot a real procedure (fly
the localizer and glideslope, see the lights at the decision height or go around) and gives a
first-timer a reason to trust the ILS bars. Categories per AIM 7-1-7 (decoded verbatim at
https://www.angleofattack.com/aim/chapter-7/7-1-7/): IFR is a ceiling of 500 to under 1,000 ft
and/or visibility 1 to under 3 SM; LIFR is under 500 ft and/or under 1 SM. The ceiling is the
lowest BKN or OVC layer.

## What
A mission `kdfw_35c_low_ifr` whose weather is a fixed scripted METAR (`SCENARIO KDFW 35012KT
2SM BKN004 OVC008 ...`, labelled "scenario", never "live": `weather.js` already carries
`fltCat` and `live: false`). Start 5 NM on 35C. Reuse the sky dome's METAR cloud layers and
`fogDensityForVisibility`. The coach says "Decision height: runway in sight?" at 200 ft
AGL on the ILS; if the approach lights are not visible there (they are visible below the
ceiling by construction), the existing go-around machinery applies. The HUD wind box and
weather label show the category (IFR/LIFR) from `fltCat`.

## Acceptance criteria
- [ ] The mission appears in the picker under a weather group and starts with the scripted METAR; the HUD never says "live"
- [ ] At 5 NM the runway is not visible through the overcast (a pixel/visibility probe like the 0068 spec); below the ceiling the approach lights are
- [ ] A 200 ft callout fires once on the glideslope
- [ ] No console errors; boot JS budget unchanged (mission data only; any new code lazy)
- [ ] Works at 390x844 touch and 1280x720

## Test plan
Unit for the scripted METAR parse (category IFR, ceiling 400, vis 2) and the decision-height
trigger; e2e that the mission boots and the label reads scenario.

## Out of scope
Real approach plates, missed-approach holds, ILS category minima by runway.
