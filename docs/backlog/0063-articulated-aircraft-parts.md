---
id: 0063
title: Aircraft parts move by physics (control surfaces, gear, flaps, prop)
status: ready
priority: P1
size: M
lens: authenticity
created: 2026-10-21
pr:
---

## Why
AGENTS.md pillar 0: every object that moves in the world moves by its own physics, not
keyframes. Split from 0045 so the loader can ship first. Once a detailed model is on
screen, a player in the chase view should see ailerons, elevator, rudder and flaps
deflect with the real control state, gear swing and compress, and the prop spin at the
engine's RPM.

## What
`src/aircraftModel.js` (from 0045): map node names (`ctl_aileron_L/R`, `ctl_elevator`,
`ctl_rudder`, `ctl_flap_L/R`, `gear_*`, `prop`, `fan_L/R`) to the flight model state each
frame, pivots at hinge lines, deflections capped at each aircraft's real throw (C172: aileron
+20/-15°, elevator +28/-24°, flaps 0/10/20/30° per the POH). Reuse temp objects (no per-frame
allocation). Surfaces that a model lacks are skipped silently.

## Acceptance criteria
- [ ] Unit: input to node rotation mapping has the right sign and the throw limits
- [ ] e2e: full left stick vs full right stick changes the chase-view pixels around the wing tips
- [ ] Flaps notch to the POH angles; gear animates over ~6 s, not instantly
- [ ] Zero per-frame allocations in the update (unit-asserted with a spy)
- [ ] Works at 390x844 and 1280x720; no frame-time regression

## Test plan
Unit for the mapping; e2e screenshot diff in chase view with stick left/right.

## Out of scope
New models (0045), cockpit instruments, ground vehicles.
