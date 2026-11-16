---
id: 0190
title: The aircraft casts a sun-direction shadow on the ground, so the flare has a height cue
status: shipped
priority: P2
size: M
lens: player-feel
created: 2026-11-16
pr:
---

## Why
Judging height over the runway is the hardest part of the first landing, and the game's flare
is where first-timers bounce or float. A moving shadow on the ground that grows to meet the
aircraft at touchdown is the oldest cue sims and real pilots share. There is none in the game
today (src/ has no player-aircraft shadow; the only "shadow" hits are an unrelated HUD blur).
Research on flare timing shows pilots lean on visual flow and texture over the runway rather than
on any one cue, so this is a helper, not a fix: https://www.atsb.gov.au/node/2034
(ATSB, "Investigation of Visual Flight Cues for Timing the Initiation of the Landing Flare";
read it before writing the ticket's acceptance numbers). It also adds to the world-looks-right pillar:
the Sun (src/sun.js) is already real, so the shadow falls the right way at dusk.

## What
A single blob/projected-shadow decal for the player's aircraft (not a shadow map: frame budget,
invariant 4): a flat quad textured with the aircraft's top-down silhouette (a small generated
canvas or a baked 128 px alpha), laid on terrain.js `ground.heightAt` at the point under the
aircraft displaced along the sun's direction by height / tan(sun elevation), rotated to the
airframe's heading, scaled with the wingspan, softened and faded with sun elevation (gone below
~3°, weaker under cloud cover from the METAR, none at night, none in the cockpit-hidden replay if
that looks wrong), and hidden above 600 ft AGL where it is not a cue. Reuse vectors (no per-frame
allocation). Lazy chunk after boot, like windsock.js; Kid/Learner/Pilot all see it. Draw it after
the runway decals with polygon offset so it does not z-fight (0002's lesson). `?debug`:
`window.openaeroShadow`.

## Acceptance criteria
- [x] Unit (pure helper): shadow offset on flat ground for sun elevations 10°, 45°, 80° and heights 0, 50, 300 ft equals h / tan(el) along the sun's azimuth; hidden at sun below 3° and above 600 ft AGL.
- [x] e2e: at the default final the shadow mesh exists, is visible under 300 ft AGL by day, and is hidden at night (the Night chip) and above 600 ft.
- [x] Screenshot at 1,000 ft, 50 ft and touchdown shows the shadow converging on the aircraft; nothing flickers on the runway (no z-fighting) at 1280x720 and 390x844.
- [x] No per-frame allocations (the existing hot-path allocation test stays green); the e2e perf probe's frame time is within budget on SwiftShader; boot chunk size unchanged (script `check:size`).
- [x] Reduced motion unaffected (the shadow is not an effect).

## Test plan
tests/unit/shadow.test.js (the offset and visibility helper), tests/e2e/shadow.spec.js (mesh
state by height/time), the size and perf gates in `npm run check`.

## Out of scope
Real shadow maps; shadows of traffic, buildings or clouds on the ground; photoreal tiles shadows.
