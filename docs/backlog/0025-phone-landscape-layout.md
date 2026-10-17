---
id: 0025
title: Make the phone landscape (844x390) layout flyable
status: ready
priority: P1
size: M
lens: accessibility
created: 2026-10-17
pr:
---

## Why
Scout played the 2026-10-17 build at 844x390 (a phone held sideways, how most people
fly a sim). The coach banner sits on top of the speed/altitude readouts, the gear/flaps/
brakes/ILS button column floats over the HUD tapes and the horizon, and the top
stacks eat a third of the screen height. Pillar 1 says the HUD never overlaps itself and
never hides the horizon; only portrait 390x844 is covered today.

## What
Add a landscape-phone layout (`@media (orientation: landscape) and (max-height: 480px)`)
in `src/styles.css` / `index.html`: throttle left edge, stick right edge, the four
function buttons as one compact row or a narrow column at the screen edge (not the
centre), top stack collapsed into one slim bar, coach banner above the horizon band
and below the top bar, HUD tapes unobstructed. Touch targets stay ≥44 px.

## Acceptance criteria
- [ ] At 844x390 and 667x375 (touch), no two visible HUD/control elements' bounding boxes overlap (except the intended canvas HUD drawing)
- [ ] The centre 40% width x 30% height around the horizon stays free of DOM overlays
- [ ] All touch targets ≥44x44 px; no page scroll; safe-area insets respected
- [ ] 390x844 and 1280x720 layouts unchanged

## Test plan
New `tests/e2e/phone-landscape.spec.js`: load at 844x390 with `hasTouch`, enter the cockpit, collect bounding boxes of visible `button`, panels and the coach, assert pairwise non-overlap and the free horizon box; attach a screenshot.

## Out of scope
Tablet layouts, orientation lock, new controls. Related: 0021 (portrait top stack).
