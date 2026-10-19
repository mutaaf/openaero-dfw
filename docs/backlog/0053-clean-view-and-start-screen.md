---
id: 0053
title: Easy to start, clear to fly: a 1-2-3 start screen and a clean view
status: in-progress
priority: P1
size: M
lens: player-feel
created: 2026-10-19
pr:
---

## Why
The start screen opened on jargon ("6-DOF", "lift/drag polars") over a long list, and in
flight three top bars and three bottom panels covered most of a 1280x720 screen. The speed
and altitude "tapes" were opaque boxes over the runway. Operator, 2026-10-19: "we still are
not easy to use".

## What
- Start screen: Who's flying? → When? (Live / Dawn / Day / Dusk / Night, with a live line
  about the sky over Dallas) → Where to?, one big Fly button; controls and options folded.
- Clean view on desktop by default: one top row (☰ Menu, telemetry incl. power and
  gear/flaps, Panels), a quiet key-hint line, nothing else; H or the button toggles the
  full panels; remembered as `openaero_view_v1`.
- HUD tapes that scroll and are see-through, with boxed readouts; no scanline overlay.

## Acceptance criteria
- [x] First visit at 1280x720: panels hidden, key hints and the top row visible
- [x] H restores the panels and the choice survives a reload
- [x] The When? picker sets the sun before the flight starts
- [x] Phone layouts keep their touch deck and menu

## Test plan
`tests/e2e/view.spec.js`, `tests/unit/viewPrefs.test.js`; existing desktop specs run in
the full view (playwright.config.js FULL_VIEW).

## Out of scope
Changing the default assist level (Pilot), new fonts.
