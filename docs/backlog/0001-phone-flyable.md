---
id: 0001
title: Make the sim flyable on a phone
status: ready
priority: P0
size: L
lens: player-feel
created: 2026-10-16
pr:
---

## Why
On a 390x844 phone there is currently no way to fly. The 6-DOF stick panel is
`hidden lg:flex`, so it never appears below 1024px; there is no keyboard; mouse-yoke
listens to `mousemove`, which touch doesn't fire. The left EICAS and right moving-map
panels also overlap each other and cover the bottom third of the view, and the onboarding
modal is taller than the screen, so "ENTER COCKPIT" sits below the fold with
`overflow: hidden` on the body. Phones are where most people will open a link to this.

## What
- A touch flight layout for `max-width: 1023px`: an on-screen stick (reuse
  `stickFromPoint` in `src/input.js`, add multi-touch so a second thumb can work the
  throttle) and a compact throttle slider, both with ≥44px targets.
- Collapse the EICAS and moving-map panels into small toggleable chips on narrow
  screens so they never overlap or cover the horizon.
- Make the onboarding modal scroll inside itself (`max-h-[100dvh] overflow-y-auto`) so
  the start button is always reachable; respect safe-area insets.
- Split into two PRs if it gets big: (a) layout + modal, (b) touch stick + throttle.

## Acceptance criteria
- [ ] At 390x844, "ENTER COCKPIT" is reachable without scrolling the page body
- [ ] At 390x844, dragging the on-screen stick changes `#meterAil` / `#meterElev`
- [ ] At 390x844, no two HUD panels overlap and the horizon is visible
- [ ] Desktop layout at 1280x720 is unchanged (compare screenshots)
- [ ] No frame-time regression (e2e perf probe within budget)

## Test plan
Extend `tests/e2e/mobile.spec.js`: tap-and-drag the stick with `page.touchscreen`, assert
the meters change; assert panel bounding boxes don't intersect; assert the start button's
box is inside the viewport.

## Out of scope
Device-tilt (gyro) steering (gamepad is ticket 0009).
