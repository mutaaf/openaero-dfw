---
id: 0227
title: Results card: a side-view plot of the last 30 s of the approach against the 3° glidepath
status: shipped
priority: P1
size: M
lens: player-feel
created: 2026-11-26
pr: 333
---

## Why
The card says what the landing scored, not what the approach looked like. A player (or a CFI
watching) wants to see "I sat high until 200 ft, then dived": that is the one thing that makes
the next attempt different. The 30 s landing-replay buffer (`src/replay.js`, 0019) already holds
position at 20 Hz, so no new recording is needed. A glidepath-vs-profile view is how approach
quality is taught: the stabilized-approach and 3° glidepath references are FAA AC 120-71B and
the AIM 1-1-9 (PAPI/VASI, 3.00° nominal). The ground-reference lessons already have a card plot
(`src/trackPlot.js`), so the pattern (an inline SVG in results.js's chunk, no canvas, no
library) exists.

## What
For approach and landing missions only (not the drills with their own plot), draw an SVG from
the replay buffer: x = distance to the touchdown point (runway threshold + aim point, m),
y = height above the runway. Overlay the 3° path through the aim point (`airports.js
AIM_POINT_M`), the ±0.5° band the PAPI treats as on-slope, and the player's track, with the
touchdown as a dot. Put it in `#resultsBody` below the strip; it scrolls with it. Pure helper
`profilePoints(buffer, approachGeometry)` in `src/trackPlot.js`, no per-frame work (built once
when the card opens). Alt text sums it up ("above the 3° path from 1.1 NM to 0.4 NM, 80 ft high
at the threshold").

## Acceptance criteria
- [ ] Card on 35C ILS final shows the plot with the 3° line and the player's track
- [ ] A scripted high-then-dive approach plots above the band, then below it (unit)
- [ ] Fits 390x844 and 1280x720 without pushing the grade or the button row off screen (0125's flex column)
- [ ] `role="img"` with a text summary; colours also differ by dash style, not colour alone
- [ ] Not shown on drills that have their own plot, nor when the buffer holds < 5 s

## Test plan
`tests/unit/profilePlot.test.js`: points from a synthetic buffer, the band, the summary string.
e2e: fly the 35C final to the card (existing helper) and assert the SVG exists and the card's
buttons stay in the viewport at 390x844.

## Out of scope
A new recording, a replay change, sharing/export, a score change.
