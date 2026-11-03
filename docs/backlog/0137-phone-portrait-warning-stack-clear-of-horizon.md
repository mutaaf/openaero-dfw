---
id: 0137
title: On a phone held upright, the caption, gate banner and coach never stack over the horizon together
status: ready
priority: P1
size: M
lens: accessibility
created: 2026-11-03
pr:
---

## Why
In the Scout's 390x844 screenshot of the default final going bad, four things were on screen
at once between the top bar and the touch deck: the red "PULL UP — TERRAIN AHEAD" box
(y 80-140), a black caption "UNSTABILIZED, GO AROUND · FIVE HUNDRED · SINK RATE · TOO FAST
DOWN" (y 305-330, three lines, straight across the horizon and the speed tape's top), the
yellow "UNSTABILIZED · FAST · SINK · GLIDESLOPE" gate banner (y 498-538, over the runway
area) and the coach card. The horizon is the one thing a phone pilot needs in view (focus:
"the horizon in view in portrait"); the unstabilized gate and GPWS are exactly when several
fire together. 0130 moved the coach clear of the speed tape; the captions (0117) and banner
were not given a slot. WCAG 2.2 SC 1.4.13 / 2.2.1 spirit: transient content must not hide
what the user is acting on (https://www.w3.org/TR/WCAG22/#content-on-hover-or-focus).

## What
`src/hudLayout.js` / the caption and gate-banner elements in `index.html` and `src/main.js`:
give the caption and the gate banner one reserved band each on short upright phones (e.g. the
caption docked under the top bar next to the warning box, the gate banner as one line merged
into the coach slot), cap the caption at two lines with the newest call winning, and keep the
horizon line (y from the pitch ladder's zero line) uncovered. Desktop and landscape unchanged.

## Acceptance criteria
- [ ] At 390x844, with the caption, the GPWS warning box, the gate banner and the coach all
      shown (inject via `openaeroDebugCaption` and the gate's debug state), no two overlap, and
      none overlaps the horizon (pitch-ladder zero line ± 12 px) or the speed/altitude tapes
- [ ] At 375x548 (short upright) and 360x640 the same holds
- [ ] The caption still records every call in `window.__captions` (no lost history)
- [ ] 844x390 and 1280x720 layouts unchanged (existing specs pass)

## Test plan
Extend `tests/e2e/coachSlot.mobile.spec.js` with a "full stack" case measuring bounding boxes
against each other and the horizon element; screenshot attached to the PR.

## Out of scope
Changing what is said, GPWS timing, or desktop HUD layout (0031).
