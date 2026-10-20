---
id: 0059
title: First visit starts on Learner, not Pilot
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-10-20
pr: 59
---

## Why
Playing the build (390x844 and 1280x720, fresh profile): the start screen pre-selects
**Pilot, "the raw airplane, no help"** and the recommended first flight is the 4 NM final.
AGENTS.md's vision is a first-timer stabilized and landing within 30 s, guided by the coach.
Assists exist (0042) but a newcomer who just taps Fly gets the unassisted airplane; the kid
has to find and choose the right card. `src/assists.js` keeps Pilot as the default only so
a *returning* player keeps today's airplane. A player with no saved level is not returning.

## What
In `src/assists.js` `loadAssist()`: with no stored `openaero_assist_v1` (first visit,
storage empty or throwing) return `learner`; a stored value always wins, so existing
players, who have either a stored level or have already played, are untouched. Do not write
the default to storage until the player picks a card or flies. The start screen shows the
Learner card selected. Pilot remains one tap away. Physics untouched.

## Acceptance criteria
- [x] Fresh profile: Learner card is selected on the start screen; flying it keeps the coach on
- [x] A stored `{ v: 1, level: 'pilot' }` still loads Pilot; Kid likewise
- [x] Throwing storage (private mode) falls back to Learner without an error
- [x] Personal bests keep the right key (`@learner`), nothing written to `openaero_best` by the default alone
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse; no console errors

## Test plan
Unit (`tests/unit` for assists): empty, stored pilot/kid, malformed, throwing storage.
Update `tests/e2e/assists.spec.js` where it relies on a fresh profile being Pilot (set the
stored level explicitly there); add an e2e asserting the Learner card is selected fresh.

## Out of scope
Changing Learner's envelope, adding a fourth level, a "returning player" heuristic.
