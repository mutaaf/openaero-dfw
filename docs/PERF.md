# Performance

Updated by the Keeper. Numbers come from `tests/e2e/perf.spec.js` (3 s of
`requestAnimationFrame` after entering the cockpit on the default KDFW 35C approach,
desktop 1280x720, satellite tiles stubbed).

**Caveat:** headless Chromium renders WebGL through SwiftShader (software GL), so these
numbers are far slower than a real GPU. They are for spotting regressions between runs on
the same kind of machine, not for judging real-world smoothness.

## Baseline

| Date | Machine | Frames / 3 s | Avg frame | p95 frame | JS gz | Notes |
|---|---|---|---|---|---|---|
| 2026-10-16 | macOS arm64 (local, `--workers=1`) | 139 | 21.6 ms | 33.4 ms | 137.6 kB | Port baseline |
| 2026-10-16 | macOS arm64 (local, `--workers=1`) | ~155 | 19.2 ms | 33.4 ms | 142 kB | 15 real runways, 30 PAPIs, z12 imagery ring; ground layers no longer write depth |

The regression guard in the test fails above 250 ms average. That's deliberately loose
(it catches hangs and per-frame rebuilds, not small regressions).

## Known hotspots (not yet tickets)

- `syncUI()` does ~25 `document.getElementById` lookups and text writes **every frame**,
  even when values haven't changed. Cache the elements once and write only on change.
- `updateCamera()` allocates with `sim.pos.clone()` in three camera modes every frame.
- All 81 zoom-13 satellite tiles are requested at boot with no LOD or disposal.
