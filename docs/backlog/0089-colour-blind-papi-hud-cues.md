---
id: 0089
title: Colour-blind and low-vision pass on the PAPI and HUD cues
status: proposed
priority: P2
size: M
lens: accessibility
created: 2026-10-24
pr:
---

## Why
About 1 in 12 men have a colour-vision deficiency, and the sim's central landing cue is
red/white PAPI lights plus green/amber HUD text. WCAG says colour must not be the only
means of conveying information ([WCAG 2.2 SC 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)).
Invariant 7 sets a floor; this raises it for the one cue a landing depends on.

## What
Audit PAPI (3D lights and HUD text), ILS bars, stabilized-gate and GPWS banners for
colour-only meaning. Add a redundant non-colour cue: the HUD PAPI readout already says
"ON GS"; add a high/low/on glyph (up arrow / down arrow / bar) beside each state, and a
shape difference between the red and white PAPI lamps' HUD icons. Add a `?cvd` test hook
only if needed for tests; no setting UI unless the audit says it is required.

## Acceptance criteria
- [ ] Every HUD state that is red/amber/green also differs by glyph or text (audit table in the PR)
- [ ] A simulated deuteranopia screenshot of the final shows the PAPI state is still readable from the HUD
- [ ] Contrast stays at least 4.5:1 on HUD backgrounds; no layout shift at 390x844

## Test plan
Unit test that each PAPI state maps to a distinct glyph; e2e screenshot under CDP
`Emulation.setEmulatedVisionDeficiency` (deuteranopia) with an assertion on the glyph text.

## Out of scope
A full colour theme picker; changing the real PAPI lamp colours in the 3D scene.
