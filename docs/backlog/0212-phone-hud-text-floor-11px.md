---
id: 0212
title: Phone HUD text floor: the IAS, height, V/S and PAPI readouts and the coach label are 9-10 px; none below 11 px
status: ready
priority: P1
size: S
lens: accessibility
created: 2026-11-20
pr:
---

## Why
The operator's focus asks for a readable game on iPhone, iPad and Android. Playing the 2026-11-20 build at
390x844 and 844x390 (touch, in flight on the KDFW 35C final) and listing every visible text node under 11 px
gave: the phone top stack's four readouts (`#txtPhoneIas`, `#txtPhoneAgl`, `#txtPhoneVs`, `#txtPhonePapi`)
and their labels at **10 px**, the throttle readout `#txtTouchThr` at 10 px, the coach's label
`#txtCoachLabel` at **9 px**, and the credits line at 8 px. The speed, height and sink rate are the numbers
a first-timer reads every second on final, so they are the worst place to be smallest.
Apple's typography guidance lists 11 pt as the minimum text size on iOS and iPadOS (17 pt default):
https://developer.apple.com/design/human-interface-guidelines/typography.md ; its game-interface note says to
keep text at or above that minimum: https://developer.apple.com/documentation/metal/adapting-your-game-interface-for-smaller-screens.md

## What
Raise the in-flight phone text to a floor of 11 px (the readouts' values larger, about 14-16 px, the labels 11 px),
keeping the top stack inside its current box height budget (it must not push down into the horizon or the coach:
the portrait horizon-in-view spec stays green). The 8 px credits line is legally required attribution, so it
only needs to reach 10-11 px if it still fits on one line, else it stays and is listed in the test as an
explicit, commented exception. Touches `index.html` (the `text-[10px]`/`text-[9px]` classes on the phone stack,
`#txtTouchThr`, `#txtCoachLabel`) and its CSS only; no logic.

## Acceptance criteria
- [ ] In flight at 390x844 and 844x390 (touch), no visible HUD text node except the named credits exception has a computed font size under 11 px.
- [ ] The four phone readout values are at least 14 px.
- [ ] The top stack, the coach card and the controls do not overlap at 390x844, 844x390, 820x1180 and 1180x820 (existing layout specs pass unchanged).
- [ ] The horizon is still in view in portrait (0044's spec passes).
- [ ] No frame-time regression (e2e perf probe within budget); boot JS budget unchanged (CSS/HTML only).

## Test plan
A Playwright spec (`tests/e2e/`, phone and tablet projects): start the default flight, then evaluate every
visible text-bearing element's computed `font-size`, and assert the minimum is at least 11 px (with the credits
exception listed by id) and that `#txtPhoneIas` etc. are at least 14 px. Failing on main first.

## Out of scope
Dynamic Type or an in-game text-size slider (a possible follow-up); the desktop HUD; the menu panel.
