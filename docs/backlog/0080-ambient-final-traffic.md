---
id: 0080
title: Ambient airliner traffic: one jet landing on the parallel final into DFW
status: proposed
priority: P2
size: M
lens: content
created: 2026-10-22
pr:
---

## Why
The sky and the airfield are empty: no other aircraft anywhere, which makes the world feel
like a tech demo rather than the world's busiest-to-be-near airspace (DFW's parallel
approaches are the thing a pilot remembers). Seeing a 737 two miles ahead on the next
runway's final, and a coach line "traffic, 2 o'clock, 3 miles" is the cheapest big step
in "this is a place". Pillar 0 asks that moving things move by physics, not keyframes, so
traffic is flown by the pure `stepFlightModel` plus the existing autopilot laws (headless
already, so no new engine).

## What
Behind a small `src/traffic.js`: spawn one B738 at a time (the cached twin-jet glTF from
`src/aircraftModel.js`) 4-8 NM out on a different DFW runway end than the player's, flown
by `autopilot.js` ILS tracking, landing and rolling out, then despawned; respawn after a
gap. Update it at a reduced rate while far. No collision, no wake. Off on phones if the
perf probe says so (reuse `resScale` signals).

## Acceptance criteria
- [ ] A jet is visible on a parallel final in the default 4 NM mission and lands on its runway (headless test: it touches down inside the touchdown zone)
- [ ] No traffic is ever placed on the player's runway or within 1 NM of the player
- [ ] Frame time within budget at 390x844 on the devices probe; zero per-frame allocations in the update
- [ ] Auto-off on slow devices (the `resScale` floor)

## Test plan
Unit test spawn placement (never the player's runway, never within 1 NM). Headless flight
test: the autopilot-flown jet lands on the intended runway. E2E: screenshot with traffic
present.

## Out of scope
ATC voice, ground movements, collision/TCAS, departures, more than one jet at a time (a follow-up).
