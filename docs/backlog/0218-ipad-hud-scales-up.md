---
id: 0218
title: The canvas HUD scales up on an iPad, so the tapes and readouts are not postage stamps
status: ready
priority: P1
size: M
lens: accessibility
created: 2026-11-23
pr:
---

## Why
The people to impress hold an iPad. Played headless at 820x1180 (iPad Air portrait) on the
default KDFW 35C final, the canvas HUD is drawn at phone size: the speed and altitude tapes are
~60 px wide, 180 px tall and use 12 px monospace, centred in a 1180 px-tall screen, with the
pitch ladder and the heading box to match. At arm's length on a 10.9" tablet that is about
half the angular size of the same HUD on an iPhone, and the DOM chrome around it (top bar,
coach, touch deck) is already larger. Every canvas offset is in fixed CSS pixels
(`SPEED_TAPE_X`, `ALT_TAPE_X`, `TAPE_TOP`, `ALT_BOX` in `src/hudLayout.js`; `renderHud()` in
`src/main.js`), and 0044's device probe only checks that nothing overlaps or hides the horizon.
It never checks that the readouts are big enough to read. Apple's HIG asks for text a viewer
can read at a glance on any device size; WCAG 2.2 SC 1.4.4 asks that text can be resized.

## What
Give `hudLayout.js` a pure `hudScale(w, h)`: 1 up to 600 px on the short side, rising smoothly to
a cap of about 1.5 at 1024 px (iPad Pro 12.9 portrait), never below 1 (phones keep today's
geometry byte for byte, so 0130/0136/0137/0217 stay exact). `renderHud()` draws in a virtual
`w/s × h/s` space under `hudCtx.setTransform(s, 0, 0, s, 0, 0)`; the pieces that read the tape
geometry from outside the canvas (`hudTapes`, the altitude caption, the coach slot,
the warning stack, `?debug` publishes) multiply by `s`. Desktop 1280x720 has a short side of 720
and gets ~1.1: check the desktop top HUD (0031) still fits, or cap desktop (fine pointer) at 1.
Touches `src/hudLayout.js`, `src/main.js` (renderHud and its readers), `tests/unit/hudLayout.test.js`.

## Acceptance criteria
- [ ] `hudScale` is 1 at 360, 375, 390, 430 px wide phones (portrait) and at 844x390 landscape.
- [ ] At 820x1180 and 1024x1366 the speed tape is at least 1.3x and 1.5x its phone size; screenshots attached to the PR.
- [ ] No HUD element overlaps another or the horizon band at 820x1180, 1180x820, 1024x1366 (devices.spec.js rows pass).
- [ ] The MSL tab, the stall banner, the TRK box and the coach slot still line up with the tapes (e2e geometry via `?debug`).
- [ ] Desktop 1280x720 mouse layout unchanged (or scaled and re-verified), no frame-time regression in the perf probe.

## Test plan
Unit: `hudScale` table (phone widths = 1, monotone, capped). e2e `devices.spec.js`: add a
check that the published speed-tape width is >= 1.3x at 820 wide and exactly 1x at 390.

## Out of scope
A user HUD-size setting (separate ticket if wanted); DOM chrome sizes; landscape phone.
