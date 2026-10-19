---
id: 0044
title: Device-class probe for iPhone, iPad and Android (layout + throttled frame time)
status: ready
priority: P1
size: M
lens: performance
created: 2026-10-18
pr:
---

## Why
The people to impress are on phones and tablets, but CI only measures a 1280x720
desktop and checks layout at 390x844. iPad (820x1180 / 1180x820), phone landscape and
Android sizes are untested, and a desktop frame time says little about an A15 or a
mid-range Android. The Validator and the Builder's panel need one command for this.

## What
A Playwright project `devices` (not in the default gate's critical path; runs alone like
`perf`): iPhone 15 (390x844 + 844x390), iPad Air (820x1180 + 1180x820), Pixel 8
(412x915), touch + 4x CPU throttle via CDP. Per device: boot, start the default
mission, fly 5 s; assert no console errors, no page scroll, HUD boxes don't overlap
each other or the screen centre (horizon), every control ≥ 44 px; record frame times
and write screenshots. Results table in `docs/PERF.md`. Camera FOV adapts to aspect
(wider vertical FOV in portrait so the horizon and runway stay in view).

## Acceptance criteria
- [ ] `npx playwright test --project=devices` passes on all five sizes
- [ ] Portrait iPad and iPhone show the runway and horizon on the default final (screenshot)
- [ ] `docs/PERF.md` has a device table
- [ ] No frame-time regression (e2e perf probe within budget)

## Test plan
`tests/e2e/devices.spec.js` with overlap/target-size assertions; screenshots attached
in CI.

## Out of scope
Real-device farms (BrowserStack etc. are new hosts); WebGPU.
