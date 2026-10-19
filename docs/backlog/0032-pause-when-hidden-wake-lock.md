---
id: 0032
title: Pause when the tab is hidden, keep the phone screen awake while flying
status: shipped
priority: P1
size: S
lens: tech-health
created: 2026-10-18
pr: 47
---

## Why
Nothing in `src/` reacts to `visibilitychange`: switch tabs or lock the phone mid-final and the
sim and engine audio keep running (or the browser throttles rAF and the aircraft is somewhere
else on return), so a player can come back to a crash. On a phone the screen also dims in the
middle of a 2-minute approach because there is no touch-free input to keep it awake. Screen
Wake Lock is now supported in Chrome, Safari and Firefox
(https://web.dev/blog/screen-wake-lock-supported-in-all-browsers).

## What
- On `document.visibilitychange` → hidden: pause the sim (reuse the pause path in `src/main.js`,
  line ~1750), suspend audio, mark the Menu/Pause button "PAUSED". Do not auto-resume on return;
  the player taps Resume (a landing must not start without them).
- While flying (after Enter cockpit, not paused), request `navigator.wakeLock.request('screen')`
  in try/catch; release on pause/hidden/results; re-request when visible again. Feature-detect;
  silently skip where unsupported or rejected. No new hosts, no storage.

## Acceptance criteria
- [x] Dispatching hidden visibility pauses the sim; sim time and aircraft position do not
      advance while hidden, and return shows PAUSED
- [x] Returning visible does not unpause
- [x] Wake lock is requested while flying and released when paused (stubbed `navigator.wakeLock`)
- [x] No console errors when `navigator.wakeLock` is missing or rejects
- [x] Works at 390x844 and 1280x720; no frame-time regression

## Test plan
e2e: stub `navigator.wakeLock`, start flight, assert request; override `document.hidden`/
dispatch `visibilitychange`, assert paused, sim position unchanged over 1 s, release called.
Missing-API case asserts zero console errors.

## Out of scope
Auto-resume, background audio, PWA install.
