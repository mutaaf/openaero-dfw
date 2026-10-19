---
id: 0043
title: Rapier rigid-body world for the things that aren't the aircraft
status: proposed
priority: P2
size: L
lens: authenticity
created: 2026-10-18
pr:
---

## Why
"Every object moves by its own physics": pushback tugs, fuel trucks, baggage carts,
debris, a windsock, AI aircraft taxiing. Rapier (`@dimforge/rapier3d` 0.21, Apache-2.0,
deterministic, raycast vehicle built in) is the best-maintained web physics engine;
writing our own would be worse. Use the non-compat build (separate `.wasm`, ~1.2 MB gz)
lazy-loaded after boot.

## What
`src/world/physicsWorld.js`: one Rapier world near the aircraft (sleeping bodies far
away), fixed 60 Hz step on the same sub-step clock, terrain collider from
`ground.heightAt` patches around the aircraft. **One owner for ground contact:** the
flight model owns the aircraft's gear; Rapier owns everything else and gets the aircraft
as a kinematic body for collisions. Start with an airside vehicle set at KDFW (tug,
fuel truck) driving real service roads, and a windsock with a physical sock.

## Acceptance criteria
- [ ] Boot JS budget unchanged (Rapier lazy, loads after Start)
- [ ] Vehicles stay on the ground over sloped terrain; a collision with the aircraft is detected and graded as a crash
- [ ] iPhone-size at 4x CPU throttle: frame time within budget (device probe 0044)
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
Unit tests in Node (Rapier runs headless): vehicle settles on a slope, deterministic
replay of 600 steps matches a snapshot; e2e: zero console errors with the world on.

## Out of scope
AI air traffic logic (a separate ticket), destructible buildings.
