---
id: 0149
title: Tyre rumble and brake sound on the ground roll
status: shipped
priority: P2
size: S
lens: player-feel
created: 2026-11-04
pr: 230
---

## Why
On the runway the game is silent except the engine and wind: a landing roll at 130 kt and
a hard brake sound the same as sitting still. A tyre rumble that rises with ground speed,
a brief squeal on a firm brake application at speed and a different thump on the wheels
touching are how a pilot feels the rollout. Complements the touchdown chirp (0147) and
haptics (0033).

## What
`audio.js`: a looped noise voice (the buffer already exists for the wind) low-passed and
gained by `sim.gsKts` while `sim.onGround`, and a short band-passed burst when the
brakes are applied above ~40 kt (not on Kid-soft landings). No assets, same node style as
the wind voice. Muted by `mute()`.

## Acceptance criteria
- [x] Rumble gain is 0 in the air and rises with ground speed (unit, fake context)
- [x] Brake burst fires once per application above 40 kt, not while stopped
- [x] Sound off silences it

## Test plan
Unit in `tests/unit/rollSound.test.js` with the fake context (audio.js wiring included).

## Out of scope
Samples, reverser noise, scrape on a tail strike.

## Shipped (Builder, 2026-11-11, #230)
Rumble and squeal in `src/rollSound.js` (engineSound.js's lazy chunk). The squeal follows the player's brakes
(`brakesOn`), not the autobrake, and is a triangle tone (band-passed noise at a safe gain was inaudible). The "different
thump on the wheels touching" in Why was not built: 0147's chirp and thump already cover the touchdown.
