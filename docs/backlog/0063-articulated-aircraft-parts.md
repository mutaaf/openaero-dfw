---
id: 0063
title: Aircraft parts move by physics (control surfaces, gear, flaps, prop)
status: shipped
priority: P1
size: M
lens: authenticity
created: 2026-10-21
pr: 76
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
- [x] Unit: input to node rotation mapping has the right sign and the throw limits
- [x] e2e: full left stick vs full right stick changes the chase-view pixels around the wing tips
- [x] Flaps follow the actual flap angle (systems.js) to the POH detents; the gear swings over
      its hydraulic travel time (737: 10 s down, 7 s up), not instantly
- [x] Zero per-frame allocations in the update (unit-asserted with a spy)
- [x] Works at 390x844 and 1280x720; no frame-time regression

## As built (#76)
`src/surfaces.js` (lazy chunk after boot): pure `surfaceAngles` (C172 throws from FAA TCDS
3A12: aileron 20 up / 15 down, elevator 28 / 23, rudder 16°10'; F-16 limits from NASA
TP-1538 as flown by Stevens & Lewis, flaperons mixing flap and roll; 737 throws are
estimates), `rigParts` / `poseParts` (no allocation per frame), spin by the engine spool.
The primitive C172, F-16 and 737 stand-ins have hinged `ctl_*` surfaces. The twin-jet glTF
gets its gear legs on hinge pivots at load (nose forward, mains inboard, split per side);
its wing is one mesh with the body, so **its surfaces don't move yet**: cutting them out of
the model (blend-to-glb.py) is follow-up work. Prop/fans spin at a visual rate that rises
with the spool, not the real 2,700 rpm (that strobes at 60 fps); strut compression is not
drawn.

## Test plan
Unit for the mapping; e2e screenshot diff in chase view with stick left/right.

## Out of scope
New models (0045), cockpit instruments, ground vehicles.
