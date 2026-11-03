---
id: 0142
title: Wind box words the crosswind and tailwind for a kid ("wind from the left, push right")
status: proposed
priority: P2
size: S
lens: player-feel
created: 2026-11-03
pr:
---

## Why
The wind box shows XW/HW numbers under 1,500 ft (0075). A pilot reads them; a kid does not know
which way to correct. The FAA's Airplane Flying Handbook (FAA-H-8083-3C ch. 8, crosswind
approach and landing) teaches the correction by wind side. Kid and Learner already have plain
captions (src/captions.js plainCaption); the wind box has none.

## What
Kid and Learner: under 1,500 ft on a final, add a plain line ("Wind pushing you right", "Tail wind:
runway will feel long") beside XW/HW, from weather.js runway components. Pilot unchanged.

## Acceptance criteria
- [ ] Left/right/tail/head cases each produce the right words (unit, pure function)
- [ ] Fits the wind box at 390x844 without covering the horizon
- [ ] Pilot's box unchanged; boot JS within budget

## Test plan
Unit over the pure word picker for sign conventions; e2e sets a crosswind mission and reads the line.

## Out of scope
Changing crosswind physics; 0100 (Kid de-crab rollout).
