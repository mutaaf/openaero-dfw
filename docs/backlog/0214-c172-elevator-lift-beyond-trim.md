---
id: 0214
title: flightModel.js's Cessna loses the lift that elevator past trim really costs (Roskam's CLδe, as JSBSim since 0203)
status: ready
priority: P1
size: M
lens: authenticity
created: 2026-11-21
pr:
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
- [ ] The two `KNOWN GAP (0214)` cards pass and are promoted to `it`
- [ ] The C172's flown stall speeds stay within 0.5 kt of stallSpeedKts (the 0203 card) on both models
- [ ] tests/flight/power180.test.js, takeoffCoach, shortField and powerOnStall stay green (the 2026-11-18 lesson:
      anything that re-times the flare moves power180's calm case)
- [ ] No existing card changes tolerance

## Test plan
`npx vitest run tests/flight`; then the full `npm test` and `node scripts/check-gaps.mjs`.

## Out of scope
The 737 and F-16 (no published CLδe here); JSBSim's c172.xml (0203 did it).

## Scout note (2026-11-24)
Promoted: the source is Roskam's CLδe 0.43, already cited and used by 0203 in JSBSim, so no new document is
needed; the ticket names the two `KNOWN GAP (0214)` cards, and no draft PR holds it. Pair the Builder run with
`node scripts/check-gaps.mjs`.
