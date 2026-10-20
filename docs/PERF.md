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

2026-10-19, 0055/0056/0011 (sky dome, stars, Moon, METAR clouds, night ground, runway lights,
clean view), 1280x720:

| Build | SwiftShader (`perf.spec`, `--workers=1`) avg / p95 | Apple M1 Max, Metal, uncapped, day avg / p95 | same, Night |
|---|---|---|---|
| main (b4bb5f9) | 34.6 ms / 50 ms | 2.29 ms / 4.4 ms | 2.32 ms / 4.5 ms |
| this change | 41.8 ms / 50 ms | 1.63 ms / 3.9 ms | 1.70 ms / 3.9 ms |

On software GL the dome and the 8,865 runway-light points cost a few ms (stars and runway
lights are skipped in clear daylight, the dome draws after the ground on the far plane); on a
GPU the frame got cheaper, mostly from the clean view folding away the blurred panels.

First CI run of #52: 93/123 e2e tests green when the 20 min job limit cancelled it (main:
18.7 min). Every existing test ran 20–30% longer: CI's two parallel SwiftShader workers
draw at ~200–300 ms a frame, at the 250 ms catch-up limit, so frame cost there stretches
sim time (a 2.7 min autoland took 3.2). And it ran at 00:45 UTC, after sunset in Dallas,
so the default "Live" sky had everything on. Fixed in the change, not the limit:
- the tapes' text-shadow blur (Skia's slowest canvas op, on many labels) → a 30% dark strip;
- the city lights are compiled in only while on (setCityLights recompiles once a switch);
  by day the ground runs the plain imagery shader;
- the sky dome tone-maps and sRGB-encodes per vertex (the gradient and wide halo are
  smooth); per pixel only dither. The aureole and disc are a 24° billboard that redoes the
  sky per pixel and blends in (a branch inside the dome shader still cost ~7 ms: software
  GL runs both sides);
- runway lights: one Points per airport (frustum-culled, hidden beyond 35 km), and lights
  facing away are clipped before the rasterizer sets up their quads.

Second CI run still hit 20 min (79/123; the ILS autoland test timed out at 120 s, both
tries: the sim ran under 0.4x). Two pages at once on SwiftShader (as CI's 2 workers), M1
Max, 1280x720, avg frame: main 62 ms day / 61 night; after all of the above 66 day / 79–84
night (before: +28% day, +48% night). Night's remainder is the stars, street lights and
runway lights themselves.

2026-10-20, a third CI run (with the above) was also cancelled at 20 min. Locally
(SwiftShader, 1280x720, Live at 21:17 CDT): main 100 ms a frame, this change before the
billboard sun 144–163 ms. Desktop e2e specs now render at `deviceScaleFactor: 0.5`
(playwright.config.js; 148 → 80 ms a frame). Only the specs that count canvas pixels
(airports, night, sun, resolution) opt back into 1x with `FULL_RES`, and the perf probe still
measures 1x. Flight specs alone at 0.5 were not enough: the suite took 20.2 min locally.
