---
id: 0014
title: Real sun position and sky from the current time in Dallas
status: ready
priority: P1
size: M
lens: authenticity
created: 2026-10-16
pr:
---

## Why
The time-of-day button cycles three flat colour presets. The real sun over DFW right now
(elevation and azimuth) would give honest light, long dusk shadows, and a real night.

## What
Pure `sunPosition(date, lat, lon)` (NOAA solar position algorithm) in `src/sun.js`;
directional light and sky gradient/haze driven by sun elevation; the button becomes
"Now / Dawn / Noon / Dusk / Night", defaulting to Now (America/Chicago).

## Acceptance criteria
- [ ] Unit test: solar noon elevation in Dallas on the June solstice is ~80.6° (±0.5°)
- [ ] Unit test: sun is below the horizon at local midnight
- [ ] e2e: forcing Night darkens the sky (sampled pixel luminance below a threshold)

## Test plan
Vitest against published NOAA values; Playwright pixel sampling.

## Out of scope
Moon, stars, volumetric clouds.
