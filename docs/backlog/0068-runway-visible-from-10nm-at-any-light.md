---
id: 0068
title: The runway reads from a 10 NM final in dawn, noon, dusk and night
status: shipped
priority: P1
size: M
lens: authenticity
created: 2026-10-21
pr: 82
---

## Why
Pillar 2 asks for runways "visible from a 10 NM final". Playing the main build (night/
dawn preset, default KDFW final at ~1,100 ft AGL, 1280x720 and 390x844) the runway was hard
to pick out from the city: the surface is a dark band among dark warehouse roofs, and the
approach lights were a few pixels. A first-timer who cannot find the runway cannot land it in
30 seconds. Real approach lighting is meant to be the cue pilots acquire first (FAA AIM
2-1-1, https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap2_section_1.html).
Nothing in `tests/e2e` measures this today (`night.spec.js` covers the lights existing, not
being findable).

## What
An e2e spec that, for each sun preset (Dawn, Noon, Dusk, Night) on the 35C and 17R finals
spawned at 10 NM and again at 3 NM, screenshots at `FULL_RES` and measures the contrast of the
runway region (projected from the threshold/far-end world positions via the camera) against a
ring of imagery around it, plus the count of lit light pixels at night. Then fix the weakest
case in `src/main.js` / `runwayLights.js` / the decal colour: e.g. a slightly brighter
edge-lit surface tone at dusk and night, a minimum screen-space size for lights (point size
floor, still one draw call), and a brighter threshold bar. Do not add draw calls.

## Acceptance criteria
- [x] The spec prints the measured contrast for the 8 cases and fails below a threshold chosen between the measured current worst case and the best (record both numbers in the PR). (Gated at night; by day the numbers are printed.)
- [ ] The worst case before the change passes after it; run the test with the lights switched off to show it fails. (Met for night only; lights-off run fails every night gate. Not met by day: see Shipped notes.)
- [ ] No per-frame allocations added; perf probe within budget; boot JS stays under the budget in AGENTS.md. (No allocations; boot JS was already over 201 kB and grows 0.2 kB, recorded in AGENTS.md.)
- [x] Screenshots checked at 1280x720 and 390x844.

## Test plan
`tests/e2e/runwayVisibility.spec.js`, using the existing deep link / mission spawns and the sun presets. Lesson (2026-10-19): calibrate the threshold between the lights-on and lights-off numbers.

## Out of scope
Changing runway geometry or survey data; adding lights to taxiways.

## Shipped notes
- `tests/e2e/runwayVisibility.spec.js` measures 35C and 17R at 10 and 3 NM, four presets, over a
  dark urban stub; numbers before/after/lights-off are in its header and the PR.
- Fix: threshold bars and approach lights keep their size at range, and every runway light has a
  3 px floor at night. Night 10 NM: contrast 1.97/2.01 → 2.34/2.27, lit px 8/10 → 14/14
  (lights off: 1.26/1.14, 0 px). The night 10 NM cases are gated between those numbers.
  Not boot-budget free: +0.2 kB gz for the ?debug hook and readout.
- **AC2 not met by day:** the worst case before (Day 10 NM, 1.03 on 17R) is unchanged after; it
  is capped by the haze, not the runway. Whether "10+ SM" should mean more than 25 km is a
  separate question (a real 10+ day is often 40 km+). Also seen by the panel: on a phone the
  35C lights sit under the flight-path marker at 10 NM; a follow-up could fade HUD symbols there.
- Not fixable honestly here: by day at 10 NM the runway is 18.5 km into the 25 km "10+ SM" fog
  (1.03-1.11 before and after); runway lights are off by day in VMC, as at the real fields; Dawn
  and Dusk put the sun 2.5° up, before the lights come on. Those cases are printed and only
  have to show the runway at all; day 3 NM has a regression floor.
- Tried and dropped: concrete runway surfaces (true for DFW per OurAirports) cut the 3 NM day
  contrast on the urban backdrop (1.32 → 1.20); a separate fidelity ticket if wanted.
