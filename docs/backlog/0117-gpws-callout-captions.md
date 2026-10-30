---
id: 0117
title: Caption every spoken GPWS and takeoff callout on screen
status: shipped
priority: P2
size: S
lens: accessibility
created: 2026-10-30
pr: 136
---

## Why
The altitude, "sink rate", "retard", "minimums" and takeoff callouts (80 kt, V1, rotate) are
spoken only (`audio.callout`); the screen shows the coach card and the PULL UP / TOO LOW banner but
not the words said. A deaf or hard-of-hearing player, or anyone playing muted on a phone in public,
loses the real-cadence GPWS that pillar 4 sells. WCAG 2.2 SC 1.2.1/1.2.2 expect spoken information
to have a text equivalent:
https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html

## What
A single caption line near the top of the flight view (below the HUD top bar, above the horizon
box, clear of the coach card at 390x844) that shows each callout's words for ~1.2 s as `audio.callout`
speaks them, whether or not sound is on. Reduced-motion: no animation, plain show/hide. Reuse
one DOM node; no per-frame allocation (set text only when it changes). Touches `src/audio.js`
(emit a callback/event with the text), `src/main.js` + `index.html` + `src/styles.css`.
Check the boot JS budget (`npm run check:fast`); move code to a lazy chunk if over.

## Acceptance criteria
- [ ] Every string passed to `audio.callout` appears in the caption line, with sound off too
- [ ] The line never overlaps the coach card, banner or heading box at 1280x720, 390x844, 844x390
- [ ] Text meets 4.5:1 contrast on its background
- [ ] Boot JS stays within the budget; no new console errors

## Test plan
Unit: the caption helper shows, then clears after its timeout, and ignores repeated identical text
within the window. E2E: fly the debug final (`openaeroDebugFinal`), assert the caption element
shows "FIVE HUNDRED"-style text as AGL crosses each callout, with speech stubbed; layout rectangles
do not intersect at the three viewports.

## Out of scope
Captions for engine/wind sound, a settings toggle, other languages.
