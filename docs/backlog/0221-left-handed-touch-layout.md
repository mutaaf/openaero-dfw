---
id: 0221
title: Left-handed touch layout: swap the stick and throttle sides
status: shipped
priority: P2
size: S
lens: accessibility
created: 2026-11-24
pr:
---

## Why
On a phone the throttle sits under the left thumb and the stick under the right (play-tested at
390x844, 2026-11-24). A left-handed player flies the fine axis (the stick) with their weaker thumb
and has no way to change it: nothing in `src/` or `index.html` mirrors the controls. Mirroring is the
standard touch-game accessibility option, and the layout already follows safe-area insets so both
sides are known to fit.

## What
A "Controls: Right-handed / Left-handed" chip in the start screen's settings area. Left-handed
swaps #touchThrottle (and the flap/gear/brake column) with #touchStick via a root class (`lefty`) in
CSS, no markup duplication. Stored as `openaero_hand_v1 = { v: 1, left, at }` in a new tiny module
(like `src/viewPrefs.js`), tolerant of throwing storage; AGENTS.md invariant 6 lists the key.
Landscape and portrait; the safe-area insets and the 44 px targets hold on both sides.

## Acceptance criteria
- [x] With the chip on, the stick's centre is left of the throttle's at 390x844 and 844x390, and
      the buttons' column swaps with it; nothing overlaps the HUD (e2e bounding boxes)
- [x] Choice survives a reload; invalid or missing storage falls back to right-handed
- [x] Every control still >= 44 px; no page scroll; touch-only layout rule unchanged
- [x] Desktop and gamepad unaffected (chip hidden when not touch)

## Test plan
Unit test for the prefs module (invalid, throwing storage); e2e at both phone orientations
asserting the swapped boxes and 44 px targets.

## Out of scope
Rebinding individual controls (0171 covers keys); a gesture to flip in flight.
