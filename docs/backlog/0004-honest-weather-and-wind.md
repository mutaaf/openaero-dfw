---
id: 0004
title: Fly in today's real weather (edge METAR + wind in the physics)
status: ready
priority: P1
size: L
lens: authenticity
created: 2026-10-16
pr:
---

## Why
The UI says "Live NOAA METAR" but the string is hard-coded and the wind never reaches
the integrator: the aircraft flies in still air. Real wind, gusts and visibility from
today's METAR would make every approach different and true.

## What
Two PRs:
1. **Edge Worker** (operator-authorized, frozen paths): `src/worker/index.js` serves
   `GET /openaero/api/metar?ids=KDFW,KDAL` by fetching
   `https://aviationweather.gov/api/data/metar?ids=…&format=json`, validating ids
   (`^K[A-Z0-9]{3}$`, at most 6), caching 5 minutes with the Cache API, returning
   trimmed JSON. `wrangler.jsonc` gets `main` and `assets.run_worker_first:
   ["/openaero/api/*"]`. Unit-tested with mocked fetch.
2. **Client**: fetch on boot and every 10 minutes; pure helpers in `src/weather.js`
   parse wind/gust/visibility/ceiling/altimeter; airspeed, AoA and sideslip computed
   from velocity relative to the air mass with smoothed gusts; fog density from
   visibility, a cloud deck at the ceiling; the raw METAR shown with its age. Offline or
   API failure → clearly labelled "SCENARIO WX" fallback.

## Acceptance criteria
- [ ] Worker unit tests: valid ids → upstream called once then cached; invalid ids → 400; upstream failure → 502 JSON
- [ ] Unit test: 20 kt headwind → IAS exceeds groundspeed by ~20 kt
- [ ] Unit test: METAR parsing for wind/gust/variable/calm, visibility "10+", ceilings BKN/OVC
- [ ] e2e: with the API route mocked, the ribbon shows the mocked raw METAR; with it failing, "SCENARIO WX"
- [ ] The word "live" appears only when real data is displayed

## Test plan
Vitest for the worker handler and weather helpers; Playwright route mocking for
`**/openaero/api/metar*`.

## Out of scope
TAF forecasts, winds aloft, turbulence beyond gusts.
