# Performance

Updated by the Keeper. Numbers come from `tests/e2e/perf.spec.js` (3 s of
`requestAnimationFrame` after entering the cockpit on the default KDFW 35C approach,
desktop 1280x720, satellite tiles stubbed).
In CI the probe has its own `perf` Playwright project that runs alone after every other
test. To measure it by itself locally: `npx playwright test --project=perf --no-deps`.

**Caveat:** headless Chromium renders WebGL through SwiftShader (software GL), so these
numbers are far slower than a real GPU. They are for spotting regressions between runs on
the same kind of machine, not for judging real-world smoothness.

## Baseline

| Date | Machine | Frames / 3 s | Avg frame | p95 frame | JS gz | Notes |
|---|---|---|---|---|---|---|
| 2026-10-16 | macOS arm64 (local, `--workers=1`) | 139 | 21.6 ms | 33.4 ms | 137.6 kB | Port baseline |
| 2026-10-16 | macOS arm64 (local, `--workers=1`) | ~155 | 19.2 ms | 33.4 ms | 142 kB | 15 real runways, 30 PAPIs, z12 imagery ring; ground layers no longer write depth |

| 2026-10-17 | macOS arm64 (local, `--workers=1`) | 88 | 34.4 ms | 50.1 ms | 166 kB | #0023 real terrain: quadtree imagery (~100 tiles in view, ~9k terrain tris), unlit hillshaded ground |

The regression guard in the test fails above 250 ms average. That's deliberately loose
(it catches hangs and per-frame rebuilds, not small regressions).

## Known hotspots (not yet tickets)

- `syncUI()` does ~25 `document.getElementById` lookups and text writes **every frame**,
  even when values haven't changed. Cache the elements once and write only on change.
- `updateCamera()` allocates with `sim.pos.clone()` in three camera modes every frame.
