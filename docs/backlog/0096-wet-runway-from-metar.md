---
id: 0096
title: A rainy METAR makes the runway wet: weaker brakes, a longer roll, and a coach that says so
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-10-27
pr:
---

## Why
The weather pillar drives wind, visibility and ceiling, but `src/weather.js` ignores present
weather, so a METAR with RA or TSRA still lands on dry asphalt. Wet runways are the everyday cause
of runway excursions, and the FAA tells turbojet operators to add at least 15% to the dry landing
distance when the runway is wet (SAFO 06012, repeated in later guidance; summary
https://nbaa.org/?p=19437 and https://flyingmag.com/technique-tip-week-landing-wet-and-snowy-runways ).
A player who flies today's weather should feel a longer roll.

## What
`worker` is frozen, so first check what the trimmed METAR JSON already carries (raw text or
`wxString`); if only the raw METAR is there, parse present weather client side in `src/weather.js`
(RA, DZ, TS, SN tokens, VC ignored). A wet flag scales tyre friction in `gear.js`/`systems.js`
(wet asphalt about 0.5-0.6 of dry; cite the source in the code), the autobrake and anti-skid
already read it. The HUD wind box or briefing line says "WET" only when the METAR says so; the
coach adds one wet-runway prompt on the rollout. Offline fallback stays dry, honestly labelled.

## Acceptance criteria
- [ ] A METAR with RA/-RA/TSRA sets wet, with a unit test per token and one for VCSH (stays dry)
- [ ] Flight card: the same C172 POH short-field landing rolls 15-40% longer wet than dry; 737 autobrake
      MAX roll is longer wet than dry
- [ ] "WET" shown only for a live wet METAR; the offline fallback and dry METARs show nothing
- [ ] No change to dry flights: all existing cards pass unchanged
- [ ] Works at 390x844 touch and 1280x720

## Test plan
`tests/unit/weather.test.js` for parsing; `tests/flight/` wet/dry roll cards; one e2e with a stubbed
`api/metar` returning rain, asserting the label and the coach prompt.

## Out of scope
Contaminated runways (snow, ice), hydroplaning, puddle visuals, rain on the windscreen.
