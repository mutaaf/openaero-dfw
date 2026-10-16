---
id: 0015
title: Make the aircraft actually fly (roll sign, turning, takeoff, autoland)
status: shipped
priority: P0
size: M
lens: player-feel
created: 2026-10-16
pr: 8
---

## Why
Found while building the landing grade: the prototype's flight model had four bugs that
no test caught because nothing ever flew the aircraft. D ("bank right") banked left; a
banked aircraft never turned (no directional stability); ground friction ∝ speed capped
the takeoff roll near 75 kt, so the takeoff mission was impossible; and ILS autoland was
positive feedback in pitch — it looped the aircraft and crashed within seconds (also in
production).

## What
- Roll sign fixed (aileron + = roll right); weathervane yaw from sideslip so bank turns.
- Tyre model: rolling resistance μ·N along the nose, stiff side force across it.
- Per-airframe flap lift and control authority (737: ~12°/s pitch, ~18°/s roll), tailstrike limit on the ground.
- Autopilot laws as pure functions (`src/autopilot.js`) with signs pinned by unit tests; approaches spawn in trim.

## Acceptance criteria
- [x] D banks right and a held bank turns right at about g·tanφ/V
- [x] TO/GA on 35C reaches Vr and lifts off with back pressure
- [x] Autoland from 0.5 NM touches down upright, past the threshold, near the centreline
- [x] Autoland from 4 NM holds localizer and glideslope within 20 m

## Test plan
`tests/unit/autopilot.test.js` (law signs, trim AoA), `tests/unit/aero.test.js` (flap lift),
`tests/e2e/flight.spec.js` (roll/turn, short-final autoland, 4 NM tracking).

## Out of scope
A residual ~25 s pitch/speed oscillation on long autoland finals (ticket 0016).
