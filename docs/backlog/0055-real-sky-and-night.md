---
id: 0055
title: A real sky over DFW, and a night that keeps the world
status: shipped
priority: P1
size: L
lens: player-feel
created: 2026-10-19
pr: 52
---

## Why
The sky was one flat colour, and at Dusk/Night the ground tint (ambient light × imagery)
fell to ~3% so the satellite tiles went black into black fog: the world disappeared after
sunset. Photoreal tiles ignored the time of day entirely. Seen by the operator 2026-10-19:
"the night and day views lose the actual tiles … we should have real live space and
immersive feel".

## What
- `src/sky.js` (pure): sidereal time, J2000 → sim rotation, the Moon's topocentric
  position (Astronomical Almanac low-precision series) and illumination, nightness.
- `src/skyDome.js` (lazy chunk): atmosphere dome (zenith/horizon gradient, sunward
  twilight glow, sun disc and halo, deepening towards space with altitude), the Yale Bright
  Star Catalogue to V 5.8 placed by the real sidereal time (`public/sky/stars-v1.bin`,
  `scripts/bake-stars.mjs`), the Moon at its real position with the phase lit by the sun,
  and every METAR cloud layer (FEW/SCT/BKN/OVC) as drifting fbm cloud decks.
- `src/sun.js`: zenith/horizon/glow keys; haze = horizon colour; night ambient that keeps
  the imagery moonlit, lifted further by a real Moon above the horizon.
- `src/nightGround.js`: the imagery (terrainLod, photoreal) graded to moonlight after
  sunset, street lights on the asphalt in world space (pools + heads near, averaged glow far).
- Runway lights (ticket 0011) in `src/runwayLights.js`.

## Acceptance criteria
- [x] At Night the ground band is ≥ 25% of its Noon luminance (was ~3%)
- [x] The Moon covers the Sun over Dallas at the 2024-04-08 totality (< 0.5°); full and
      first-quarter phases match USNO
- [x] Stars, Moon and city lights at night; clouds from the live METAR layers
- [x] Boot bundle: the dome is a lazy chunk; frame budget held (perf probe)

## Test plan
`tests/unit/sky.test.js` (sidereal time vs Meeus 12.a, horizon geometry, eclipse, phases),
`tests/unit/weather.test.js` (cloud layers), `tests/e2e/night.spec.js` (night ground
luminance vs day, sky state).

## Out of scope
Planets, the Milky Way texture, volumetric clouds, aircraft landing lights.
