---
id: 0123
title: HUD fly-to bars read in ILS dots, so they move with the angle like a real localizer and glideslope
status: ready
priority: P2
size: S
lens: authenticity
created: 2026-10-31
pr:
---

## Why
Playing the default 4 NM final (1280x720 and 390x844) the amber localizer and glideslope bars
sit on the aiming marker, which is right, but `src/main.js` (the "ILS Guidance Crosshairs"
block, ~l.1971) moves them by metres: `locDev = -crossM * 0.08` px and
`gsDev = heightAbovePathM * 0.4` px, clamped at 80 and 60 px. A real ILS is angular: a
localizer dot is the same angle at any range, so the same 100 m offset is a fraction of a dot
at 4 NM and several dots at 1 NM, and the needle swings faster the closer you are. The game
already has the angular maths (`ilsDots`, `LOC_DOT_DEG`, `GS_DOT_DEG` in `src/aero.js`) for the
stabilized gate and the coach, so the bar a player chases and the "more than 1 dot" the gate
calls out are measured on two different scales: a bar that looks centred can already fail the
gate, and at 4 NM the bar saturates at 1,000 m (about 7 dots) of error. Pilots read the real
thing in dots: localizer full scale is 2.5 degrees either side of the course and glideslope
full scale is 0.7 degrees (FAA AIM 1-1-9, https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap1_section_1.html).

## What
Drive both bars from `ilsDots(...)` with the same antenna distances the gate uses
(`main.js` ~l.821-830): px = dots * a fixed px-per-dot, clamped at +-2.5 dots (localizer, full
scale 2 dots of 1.25 degrees) and +-2 dots (glideslope). Draw small dot ticks at the dots so the
bar can be read against them. Pure maths in `src/aero.js` or `src/hudLayout.js` (a
`ilsBarOffsetPx(dots, pxPerDot, maxDots)` helper), not in the draw call. The bars still show
only on an approach (activeEnd, -500 m to 20 km), and Kid keeps them hidden if it hides them today.

## Acceptance criteria
- [ ] The bar's offset is a function of the dots only: the same angular error gives the same offset at 4 NM and at 1 NM
- [ ] A 1-dot error draws the same offset as the stabilized gate's 1-dot limit (one tick)
- [ ] Clamps at the full-scale dots; never leaves the 140 px crosshair box
- [ ] Zero error draws the bar through the aiming marker on the default final
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse; no new per-frame allocations

## Test plan
Unit test the helper (0 dots, +-1 dot, clamps, symmetry, distance independence with `ilsDots`);
e2e on the default final reads the debug approach and asserts the bar is centred at zero error.

## Out of scope
Changing the dot sizes, a full ILS panel, a back-course, autoland tuning.
