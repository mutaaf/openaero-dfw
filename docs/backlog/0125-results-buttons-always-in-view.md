---
id: 0125
title: The results card's FLY AGAIN / KEEP ROLLING stay in view on a phone held sideways in Safari
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-10-31
pr:
---

## Why
iOS Safari held sideways leaves a page about 340 px tall, not the 390 px the e2e checks
(844x390). A fully loaded results card has six factors (crosswind), the reason, the next-time
tip, the gate line and the best line. On that card, at 844x340, about half of each button
sits under the card's edge (37 px of internal scroll). At 568x320 (iPhone SE held sideways)
the overflow is 57 px. Most of this was there before 0088 (about 19 px at 844x340). The 0088
panel measured it, and 0088 now hides its runway strip below 370 px tall.

## What
Keep the button row outside the card's scrolling area (a sticky bottom row in `#resultsCard`,
or a flex column whose middle scrolls), so the buttons are always in view and the factor list
scrolls if it must.

## Acceptance criteria
- [x] At 844x340, 667x325 and 568x320, with the crosswind card's six factors, reason, tip and
      gate line, FLY AGAIN and KEEP ROLLING are fully inside the viewport and ≥ 44 px tall
- [x] No change at 390x844 or 1280x720

## Test plan
tests/e2e/bounce.mobile.spec.js (or a new results.mobile spec): fill the card's lines as the
844x390 case does, then check the buttons at 844x340 and 568x320.

## Out of scope
Redesigning the card.
