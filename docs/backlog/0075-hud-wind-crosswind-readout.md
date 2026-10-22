---
id: 0075
title: Wind arrow and crosswind component on the HUD, always visible on final
status: ready
priority: P1
size: S
lens: player-feel
created: 2026-10-22
pr:
---

## Why
Pillar 3 says today's METAR pushes the aircraft around, but the player can't see it. Playing
the main build on the default KDFW final (390x844 and 1280x720, clean view on) there is no
wind information on screen: the `WIND: 350° @ 10 KT` badge lives in the desktop panels that
the clean view folds away and never exists on a phone. A first-timer gets blown off the
centreline with no explanation, and a pilot has no way to do the crab/crosswind sums.
Pilots normally estimate the crosswind component from the reported wind and runway heading
(see the problem statement in https://patents.google.com/patent/US8055395); showing it is the
standard glass-cockpit answer.

## What
A compact HUD element (canvas HUD, `renderHud` in `src/main.js`, geometry in
`src/hudLayout.js`): an arrow showing wind direction relative to the aircraft heading, the
wind speed in kt, and below 1,500 ft AGL on a final, "XW 8L" / "HW 12" (cross and head
components against `sim.activeEnd`, left/right from the pilot's side). Pure helper
`windComponents(windDirDeg, windKt, rwyHeadingDeg)` in `src/aero.js`. Must label honestly:
"WIND" source follows the existing live/offline state in the weather module.

## Acceptance criteria
- [ ] `windComponents` unit-tested: 350°@10 on runway 35C gives ~0 cross / 10 head; 080°@10 on 35C gives 10 cross from the right.
- [ ] The element is visible with clean view on at 390x844 and 1280x720, never overlaps the tapes, heading box, coach card or the horizon band (elementFromPoint / canvas-region check as in `tests/e2e/devices.spec.js`).
- [ ] Hidden or shown dimmed when the wind is calm (< 2 kt) so it adds no noise.
- [ ] Reduced-motion: no animation on the arrow.
- [ ] No per-frame allocations; e2e perf probe within budget.

## Test plan
Unit: `tests/unit/aero.test.js` for `windComponents` (including reciprocal runways and
gusts). E2E: with a stubbed METAR (see existing weather specs) assert the debug snapshot
exposes the displayed cross/head values and that the HUD region is clear of the other
elements at both viewports.

## Out of scope
Gust factor display, wind at altitude, a wind-barb on the moving map.
