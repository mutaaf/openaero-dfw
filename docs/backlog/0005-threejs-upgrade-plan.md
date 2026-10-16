---
id: 0005
title: Plan and start the three.js r128 → current upgrade
status: proposed
priority: P2
size: M
lens: tech-health
created: 2026-10-16
pr:
---

## Why
three.js is pinned at r128 (2021) because the prototype loaded it from a CDN. Current
releases fix bugs, improve performance and are what every example and answer online
assumes. Upgrading in one jump changes colour management and light intensities
(`ColorManagement`, `outputColorSpace`, physically correct lights default), so the scene
would look different. That needs a deliberate, screenshot-verified migration.

## What
1. Write `docs/THREE-UPGRADE.md`: the breaking changes between r128 and the current
   release that affect `src/main.js` (renderer output encoding, light intensity units,
   `Geometry` removals if any, `TextureLoader` colour space for satellite textures),
   and the plan as a series of small steps.
2. Do the first step in this PR: bump to the latest release, set texture and output
   colour spaces explicitly, and retune light intensities so the default approach
   screenshot matches today's within reason.
3. Add the remaining steps as new backlog tickets.

## Acceptance criteria
- [ ] `docs/THREE-UPGRADE.md` exists with the breaking-change list and steps
- [ ] `three` is on the current release; `npm run check` green
- [ ] Day / Sunset / Night screenshots before and after attached to the PR and visually close
- [ ] JS bundle stays within the 180 kB gz budget

## Test plan
Existing e2e suite plus before/after screenshots of the three time-of-day modes in the PR.

## Out of scope
Swapping to WebGPU, adding post-processing.
