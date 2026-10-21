---
id: 0068
title: The runway reads from a 10 NM final in dawn, noon, dusk and night
status: ready
priority: P1
size: M
lens: authenticity
created: 2026-10-21
pr:
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
- [ ] The spec prints the measured contrast for the 8 cases and fails below a threshold chosen between the measured current worst case and the best (record both numbers in the PR).
- [ ] The worst case before the change passes after it; run the test with the lights switched off to show it fails.
- [ ] No per-frame allocations added; perf probe within budget; boot JS stays under the budget in AGENTS.md.
- [ ] Screenshots checked at 1280x720 and 390x844.

## Test plan
`tests/e2e/runwayVisibility.spec.js`, using the existing deep link / mission spawns and the sun presets. Lesson (2026-10-19): calibrate the threshold between the lights-on and lights-off numbers.

## Out of scope
Changing runway geometry or survey data; adding lights to taxiways.
