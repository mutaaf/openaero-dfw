---
id: 0132
title: Touchdown you can feel: tyre chirp and a puff of smoke that scale with the sink rate
status: proposed
priority: P2
size: M
lens: player-feel
created: 2026-11-01
pr:
---

## Why
A landing is the game's payoff, but the contact itself is silent and invisible: the wheels
meet the runway and only the results card says how hard. A soft touchdown should chirp
softly, a firm one thump with a puff of tyre smoke behind the mains, which is how real
touchdowns read from the tower and why replayability studies (e.g. Game Feel by Steve Swink)
lean on small, immediate feedback. Smoke puffs and sound need no network.

## What
Per main-wheel first contact (gear.js already reports per-wheel loads), `audio.js` plays a
short synthesized chirp/thump scaled by the touchdown sink rate; a pooled sprite puff
(no per-frame allocation, 4-6 sprites reused) at each main wheel fading in under 1.5 s,
skipped under `prefers-reduced-motion` (sound still plays). Not in Kid's soft-landing
beyond a light chirp. Lazy chunk; no boot growth beyond the hook.

## Acceptance criteria
- [ ] A 100 fpm touchdown makes a light chirp, a 600 fpm one a heavy thump and a visible puff
- [ ] No sprite or buffer allocated per frame; pool reused over repeated bounces
- [ ] Reduced-motion: no puff, sound unchanged; sound off: silent but puff stays
- [ ] Frame time not regressed (perf probe)

## Test plan
Unit: pure `touchdownFeel(sinkFpm)` → { gain, puffs }. e2e: debug hop (`openaeroDebugHop`)
shows a puff sprite visible after contact.

## Out of scope
Skid marks, wheel spin-up, tyre wear.
