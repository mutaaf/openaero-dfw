---
id: 0131
title: PAPI colour bands follow the published setting angles, around each runway's own glidepath
status: ready
priority: P2
size: S
lens: authenticity
created: 2026-11-02
pr:
---

## Why
`aero.js papiWhiteLights` turns at 2.5 / 2.8 / 3.1 / 3.4 degrees, a fixed set for every runway.
A real 4-box PAPI is aimed at the runway's glidepath angle G with the boxes set about G-0.5, G-0.17,
G+0.17 and G+0.5 degrees (3.0 deg: 2.5, 2.83, 3.17, 3.5), so two white and two red is a +-0.17 deg
band around G, symmetric. Ours is a 0.3 deg band that starts 0.2 below 3.0 and ends 0.1 above it,
so a pilot who flies it by the book sits on the wrong side of the band's middle. Pilots check
this against the chart: sources are the FAA AIM 2-1-2
(https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap2_section_1.html) and AC
150/5345-28H (https://www.faa.gov/documentLibrary/media/Advisory_Circular/150-5345-28H.pdf).
The Builder confirms the offsets against the AC before coding. Vendor specs quote the red/white
transition at about 3 arc-minutes, so the switch is sharp, not a blend.

## What
`papiWhiteLights(slopeDeg, glideDeg = 3)` with the four boundaries at glideDeg -0.5, -0.17, +0.17,
+0.5. Pass the runway end's glidepath angle where `airports.js` knows it (default 3.0 everywhere
else; do not invent per-runway angles without data). Check every caller (main.js HUD text,
runway-light PAPI sprites in runwayLights.js, coach.js papiWhite, tests/flight kid/final cards)
and re-run `tests/flight`: Kid's final guide (3 deg, 0098) must still read 2 white, and the
coach's "two white, two red" must hold on a 3.0 deg path.

## Acceptance criteria
- [ ] Unit: 3.0 deg gives 2 white; 2.84 and 3.16 give 2; 2.82 gives 1; 3.18 gives 3; <=2.49 gives
      0; >=3.51 gives 4, for G = 3.0; the same offsets move with G = 3.2
- [ ] The HUD PAPI text and the 3D PAPI lights agree at every sampled slope
- [ ] `npm run check` green with no flight card regressed

## Test plan
Extend the 'PAPI' block in tests/unit/aero.test.js; add a coach/Kid regression asserting 2 white on
the standard final.

## Out of scope
Per-runway glide angles we have no data for, the eye-vs-wheel point of the PAPI, new light models.
