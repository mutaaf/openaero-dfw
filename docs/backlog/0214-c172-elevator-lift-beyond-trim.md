---
id: 0214
title: flightModel.js's Cessna loses the lift that elevator past trim really costs (Roskam's CLδe, as JSBSim since 0203)
status: shipped
priority: P1
size: M
lens: authenticity
created: 2026-11-21
pr: 320
---

## Why
Found by 0203. Both C172 models fly aero.js's POH-fitted lift table, which already holds the trimmed elevator's
tail download. Since 0203 our JSBSim C172 also counts Roskam's CLδe 0.43 on the elevator's deflection beyond the
trimmed one (public/jsbsim/aircraft/c172/c172.xml `aero/function/elevator-trim-rad`); flightModel.js has no
elevator lift at all. Full back stick at Vr is ~0.11-0.18 of CL beyond trim, so flightModel.js climbs away
steeper than JSBSim: peak pitch with the wheels under 5 ft 23.3 / 24.4° (flaps 0 / 10) against JSBSim's
21.1 / 22.6°, outside the card's 1.5° (tests/flight/c172.test.js, `KNOWN GAP (0214)`). The angle of attack
already agrees within 0.75° (0202).

## What
Add the same term to flightModel.js's C172 lift: CLδe × (δe − δe_trim(α)), with δe_trim(α) from the airframe's
own pitch law (Cmα / Cmδe and the elevator's post-stall effectiveness, src/pitchBreak.js), so trimmed flight and
the POH stall speeds do not move. Only for an airframe that carries the data (spec field), not the 737 or F-16.

## Acceptance criteria
- [x] The two `KNOWN GAP (0214)` cards pass and are promoted to `it`
- [x] The C172's flown stall speeds stay within 0.5 kt of stallSpeedKts (the 0203 card) on both models
- [x] tests/flight/power180.test.js, takeoffCoach, shortField and powerOnStall stay green (the 2026-11-18 lesson:
      anything that re-times the flare moves power180's calm case)
- [x] No existing card changes tolerance

## Test plan
`npx vitest run tests/flight`; then the full `npm test` and `node scripts/check-gaps.mjs`.

## Out of scope
The 737 and F-16 (no published CLδe here); JSBSim's c172.xml (0203 did it).

## Scout note (2026-11-24)
Promoted: the source is Roskam's CLδe 0.43, already cited and used by 0203 in JSBSim, so no new document is
needed; the ticket names the two `KNOWN GAP (0214)` cards, and no draft PR holds it. Pair the Builder run with
`node scripts/check-gaps.mjs`.

## Builder note (2026-11-24)
flightModel.js elevatorLiftCl: CLδe 0.43 × (the stick's elevator + α's distance from the trimmed α, both over
Cmδe/Cmα at pitchBreak's η by the stick's side, α held at the clean stall), zero in any steady pre-stall flight.
Full aft at Vr: peak pitch under 5 ft 21.3 / 23.5° against JSBSim's 21.1 / 22.6° (was 23.3 / 24.4°); peak α
19.0 / 18.9° (JSBSim 19.1 / 19.0°). In the air only: on the runway gear.js tailVsMainsAccel scales the elevator's
rotation by the mains' moment, so the download's extra weight slowed the rotation twice (a 40% pull's nose wheel
left at 61.2 KIAS, not 58.7; JSBSim 55.6), which moved the held-pull and turn-back cards. The tail strike's
1/60 s vs 1/180 s card then failed on a sampling phase (the tail crossed 2.9 cm into the runway in one 1/60 s
step with no force): gear.js now takes the tail contact's mean over the step. The flaps-30 flares float
22-34 ft further, so power180.js TURN_FT is 157 (was 160); Kid's turn stays at 95 ft.
