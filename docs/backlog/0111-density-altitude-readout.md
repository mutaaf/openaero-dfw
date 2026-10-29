---
id: 0111
title: Density altitude on the HUD and the briefing, from today's METAR
status: shipped
priority: P2
size: M
lens: authenticity
created: 2026-10-29
pr: 126
---

## Why
The physics already runs on the METAR's temperature and altimeter (`atmosphere.js`; the C172 hot-day roll card is +20% at ISA+25 °C), but the player never sees why a 100 °F Texas afternoon makes the Cessna sluggish. Density altitude is the number every pilot checks before a takeoff: pressure altitude corrected for non-standard temperature (FAA Pilot's Handbook of Aeronautical Knowledge, FAA-H-8083-25 "Performance"; method summarised at https://studentpilot.com/learn-to-fly/aircraft-performance/density-altitude/). Showing it makes the real-weather pillar teach something and ties the live weather to a result you can feel.

## What
A pure `densityAltitudeFt(fieldElevFt, altimeterInHg, tempC)` in `src/atmosphere.js` (pressure altitude = elev + (29.92 − altimeter) × 1,000; DA = PA + 118.8 × (OAT − ISA temp at PA)). The start screen's weather line and the takeoff briefing show "DA 2,400 ft" with a one-line plain-language hint when DA exceeds field elevation by 1,500 ft or more ("Thin air: expect a longer takeoff roll and a weaker climb"). Labelled scenario when the weather is not live.

## Acceptance criteria
- [ ] DA matches the standard formula for ISA (DA = field elevation) and for a 38 °C, 29.80 inHg case at KDFW (hand-computed in the test, ±50 ft)
- [ ] The text appears on the start screen and in the takeoff mission's briefing, labelled live or scenario like the rest of the weather
- [ ] Fits 390x844 and 844x390 without moving the coach slot or the tapes; no new hosts
- [ ] Boot JS stays under budget (compute in atmosphere.js, text in the existing weather line)

## Test plan
Unit test for `densityAltitudeFt` (ISA, hot, cold, low altimeter). e2e: a stubbed hot METAR shows the thin-air hint on the start screen at 390x844.

## Out of scope
Changing the physics (already correct); a performance calculator.
