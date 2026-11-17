---
id: 0192
title: Honour prefers-contrast: more (a firmer HUD for low-vision players)
status: ready
priority: P2
size: S
lens: accessibility
created: 2026-11-17
pr:
---

## Why
AGENTS.md invariant 7 covers reduced motion and 4.5:1 text, but the HUD is translucent glass
(`rgba(10, 15, 29, 0.85)` plus a blur) over bright satellite imagery, and nothing responds to the OS's own
contrast setting (iOS "Increase Contrast", Windows "Contrast themes", Android high contrast text), which is
exactly what a low-vision player over a bright day scene turns on. WCAG 2.2 SC 1.4.3 / 1.4.11
(https://www.w3.org/TR/WCAG22/#contrast-minimum, https://www.w3.org/TR/WCAG22/#non-text-contrast) and the CSS
Media Queries 5 `prefers-contrast` feature (https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-contrast).

## What
In `src/styles.css` add `@media (prefers-contrast: more)` (and `forced-colors: active` for panels and buttons): `.hud-glass`
opaque (alpha 1, no blur), borders 2 px in a light colour, secondary text raised to the primary token, focus rings
unchanged. No layout change: boxes keep their sizes, so the 390x844 no-overlap guarantee holds.

## Acceptance criteria
- [ ] With `page.emulateMedia({ contrast: 'more' })` the `.hud-glass` background alpha is 1 and the contrast of every HUD text over its own box (existing accessibility spec's probe) is >= 7:1
- [ ] Without it, nothing changes (the existing accessibility and layout specs pass unchanged)
- [ ] 390x844 and 1280x720 element rectangles are identical with and without the query (no reflow)
- [ ] No new JS at boot

## Test plan
Extend `tests/e2e/accessibility.spec.js`: emulate `contrast: 'more'`, assert the computed alpha and the 7:1 probe;
compare bounding boxes of the HUD cells to the default run.

## Out of scope
A settings toggle; recolouring the PAPI or the sky; colour-vision modes.
