---
id: 0043
title: Rapier foundation: one lazy world and one tug that drives a straight service road at KDFW
status: shipped
priority: P2
size: M
lens: authenticity
created: 2026-10-18
pr: 308
---

## Why
"Every object moves by its own physics": pushback tugs, fuel trucks, baggage carts,
debris, a windsock, AI aircraft taxiing. Rapier (`@dimforge/rapier3d` 0.21, Apache-2.0,
deterministic, raycast vehicle built in) is the best-maintained web physics engine;
writing our own would be worse. Use the non-compat build (separate `.wasm`, ~1.2 MB gz)
lazy-loaded after boot.

## What
Split on 2026-11-23 (the original was size L over four systems). This ticket is the foundation only:
`src/world/physicsWorld.js`, one Rapier world (non-compat build, lazy chunk loaded after Start, never at boot),
fixed 60 Hz step on the same sub-step clock, a flat ground collider under the aircraft's tile from
`ground.heightAt`, and ONE vehicle (a tug with Rapier's raycast vehicle controller) driving a short straight
loop of service road at KDFW at walking pace, drawn as a simple box mesh. The aircraft is not a Rapier body in
this ticket and nothing collides with it. Follow-ups (file separately once this merges): sloped terrain
colliders, aircraft kinematic body + collision grading, more vehicles.

## Acceptance criteria
- [ ] Rapier is in its own lazy chunk; the boot JS budget test is unchanged
- [ ] The tug stays on the ground and finishes its loop in a Node unit test; 600 steps replay to the same snapshot (determinism)
- [ ] Frame time on the phone device probe (0044) within budget with the world on (the world sleeps when the tug is far from the aircraft)
- [ ] Zero console errors; `public/CREDITS.md` credits Rapier (Apache-2.0)
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
Unit tests in Node (Rapier runs headless): tug settles and holds ground contact, loop completes, 600-step
snapshot. e2e: boots with zero console errors and the Rapier chunk is fetched only after Start.

## Out of scope
AI air traffic logic (a separate ticket), destructible buildings.
