---
id: 0011
title: Light the runways (edge, approach and PAPI lights that read at night)
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-10-16
pr:
---

## Why
At dusk and night the runways disappear. Real approach lighting (ALSF-2 style bars and a
sequenced flasher), white edge lights and red/green threshold lights are what make a
night approach beautiful and flyable.

## What
Instanced point-sprite lights per runway end built from the airport table: edge lights
every 60 m, green threshold / red end bars, a 900 m approach light bar with sequenced
flashers (static under reduced motion), PAPI lamps that glow. Light intensity scales
with the sun elevation.

## Acceptance criteria
- [ ] At night, a screenshot from 4 NM shows the runway outline and approach lights
- [ ] One draw call per light type (InstancedMesh or Points), frame budget held
- [ ] Reduced motion: no flasher animation

## Test plan
e2e night screenshot with tiles stubbed, assert bright pixels along the runway column;
perf probe within budget.

## Out of scope
Taxiway lighting, airport beacons.
