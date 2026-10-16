# Lessons

Mistakes already paid for. Every agent reads this before working. Add one dated row when
you learn something a future run must not re-learn; prune rows that no longer apply.

| Date | Lesson | What happened |
|---|---|---|
| 2026-10-16 | A "canvas is not blank" check must hide everything layered over the canvas first | An element screenshot captures the HUD and panels drawn on top, so a dead WebGL canvas still showed many colours. `distinctColours()` now hides overlays; render on = 6 colours, render off = 1. |
| 2026-10-16 | Write expected values from an independent calculation, then verify it | A hand-guessed tile Y (3300) was wrong; the code (3302) was right. Recompute with a separate tool before "fixing" code to match a test. |
| 2026-10-16 | Stub the Esri tile host in tests | Tests must not depend on a third-party server or rate limits. `stubTiles()` serves a 1x1 PNG with CORS headers. |
| 2026-10-16 | **Coplanar ground layers: order them, don't offset them.** | Runways at y=0.35 lost to imagery at y=0.05 on a 4 NM final (24-bit depth, near 0.5 m, far 95 km). Nothing is ever below the ground, so ground layers draw first with `depthWrite: false` in `renderOrder`; no polygonOffset, no log depth. |
| 2026-10-16 | **Lights are Points, not spheres.** | 120 instanced PAPI spheres cost ~6 ms/frame in SwiftShader (CI). One `THREE.Points` with `sizeAttenuation: false` costs ~0 and reads from miles out like a real lamp. |
| 2026-10-16 | **Check the data before the test.** | A unit test asserted Love Field is north of KDFW; OurAirports says 32.84°N vs 32.90°N — south-east. The data was right. |
| 2026-10-16 | **Stub same-origin APIs in e2e too.** | `vite preview` has no Worker, so `/openaero/api/metar` 404s — and Chromium logs failed loads as console errors, which the zero-error smoke tests catch. `stubTiles()` now also serves a fixed METAR. |
| 2026-10-16 | **Edge cache headers can be rewritten.** | On cache HITs the zone's Browser Cache TTL stretched the METAR response to `max-age=14400`. Weather is fetched with `cache: 'no-store'` plus a minute-bucket query param; the Worker re-stamps cache-control on hits. |
