---
id: 0031
title: Declutter the desktop top HUD so the sky stays open
status: proposed
priority: P2
size: S
lens: player-feel
created: 2026-10-18
pr:
---

## Why
At 1280x720 three full-width bars (plane/mission/MCP, camera/sound buttons, scenario weather
strip) cover about 125 px of the top of the view, nearly 18 % of the screen, while the vision
says the HUD must never hide the horizon. During the first-flight approach the pitch ladder and
sky sit directly under them. Seen when playing on 2026-10-18.

## What
Merge the camera/sound/pause/reset buttons into the first bar's free space, and collapse the
weather strip into one compact line of wind and runway components (full METAR on hover/focus
or tap). Phone layouts are owned by tickets 0021 and 0025 and must not change here.

## Acceptance criteria
- [ ] At 1280x720 the top HUD occupies <= 70 px of height
- [ ] Every control keeps its keyboard path and visible label; contrast stays >= 4.5:1
- [ ] Phone (390x844, 844x390) layout is pixel-unchanged apart from shared styles
- [ ] Full METAR and the scenario/live label remain reachable

## Test plan
E2E at 1280x720: measure the bottom edge of the top HUD elements (<= 70 px); existing HUD,
controls and smoke tests pass.

## Out of scope
Restyling, new controls, the bottom panels.
