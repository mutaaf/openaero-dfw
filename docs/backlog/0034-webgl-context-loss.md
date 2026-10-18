---
id: 0034
title: Survive a lost WebGL context instead of freezing on a black canvas
status: proposed
priority: P2
size: M
lens: tech-health
created: 2026-10-18
pr:
---

## Why
Phones and integrated GPUs drop the WebGL context when the app is backgrounded or memory is
tight (streamed tile textures plus photoreal make this likelier). Nothing in `src/` handles
`webglcontextlost`/`webglcontextrestored`, so the player is left with a frozen black canvas and
no hint what happened, which breaks the "it must boot / always playable" invariant.

## What
On `webglcontextlost` call `preventDefault()` and pause the sim with a clear overlay ("Graphics
paused: the browser reclaimed the GPU. Tap to resume"); on `webglcontextrestored` (three.js
re-uploads GPU resources itself) reset the terrain LOD cache and any custom render targets,
then let the player resume. If the context does not return in 5 s, offer a "Reload" button.
Touches `src/main.js` (renderer setup), `src/terrainLod.js` (cache reset), `index.html` overlay.

## Acceptance criteria
- [ ] Forcing `WEBGL_lose_context.loseContext()` shows the overlay and pauses the sim
- [ ] `restoreContext()` returns to a rendering scene (canvas not blank, per `distinctColours()`)
- [ ] Zero console errors during both transitions; no per-frame allocations added

## Test plan
e2e: start flight, call `loseContext()` via the extension, assert overlay and paused sim,
`restoreContext()`, assert the canvas renders again and the overlay hides.

## Out of scope
Reducing memory use (0026 adaptive resolution), photoreal session handling.
