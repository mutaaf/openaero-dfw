---
id: 0230
title: Fly against a ghost of your best landing on the same mission
status: proposed
priority: P2
size: M
lens: player-feel
created: 2026-11-27
pr:
---

## Why
Racing your own best line is the cheapest "one more go" there is: no server, no leaderboard, no
account. Racing games have used it since the 1980s (Pole Position's Time Trial, later Mario Kart
ghosts). Here the ghost is the aircraft's own flight: you see how much higher or lower you are
than the best one at the same distance from the threshold. Blocked on 0229 (the stored track).

## What
- When a mission starts and `openaero_besttrack_v1` has a pack for its key, `ghost.js` (lazy chunk)
  draws a translucent aircraft silhouette (the existing low-poly shape, one draw call, no shadow)
  that flies the pack at real speed from the first sample.
- The HUD gets one chip, "GHOST ±N ft" (height above or below the ghost at your distance from the
  threshold), plain words on Kid. Hidden after touchdown, in the replay, behind the start screen.
- Options chip "Ghost: on/off" remembered in `openaero_prefs_v1`; off by default for Kid and on a
  mission with no stored track. Reduced motion: the ghost is a static dot on the path, not moving.

## Acceptance criteria
- [ ] With a stored pack the ghost appears and follows its recorded path within 2 m
- [ ] The chip's sign is right: above the ghost reads +, below reads −
- [ ] No ghost with no pack, with the toggle off, in the replay, or in flight missions that
      start airborne past the pack's start
- [ ] At 390x844 the chip clears the speed tape and the horizon (hudLayout helper, not a magic x)
- [ ] No frame-time regression (e2e perf probe in budget); boot JS unchanged (lazy)

## Test plan
Unit: the ghost position at time t, the height-delta sign. e2e: store a pack, start the mission,
read the ghost's position and chip from `?debug`; toggle off removes both.

## Out of scope
Ghosts from other players. Ghost for takeoff or pattern missions. Any network.
