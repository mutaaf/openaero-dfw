---
id: 0021
title: Collapse the phone's four-panel top HUD stack so the sky is playable
status: ready
priority: P1
size: S
lens: player-feel
created: 2026-10-17
pr:
---

## Why
Scout playthrough at 390x844: the brand/missions bar, the camera/sound/pause/reset bar, the
scenario-weather line and the IAS/AGL/VS/PAPI strip are four stacked panels covering the
top ~210 px (25% of the screen) before play starts, and the IAS/ALT tapes sit right under
them. On a phone the player flies by the horizon and the runway ahead, so that is the
view that matters. Camera/Sound/Pause/Reset are rarely touched mid-flight. Thumb-reach guidance:
primary controls low, rarely used controls tucked away (general principle; see WCAG 2.2
SC 2.5.8 target size, https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

## What
At phone width only (`index.html`, `src/styles.css`): keep the single IAS/AGL/VS/PAPI strip
visible, fold brand, mission, camera, sound, pause, reset and the weather line into one
"☰ Menu" button (44 px target) that opens a compact sheet; weather line shows as a one-line
ellipsis chip only inside the sheet. Desktop layout unchanged. Touch targets stay >= 44px.

## Acceptance criteria
- [ ] At 390x844 the occupied top region is <= 110 px tall at mission start
- [ ] Every folded control is still reachable in <= 2 taps and keeps its existing element ids/behaviour (existing e2e still pass)
- [ ] Nothing overlaps the speed/altitude tapes or the horizon line (bounding-box assertion)
- [ ] Desktop 1280x720 screenshot unchanged
- [ ] No console errors

## Test plan
Extend the phone e2e: measure the bottom of the top HUD, assert <= 110, open the menu and
click Pause, assert paused.

## Out of scope
Redesigning the desktop HUD, changing the touch deck.
