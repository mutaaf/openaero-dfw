---
id: 0050
title: Active touch buttons (GEAR DN, THR %) stay readable over bright ground
status: ready
priority: P1
size: S
lens: accessibility
created: 2026-10-19
pr:
---

## Why
Found by the Validator on 2026-10-19 (build of 4792fd4, Chromium 390x844 touch, screenshot
of the first 10 s of flight on the default 35C final): the `GEAR DN` touch button and the
`THR 23%` throttle label are nearly unreadable over bright terrain. `.hud-btn.active` is a
28 %-alpha emerald over whatever is behind it, and its label is emerald-400/300 text, so
over light-green ground the contrast is about 1.2:1 (computed from the palette; AGENTS.md
§ Invariants 7 asks for 4.5:1 on HUD backgrounds). `lowContrastLabels` in the e2e helpers
composites over the page's dark background (#020617), so it never sees this case. A kid
cannot tell whether the gear is down, the one thing the landing coach asks about.

## What
Give `.hud-btn.active*` (and the throttle readout label) an opaque or near-opaque backing
(alpha ≥ 0.85 over `#0f172a`, keeping the coloured border and glow) so the label meets
4.5:1 on any ground. Touches `src/styles.css`, possibly `index.html` for the THR label.

## Acceptance criteria
- [ ] With the page background forced to white, `GEAR DN`, `FLAPS`, `BRAKES`, `ILS AUTO` and
      the THR label all have ≥ 4.5:1 contrast against their composited backgrounds
- [ ] Works at 390x844 and 844x390 touch and 1280x720
- [ ] Screenshot over the default (green) stub tile shows `GEAR DN` legible

## Test plan
Extend the e2e contrast check (`lowContrastLabels`) to composite over a bright backdrop
for `.hud-btn.active` elements.

## Out of scope
HUD tape colours; the coach copy.
