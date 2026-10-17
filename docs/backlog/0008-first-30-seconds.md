---
id: 0008
title: Coach a first-time player to a landing in the first 30 seconds
status: shipped
priority: P1
size: M
lens: player-feel
created: 2026-10-16
pr: 22
---

## Why
The modal is a wall of text and a keyboard cheat-sheet. A casual player clicks
"ENTER COCKPIT", faces a busy HUD at 1,300 ft on final, and usually flies into the ground
or stalls without knowing why. The PAPI and velocity vector are the right tools, but
nothing points at them.

## What
A short, skippable coach for the default `kdfw_35c_final` mission: three or four
contextual prompts that appear on the HUD as the situation arises ("Keep two white, two
red on the PAPI", "Ease the nose down, you're high", "Flare now: back on the stick",
"Idle the throttle"), driven by the existing PAPI state, AGL and sink rate. Ends with a
landing grade on touchdown. The `#touchdownBanner` markup (sink rate, IAS, G) already
exists in `index.html` but nothing ever shows it; wire it up so a good landing feels earned. Remember "seen the coach" in `localStorage` (`openaero_coach_v1`).

## Acceptance criteria
- [x] First visit: coach prompts appear on the default mission; a "Skip" control dismisses them
- [x] Second visit: the coach doesn't show unless re-enabled from the modal
- [x] Touchdown shows a grade derived from sink rate (unit-tested thresholds)
- [x] Works at 390x844 and 1280x720

## Test plan
Unit test the coach state machine and landing grade (pure functions in a new
`src/coach.js`). E2e: load with empty storage, assert the first prompt appears; reload,
assert it doesn't.

## Out of scope
Full tutorial missions for takeoff or the F-16.
