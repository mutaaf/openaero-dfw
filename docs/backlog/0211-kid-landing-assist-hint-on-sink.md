---
id: 0211
title: Kid: a gentle "ease the nose up" nudge when the flare is late instead of a hard landing grade surprise
status: ready
priority: P2
size: S
lens: player-feel
created: 2026-11-19
pr:
---

## Why
Focus: assist levels so a kid can land. The landing coach has a flare cue (0073) and the results card names one
fix for next time (0061), but a first-timer still learns about a late flare only after the fact. A one-time,
plainly-worded nudge ("Nose up a little now") when a Kid-level flight is below 30 ft AGL with sink beyond the
coach's flare band gives the success moment without removing the lesson, and the grade stays honest.

## What
In `coach.js` / `landing.js`: on Kid, once per flight, when radar altitude < 30 ft and descent rate is more than 100
fpm over the flare schedule's target, show the existing coach caption plus the existing flare cue pulse. Never
alters controls or physics; Learner and Pilot unchanged; the grade ignores that it fired.

## Acceptance criteria
- [ ] Fires at most once per flight, only on Kid, only in the stated band
- [ ] The landing grade for a given touchdown is identical with the nudge on or off
- [ ] Caption readable at 390x844 and clear of the speed tape

## Test plan
Unit test on the trigger predicate with scripted sink profiles; e2e on the Kid touch landing asserts one caption.

## Out of scope
Auto-flare (0101 already covers the 737).
