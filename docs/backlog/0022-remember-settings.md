---
id: 0022
title: Remember sound, camera and last mission between visits
status: proposed
priority: P2
size: S
lens: player-feel
created: 2026-10-17
pr:
---

## Why
Only personal bests are persisted today (`src/landing.js`). Every visit the player re-picks
the mission, re-enables sound and re-selects their camera. A replay-worthy game should
reopen where you left off with one tap.

## What
New module `src/prefs.js` storing `localStorage['openaero_prefs'] = { v: 1, sound, camera,
mission, plane }`, read at boot (validated, unknown/garbled data ignored, storage that
throws tolerated) and written on change. The onboarding modal pre-highlights the last
mission and its primary button reads "Continue: <mission>".

## Acceptance criteria
- [ ] `prefs.js` is pure over an injected storage object (unit-tested: roundtrip, corrupt JSON, wrong `v`, throwing storage)
- [ ] Reload restores sound toggle, camera and highlighted mission (e2e)
- [ ] `openaero_best` is untouched
- [ ] Sound still starts only after a user gesture (autoplay policy)
- [ ] No console errors with storage disabled

## Test plan
Unit tests above; e2e sets camera, reloads, asserts restored; e2e with storage stubbed to throw boots clean.

## Out of scope
Cloud sync, accounts, settings screen.
