---
id: 0094
title: A pitch trim control in Pilot (keys, a touch button, gamepad), and the over-pull falling leaf
status: proposed
priority: P1
size: M
lens: player-feel
created: 2026-10-26
pr:
---

## Why
Found shipping 0090 (first-timer panel). Pilot is now stable in pitch about a trim angle of
attack, but there is no trim control: the spawn sets the trim and a stick held off centre
trims its pressure away over ~8 s (`src/main.js`, capped 4° short of the stall). Holding a
new speed on the keyboard means holding or pulsing W/S for a few seconds, and touch players
have no way to set it at all. Real airplanes are flown trimmed. Also still there: a stick
held fully back after a stall drives the Cessna to α 80–90°, a falling leaf, until it hits the
ground (the stability term is clamped at 30° of α, and pitch moments scale with airspeed/120).

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
