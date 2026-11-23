---
id: 0217
title: The speed and altitude tapes fit inside a 360 or 375 px phone, readouts and all
status: ready
priority: P1
size: M
lens: player-feel
created: 2026-11-23
pr:
---

## Why
The focus asks for a readable game on iPhone, iPad and Android. At 360x640 (see the Scout's headless screenshot,
2026-11-23) the left speed readout box is cut at the screen edge and the altitude readout "1719" is clipped on the
right; at 360x800 and 375x667 the same. The cause is fixed geometry: `src/hudLayout.js` puts the speed tape's inner
edge at cx - 131 and the altitude tape's at cx + 130, with a 56 px altitude readout 8 px beyond it, and `drawTape`
(src/main.js) is 60 px wide plus the speed readout to its left. That needs ~190 px each side of the centre, i.e.
380 px, so it only fits at 390 px and up, which is all the device matrix tests. Reading airspeed and altitude is
the point of a HUD; a number half off the screen on the commonest Android width is a bug.

## What
Make the tape offsets a function of the canvas width: keep -131 / +130 where cx >= 190, and move the inner edges
toward the centre (never closer than the TRK heading box and the velocity vector allow) so the outer edge of each
readout stays >= 4 px inside the screen, with the heading box and the SPD bug following (hudLayout.js is pure and
tested; main.js drawTape, the heading box and gateVerdict use SPEED_TAPE_X / ALT_TAPE_X, so route them through
one helper). Keep the horizon visible: the existing 0137 / 0044 horizon-clear checks must hold at the new sizes.
No new HUD elements.

## Acceptance criteria
- [ ] At 360x800, 360x640 and 375x667, the speed readout, altitude readout and both tapes' scale are fully inside
      the viewport (a unit test on the layout helper, and an e2e bounds check from the HUD's published geometry)
- [ ] At 390x844 and wider the tape x positions are identical to today (no pixel change, existing hudLayout tests green)
- [ ] The tapes still clear the horizon band and do not overlap the TRK box, the coach, the gate verdict or the touch deck
- [ ] Works at 360x800 touch and 1280x720 keyboard/mouse

## Test plan
`tests/unit/hudLayout.test.js`: for widths 320..480 the outer edges are inside [4, width-4] and equal today's
values from 390 px up. `tests/e2e/devices.spec.js`: add 360x800 and 375x667 to the matrix (0216 adds the credit
checks) and assert the existing horizon/tape/box overlap checks pass for them.

## Out of scope
Redesigning the HUD; 320 px screens; the credit line (0216).
