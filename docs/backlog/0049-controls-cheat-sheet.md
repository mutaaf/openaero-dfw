---
id: 0049
title: A controls cheat sheet (keyboard, gamepad, touch) one tap or "?" away
status: ready
priority: P2
size: S
lens: accessibility
created: 2026-10-19
pr:
---

## Why
Playing the build, the only hint to the controls is a line of small text ("Press 'M' for
Mouse-Yoke flight") in the EICAS card; WASD, G, F, B, Space and the gamepad mapping are
nowhere a first-timer can find them. Games commonly provide a re-readable controls
reference (https://gameaccessibilityguidelines.com/provide-controls-reference/ , "allow controls to be remapped / show
them"). A pilot also wants to know which key is flaps.

## What
A "Controls" button (in the phone Menu and the desktop toolbar) and the `?` key open a
dismissible panel listing keyboard, gamepad (from `src/gamepad.js`) and touch controls.
Escape closes it, the sim pauses while open, focus is trapped like the start modal (0007).

## Acceptance criteria
- [ ] `?` and the Controls button open it; Escape and a Close button dismiss it and restore focus
- [ ] Lists every key bound in `main.js` (a test fails if a bound key is missing from the sheet's data)
- [ ] Fits 390x844 and 844x390 without scrolling the page, 4.5:1 contrast
- [ ] No frame-time regression, no new hosts

## Test plan
Unit test comparing the key table against the key handler's bindings; e2e opens it with `?`, screenshots, closes with Escape.

## Out of scope
Rebinding keys.
