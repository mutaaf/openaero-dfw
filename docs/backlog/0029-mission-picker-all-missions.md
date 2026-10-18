---
id: 0029
title: Start screen lists every mission, grouped by airport, with your best grade
status: proposed
priority: P1
size: M
lens: content
created: 2026-10-18
pr:
---

## Why
`src/missions.js` defines 14 missions (approaches to 6 airports, a takeoff, two tours) but the
start modal in `index.html` hard-codes only 5 cards; the other nine are reachable only through
the small MISSION dropdown in the toolbar. A first-timer never learns that Love Field over
downtown, short-field Addison or Meacham exist, and personal bests (ticket 0012) are invisible
until after a landing. Seen when playing the build at 1280x720 and 390x844 on 2026-10-18.

## What
Generate the mission cards from `MISSIONS` instead of hard-coding them: a "Recommended" card on
top, then groups per airport (KDFW, KDAL, KADS, KAFW, KFTW, KGKY) and tours. Each card shows
its label, a one-line description, and the stored personal-best grade from `src/landing.js`
(read-only, tolerate throwing storage). On phone the list scrolls inside the modal and the
Enter cockpit button stays pinned and visible (>=44px). Touches `index.html`, `src/missions.js`
(add a `blurb` per mission), `src/main.js` (render + wiring), `src/landing.js` (read helper).

## Acceptance criteria
- [ ] Every key in `MISSIONS` has exactly one card; adding a mission adds a card with no HTML edit
- [ ] Cards show the personal-best grade when one exists, nothing when none
- [ ] At 390x844 Enter cockpit is visible without scrolling the page; cards scroll within the modal
- [ ] Existing e2e tests that click the old cards still pass or are updated with the same intent
- [ ] No frame-time regression

## Test plan
Unit: a pure `groupMissions()` returns every key once, grouped by airport. E2E: open the modal,
assert card count equals `MISSIONS.length`; seed `openaero_best` and assert the grade renders;
390x844 screenshot check that the button is inside the viewport.

## Out of scope
Unlock progression, new missions, leaderboards.
