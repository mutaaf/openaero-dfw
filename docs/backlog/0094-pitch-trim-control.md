---
id: 0094
title: A pitch trim control in Pilot (keys, a touch button, gamepad), and the over-pull falling leaf
status: shipped
priority: P1
size: M
lens: player-feel
created: 2026-10-26
pr: 116
---

## Outcome (Builder, 2026-10-29)
Trim shipped for Pilot: `[` / `]` (and Numpad 7 / 1), a NOSE UP / NOSE DN rocker beside the
touch throttle (over it on a phone held sideways) (hold it like the wheel), the gamepad's right stick on the standard mapping
(forward = nose down). It shows only where the trim is the player's: not under Kid/Learner or
a pitch-holding autopilot (they trim), not on the F-16 (fly-by-wire), not on ?fdm=jsbsim. Held,
it moves the hands-off speed 9% a second on any airframe (a game-feel rate, `src/trim.js`;
the Cessna 90 → 70 KIAS in 2.8 s), between 4° short of the stall and the hands-off speed of
Vne / Vmo (163 / 340 KIAS). An amber caret on the speed tape and "T nn" under the airspeed
show the speed a released stick flies. Flight cards: trimmed 90 → 70 and 70 → 90, then 3 min
hands off, the airspeed within 2 kt of the new speed (measured 0.5). The hold-to-trim
stand-in now helps only until the player first trims that flight.

Falling leaf: since 0102's stiffer pitch it no longer cycles. With the stick held full back
both models settle at α ~40-42° (flightModel 40.6° mean, JSBSim 41.6°), so criterion 2 (≤ 40°)
is **not met**: an `it.fails` card (ticket 0109) pins it. JSBSim here flies our own C172 on the
same Roskam linear Cmα/Cmδe (full stick = 36.7° of α past the trim), so it is not an
independent check of the depth. A shallower settle needs a cited post-stall pitching moment,
not a guess. The passing card pins no falling leaf (α swing < 5°, < 45°) and the two models
agreeing within 3°.

## Why
Found shipping 0090 (first-timer panel). Pilot is now stable in pitch about a trim angle of
attack, but there is no trim control: the spawn sets the trim and a stick held off centre
trims its pressure away over ~8 s (`src/main.js`, capped 4° short of the stall). Holding a
new speed on the keyboard means holding or pulsing W/S for a few seconds, and touch players
have no way to set it at all. Real airplanes are flown trimmed. Also still there: a stick
held fully back after a stall drives the Cessna into a falling leaf until it hits the
ground: with the stability term no longer clamped at 30° (0090's physics panel) it cycles
between α ~13° and ~69° instead of locking at 90°, still far deeper than a real 172 goes
(pitch moments scale with airspeed/120, so the tail is weak when slow).

## What
Trim up/down keys (and a gamepad mapping, a ≥44 px touch control in the touch deck) that move
`sim.trimAlphaDeg` at a believable rate; a HUD trim indicator. Reconsider the hold-to-trim
stand-in once a control exists. For the falling leaf: check the α clamp and the low-speed
scaling against JSBSim's C172 at full back stick.

## Acceptance criteria
- [ ] Keyboard, touch and gamepad can trim; a trimmed speed holds hands off (flight card)
- [ ] Full back stick after a stall does not settle at α > 40° on flightModel.js (card vs JSBSim)
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse; boot JS within budget

## Test plan
A flight card trimming from 90 to 70 KIAS; an e2e trim key and touch button run; the
full-back-stick card on both models.

## Out of scope
Electric trim runaway, trim tabs as moving parts.
