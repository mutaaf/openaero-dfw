---
id: 0196
title: Rain, snow and thunderstorms from the METAR show on screen, not just as a "wet runway" flag
status: ready
priority: P2
size: M
lens: content
created: 2026-11-17
pr:
---

## Why
`src/metar.js` already reads the present-weather group (RA, DZ, SN, TS, FG, BR...) but only uses it to set
`wetRunway` and fog from visibility. A rainy Dallas METAR looks like a dry one with a coach line. "Real
weather overhead" is pillar 3; seeing rain streak past and the world grey out is the part a first-timer
notices. Thunderstorms (TS) are a DFW signature.

## What
A lazy `src/precip.js` chunk loaded only when the flown field's METAR has RA/DZ/SN/TS: a single
GPU-instanced streak/flake layer around the camera (one draw call, count by intensity: - light, moderate,
+ heavy), falling with the sim wind, hidden in cockpit-less views where it would cover the HUD only if
intensity is heavy and reduced motion is on (then a static grey veil). Tie the existing fog/visibility
down by intensity (never below the METAR's own visibility). TS adds a darker sky and a lightning flash
every 8-25 s (no flash under reduced motion; brightness change under 3 per second, WCAG 2.3.1). Honest
label: shown only when the METAR is live; scenario weather draws none.

## Acceptance criteria
- [ ] No precip chunk is fetched when the METAR has no precipitation (check the network log in e2e)
- [ ] Intensity prefix (-, none, +) changes particle count; the count is pure and unit-tested
- [ ] Reduced motion: no flashes, no streak motion
- [ ] No per-frame allocations; frame-time probe within budget at 390x844
- [ ] Never covers the horizon or HUD panels (screenshots at 390x844 and 1280x720 on a +RA METAR fixture)
- [ ] Boot JS unchanged

## Test plan
Unit: parse-to-intensity mapping from raw METAR strings. e2e: route `/api/metar` to a `+TSRA` fixture,
fly, screenshot, assert the layer exists, no console errors, no HUD overlap.

## Out of scope
Rain on the canopy, splash/wet-runway shine, snow accumulation.
