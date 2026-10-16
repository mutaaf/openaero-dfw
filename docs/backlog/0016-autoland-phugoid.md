---
id: 0016
title: Smooth the autoland's long-period pitch/speed oscillation
status: ready
priority: P2
size: S
lens: player-feel
created: 2026-10-16
pr:
---

## Why
On a 4 NM autoland the pitch wanders ±3–4° with a ~25 s period (autothrottle and
glidepath fighting over energy). It tracks within limits, but it looks unsettled from the
cockpit and makes the HUD flight-path marker bob.

## What
In `src/autopilot.js`: decouple speed and path (autothrottle on airspeed error with a
lagged/integral term; pitch on path only), and add a small integral on glidepath error.
Tune with the e2e probe logging pitch every 250 ms.

## Acceptance criteria
- [ ] KDAL 31R autoland from 4 NM: pitch stays within ±1.5° of its mean after the first 10 s
- [ ] Localizer/glideslope still within 20 m (flight.spec.js)
- [ ] Short-final autoland still lands past the threshold on the centreline

## Test plan
Extend `tests/e2e/flight.spec.js` with a pitch-variance assertion on the 4 NM approach.

## Out of scope
Manual-flight handling qualities.
