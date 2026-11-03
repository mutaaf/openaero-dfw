---
id: 0140
title: Kid and Learner see "above sea level" / "above ground" instead of MSL and AGL
status: ready
priority: P2
size: S
lens: accessibility
created: 2026-11-03
pr:
---

## Why
0132 put an MSL tab under the altitude tape and labelled the top bar's AGL. A kid or first-timer
does not know either acronym; the 0132 lesson left the plain words as a follow-up because boot JS
had 10 B of headroom. The goal is "approachable for a kid and rewarding for a pilot": the same
number should read in words a nine-year-old gets. Reference: FAA Pilot's Handbook of Aeronautical
Knowledge ch. 4 defines both terms; plain-language guidance is WCAG 3.1.5 (reading level)
https://www.w3.org/WAI/WCAG21/Understanding/reading-level.html

## What
For assist levels Kid and Learner, show "SEA LVL" under the altitude readout and "GROUND" beside
the AGL number (Pilot keeps MSL / AGL). The words live in a lazy chunk (e.g. gateVerdict.js or
a small new one) so boot JS does not grow; `hudLayout.js altCaptionRect` is unchanged.

## Acceptance criteria
- [ ] Pilot's labels are byte-identical to today's (MSL, AGL)
- [ ] Kid and Learner read plain words at 390x844 touch and 1280x720
- [ ] The caption still fits its rect (no overlap with the tape ticks) at both sizes
- [ ] Boot JS stays within the budget (`npm run check`)

## Test plan
Unit: a pure `altLabels(assistLevel)` returns the words per level. e2e: set each assist level,
read the label text, assert no overlap with the readout box via bounding rects.

## Out of scope
Translating any other HUD text; changing the numbers shown.
