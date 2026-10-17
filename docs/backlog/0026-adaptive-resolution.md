---
id: 0026
title: Adaptive render resolution to hold frame rate on slow devices
status: ready
priority: P2
size: S
lens: performance
created: 2026-10-17
pr:
---

## Why
`src/main.js` fixes `setPixelRatio(min(devicePixelRatio, 2))`. A 3x phone or an iGPU laptop
at DPR 2 pays 4x the fill cost with the streamed terrain, and there is no recovery when
frames run long. Community practice is to step the pixel ratio down on long frames and
back up slowly: https://discourse.threejs.org/t/restricting-viewport-size-for-mobile/7270
(fractional ratios are valid: https://discourse.threejs.org/t/animate-low-performance-on-mobile-with-window-devicepixelratio-resize/23628).
Invariant 4 (frame budget) says playable on a recent phone.

## What
A pure `src/resScale.js` (tested): given smoothed frame time samples, returns the pixel
ratio to use, stepping down (e.g. 2 → 1.5 → 1.25 → 1) when the 1 s average exceeds ~22 ms,
up after ≥5 s under ~13 ms, with hysteresis and a floor of 1. `main.js` applies it via
`setPixelRatio` + resize, never inside the hot loop more than once per second, no per-frame allocations. Paused and
hidden tabs do not count as slow frames.

## Acceptance criteria
- [ ] Unit tests: steps down on sustained slow frames, steps up only after the cool-down, never oscillates on alternating samples, respects floor/ceiling, ignores dt spikes >250 ms
- [ ] `?debug` (or the existing perf probe) shows the current pixel ratio
- [ ] On a fast machine the ratio stays at the device cap; visuals unchanged
- [ ] No console errors, HUD canvas stays crisp

## Test plan
`tests/unit/resScale.test.js` for the controller; e2e perf probe still within budget.

## Out of scope
Per-feature quality presets, FPS settings UI.
