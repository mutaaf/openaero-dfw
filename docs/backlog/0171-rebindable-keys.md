---
id: 0171
title: Rebindable keyboard controls, saved on this device
status: in-progress
priority: P2
size: M
lens: accessibility
created: 2026-11-11
pr:
---

## Why
The keys are fixed (W/S pitch, A/D bank, Shift/Ctrl power, G/F/B/C/H). A player who flies one-handed,
uses a non-QWERTY layout (AZERTY puts A and W elsewhere), or has a keyboard where Ctrl is taken by
the browser or OS cannot fly the way the rest can. The Game Accessibility Guidelines list "allow
controls to be remapped / reconfigured" as a basic-tier item:
https://gameaccessibilityguidelines.com/allow-controls-to-be-remapped-reconfigured/ . Invariant 7
already says every control has a keyboard path; this makes that path the player's own.

## What
`src/input.js` reads actions through a binding table (action -> list of `KeyboardEvent.code`s)
instead of literal keys; defaults equal today's keys. A small "Keys" sheet (opened from the
controls cheat sheet, `src/controlsSheet.js`) lists each action, click-then-press to rebind,
rejects a code already bound to another action (shows which), Reset to defaults. Saved as
`openaero_keys_v1 = { v: 1, map, at }` (tolerates throwing storage; unknown or invalid entries
fall back to the default). The in-flight key strip and the cheat sheet show the player's keys.
Touch and gamepad are untouched.

## Acceptance criteria
- [ ] With no saved map every key behaves exactly as before (existing input and e2e specs pass unchanged)
- [ ] Rebinding bank left to `KeyJ` makes `KeyJ` bank left and `KeyA` do nothing; it survives a reload
- [ ] Binding a code already in use is refused with the conflicting action named; Escape cancels a capture
- [ ] The cheat sheet and key strip print `event.code` as a layout-aware label (`KeyboardEvent.key` on press), not a hard-coded letter
- [ ] Corrupt or throwing storage falls back to defaults with no console error; AGENTS.md invariant 6 lists the new key
- [ ] Works at 1280x720 keyboard and does not change the 390x844 touch layout; no frame-time regression

## Test plan
`tests/unit/input.test.js`: default table equals the old keys; rebind, conflict, reset, corrupt JSON.
`tests/e2e/keys.spec.js`: rebind in the sheet, fly one frame, assert the control input moved; reload keeps it.

## Out of scope
Gamepad remapping, mouse buttons, per-aircraft maps, sharing a map between devices.
