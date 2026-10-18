---
id: 0007
title: Meet the accessibility floor (reduced motion, contrast, keyboard)
status: shipped
priority: P2
size: M
lens: accessibility
created: 2026-10-16
pr: 33
---

## Why
AGENTS.md sets an accessibility floor the port doesn't meet yet: the scanline overlay,
`animate-ping` / `animate-pulse` indicators and the pulsing PULL UP banner ignore
`prefers-reduced-motion`; a lot of HUD text is 8–9px slate-500 on near-black (below 4.5:1);
and the modal and panel buttons have no visible focus ring.

## What
- Honour `prefers-reduced-motion: reduce`: disable the ping/pulse animations and the
  scanline overlay, keep alerts visible but static.
- Raise contrast for the smallest HUD labels (`text-slate-500` → a lighter token) and
  bump 8px labels to at least 10px where layout allows.
- Visible focus rings on `.hud-btn` and selects; the modal traps focus while open and
  closes on Escape.

## Acceptance criteria
- [x] With `reducedMotion: 'reduce'`, no element has a running CSS animation (e2e)
- [x] The modal can be completed with keyboard alone (Tab to "ENTER COCKPIT", Enter)
- [x] Escape closes the modal
- [x] Spot-checked HUD label colours reach 4.5:1 against their panel background

## Test plan
Playwright with `page.emulateMedia({ reducedMotion: 'reduce' })` asserting
`getAnimations().length === 0`; a keyboard-only test for the modal.

## Out of scope
Screen-reader narration of flight instruments.
