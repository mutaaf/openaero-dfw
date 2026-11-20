---
id: 0213
title: Left-handed touch layout: swap the throttle and the stick thumbs, remembered
status: ready
priority: P2
size: M
lens: accessibility
created: 2026-11-20
pr:
---

## Why
The phone layout fixes the stick under the right thumb and the throttle under the left (the "How to fly"
text: "Right thumb: the stick... Left thumb: throttle"). Roughly one player in ten is left-handed, and many
hold a phone in whichever hand is free, so a fixed right-hand stick makes the precise control (the stick) the
harder one for them. Today there is no handedness setting: a search of `src/` and `index.html` finds no
swap or mirror option. Apple's guidance for game interfaces on phones also says controls should be reachable
by thumbs at the edges and adapt to the screen: https://developer.apple.com/documentation/metal/adapting-your-game-interface-for-smaller-screens.md

## What
A "Controls: right-handed / left-handed" toggle in the Settings area of the menu. Left-handed mirrors the touch
layout in landscape and portrait: the stick on the left, the throttle and the gear/flaps/brakes/ILS column on
the right, and the HUD tapes unchanged. Persist it with the existing remembered-settings code (0022). Touches the
touch-controls layout (CSS and the pointer-region code in `src/` that decides which half of the screen starts
the stick) and the menu.

## Acceptance criteria
- [ ] The toggle appears on touch devices only and defaults to right-handed (nothing changes for anyone who ignores it).
- [ ] With left-handed on, a drag that starts in the left stick area steers, and the throttle slider on the right moves the throttle; the old regions no longer capture the opposite control.
- [ ] No overlap between the controls, the HUD tapes, the coach and the credits at 390x844, 844x390, 820x1180 and 1180x820 in both modes.
- [ ] The choice survives a reload.
- [ ] Gamepad and keyboard behaviour is unchanged.

## Test plan
A Playwright touch spec at the phone projects: enable left-handed, reload, drag in the left stick area and assert
the aileron or pitch input moved (via the debug state), drag the right throttle and assert the throttle changed,
and assert the bounding boxes do not overlap; plus a persistence assertion.

## Out of scope
Rebinding the buttons individually; a thumb-reach heat map; desktop.
