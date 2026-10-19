# AGENTS.md — Operating manual for OpenAero DFW

Everything an agent (or human) needs to work on this game. Read it fully before changing
anything. `CLAUDE.md` points here.

## 1 · Product vision

OpenAero DFW is a browser flight simulator set over the real Dallas-Fort Worth metroplex:
real satellite imagery draped on the real terrain underneath (a photoreal 3D city when
the Google tiles key is configured), real airports at their real elevations, real weather
overhead, and a 6-DOF flight model that feels believable. It opens in a second, needs no
install or account, and runs on a laptop, a phone, or with a gamepad.

It must be **approachable for a casual player and rewarding for a pilot**. A first-timer
should be on a stabilized final to DFW within 30 seconds and land it, guided by a coach,
the PAPI and the velocity vector, then see a grade that makes them want one more go.
Someone who flies for real should recognise the place and the procedures: runway
thresholds and headings you can check against a chart, a 3° glidepath, believable
V-speeds, today's METAR pushing the aircraft around, GPWS callouts with the real cadence.

### The 10x pillars (north star; the Scout steers here, in roughly this order)

1. **Flyable on any device.** Touch (on-screen stick + throttle, multi-touch, ≥44px
   targets, no page scroll), gamepad, keyboard, mouse. The HUD never overlaps itself at
   390x844 and never hides the horizon.
2. **Airport fidelity.** Every runway at KDFW (7), KDAL, KAFW, KADS, KGKY and KFTW from
   real survey data (OurAirports / FAA), drawn flush with the imagery and visible from a
   10 NM final: markings, edge and approach lights, a PAPI per runway end. Landmarks at
   their true coordinates. Approach guidance (ILS/PAPI/HUD) works for whichever runway
   you are flying to, not just 35C.
3. **Real weather.** Today's METAR for the field you are flying to (served same-origin by
   this repo's edge Worker) drives wind, gusts, visibility, ceiling and altimeter in both
   the physics and the visuals. Honest labels: "live" only when it is; a clear offline
   fallback.
4. **A game worth replaying.** Every landing is graded (touchdown rate, centreline,
   touchdown zone, flare) with a results card and a per-mission personal best. A
   first-30-seconds coach. Voice GPWS callouts. Missions that teach something real.
5. **A world that looks right.** Sun position from the actual time in Dallas (day, dusk,
   night with runway and city lights), better sky and haze, sharper imagery near the
   aircraft, and a current three.js underneath.

Prefer depth over breadth: making the DFW world truer and the flying feel better beats
adding aircraft or modes. Never claim something is "live" or "real" unless it is.

## 2 · Live

- Production: https://mutaafaziz.com/openaero/ (served by the `openaero-dfw` Cloudflare
  Worker on the route `mutaafaziz.com/openaero*`; the rest of mutaafaziz.com is a different
  project and repo — never touch it from here).
- Every PR gets a Cloudflare preview URL (posted on the PR by Workers Builds).
- Deploy = merge to `main`. Rollback = revert the PR (or `npx wrangler rollback` by the operator).

## 3 · Invariants (breaking any of these fails review)

1. **It must boot.** The page renders a playable first screen with zero console errors on
   current Chrome, Safari, and Firefox, desktop and phone. The e2e smoke test guards this.
2. **Base path.** The app is served under `/openaero/`. Vite `base` and `build.outDir`
   (`dist/openaero/`) encode this. Never use root-absolute URLs (`/foo.png`); import
   assets or use `import.meta.env.BASE_URL`.
3. **Allowed runtime hosts.** Browser: own origin + `server.arcgisonline.com` (Esri World
   Imagery tiles) + `tile.googleapis.com` (Google Photorealistic 3D Tiles; only on
   https://mutaafaziz.com, only with the operator's key from /openaero/api/config, only
   after the player starts flying), nothing else. Attribution must stay visible: Esri +
   elevation credits on the free terrain; the Google Maps logo (16–19 px, clear space) +
   the on-screen tiles' data providers in one line under photoreal. Google content is
   never stored, proxied or cached by us (Map Tiles policy: "you must not pre-fetch,
   index, store, or cache any Content"); the browser HTTP cache only. The Google session
   is one per page, never persisted. Edge (`src/worker/`): `aviationweather.gov` only.
   Adding any other host needs the operator: open a `proposal/` PR.
   No analytics, ads, trackers, fonts or scripts from CDNs. Everything else is bundled.
4. **Frame budget.** The render loop must hold 60fps on a mid-range laptop and stay
   playable on a recent phone. No per-frame allocations in hot paths (reuse vectors and
   arrays), no layout thrash from the HUD.
5. **Mobile.** Touch controls work at 390x844, touch targets ≥44px, no page scroll or
   zoom while playing, safe-area insets respected.
6. **Save data compatibility.** `localStorage['openaero_best'] = { v: 1, missions: {
   <missionKey>: { score, grade, at } } }` (personal bests, `src/landing.js`). New keys are
   prefixed `openaero_` and carry a `v`; bump `v` only with a migration on read; never throw
   away a player's data; tolerate storage that throws (private mode). Photoreal keeps only
   our own bookkeeping: `openaero_g3dt_usage_v1` (lifetime root/reuse counts) and
   `openaero_g3dt_block_v1` (quota/forbidden back-off, no key, no Google content). The
   first-flight coach remembers `openaero_coach_v1 = { v: 1, seen, at }` (`src/coach.js`).
7. **Accessibility floor.** Respect `prefers-reduced-motion` for screen shake/flashes;
   every control has a keyboard path; text meets 4.5:1 contrast on HUD backgrounds.

## 4 · System map

```
index.html          markup: viewport canvases, HUD panels, onboarding modal (Tailwind classes)
src/main.js         renderer + scene build, 6-DOF integrator, camera, HUD/radar drawing,
                    scenarios, UI event wiring, render loop. Still large (ported glue):
                    the Keeper carves it into modules, no behavior change per PR.
src/constants.js    units, KDFW origin, field elevation
src/aircraft.js     aircraft database (mass, wing, lift/drag, thrust, V-speeds, damping)
src/airports.js     real runways (OurAirports) for KDFW/KDAL/KADS/KAFW/KFTW/KGKY, runway-end
                    thresholds, approachGeometry, selectActiveRunway, approach/takeoff spawns
src/missions.js     mission catalogue (approaches by runway end, tours by spawn) + the dynamic
                    crosswind_today mission (weather.js pickCrosswindRunway, live METARs only)
src/landmarks.js    Dallas landmarks at true lat/lon (cited) + real heights, via geo.js;
                    DOWNTOWN_DALLAS (map dot, skyline tour), ATT_STADIUM
src/gamepad.js      Gamepad API mapping (deadzone/expo, edges) + per-frame poll
src/landing.js      landing grade (rate, centreline, zone, flare, speed → S/A/B/C/D/CRASH) +
                    versioned personal bests
src/coach.js        first-flight coach on the default final: prompts from PAPI, AGL,
                    sink rate and throttle (pure state machine) + seen flag
src/autopilot.js    autopilot control laws (pure) + weathervane term + trim AoA. **Sign
                    conventions (pinned by tests):** aileron + = roll right, elevator + =
                    nose down, rudder + = yaw right; body rates: angVel.x + = nose up,
                    angVel.y + = nose left, angVel.z + = roll left.
src/geo.js          Web Mercator tile math, lat/lon → sim metres, Esri tile URLs
src/terrain.js      the one ground truth: baked DEM (public/terrain/dfw-dem-v1.bin, from
                    AWS Terrain Tiles via scripts/bake-terrain.mjs) + every runway
                    flattened onto the plane through its surveyed end elevations.
                    ground.heightAt(x, z) → sim Y; physics, AGL, runways, PAPIs read it
src/ecef.js         WGS84 ECEF ↔ geodetic ↔ sim (geoid plane fit), rigid ECEF→sim matrix
src/googleSession.js  the billable part of Google 3D Tiles: one root per page, quota
                    back-off, signed URLs, usage counters (pure, tested)
src/photoreal.js    Google Photorealistic 3D Tiles (lazy 3d-tiles-renderer): exact per-
                    vertex ECEF → sim remap on load, vertical calibration against runway
                    thresholds, attribution, ?debug usage readout
src/tileTree.js     quadtree LOD selection for the streamed imagery (pure, tested)
src/terrainLod.js   streamed Esri imagery draped on terrain.js: per-tile height grids with
                    skirts, hillshade in vertex colours, load queue, LRU cache
src/sun.js          real sun (NOAA solar position) over DFW, Now/Dawn/Noon/Dusk/Night presets,
                    sky/haze/light colours by sun elevation (pure, tested)
src/hudLayout.js    canvas HUD geometry that depends on the screen (heading box clears the
                    phone's top bar in landscape; pure, tested)
src/flightModel.js  the 6-DOF rigid body: one sub-step of forces, moments, gear contact and
                    integration on a `body` (main.js passes `sim`). Pure: flown headless by
                    tests/flight/ against published performance data
src/aero.js         pure aero/avionics: CL with stall, CD + ground effect, PAPI, stabilized-
                    approach gate (500/1,000 ft, ILS dots),
                    GPWS callouts, warnings, heading math
src/input.js        keyboard state → control targets, virtual stick mapping
src/audio.js        Web Audio engine/wind/stall/GPWS chirps (starts on user gesture)
src/styles.css      Tailwind entry + ported custom HUD styles
src/worker/         edge Worker (runs only for /openaero/api/*, see wrangler.jsonc):
                    GET /openaero/api/metar?ids=KDFW,… → aviationweather.gov METARs,
                    validated ids, trimmed JSON, 5-min edge cache.
                    GET /openaero/api/config → { googleTilesKey } from the
                    GOOGLE_MAPS_KEY Worker secret (null when unset), no-store. Operator-frozen with
                    wrangler.jsonc: changes go in a build/ PR the operator merges.
tests/unit/         Vitest for the pure modules
tests/e2e/          Playwright: smoke, controls, missions, phone, perf probe
```

World frame: metres from the KDFW origin, +X east, +Y up, **−Z north**. **Y is height
above KDFW's field elevation (606 ft MSL)**, not above the local ground: Love Field's
runways are at y ≈ −40, Alliance's at y ≈ +20–35. Always use `sim.groundY` (terrain under
the aircraft) for AGL/contact and `end.thrY` (threshold height) for approach geometry and
PAPIs; never assume the ground is y = 0. The imagery is unlit and draped on the terrain
and writes depth; runway surfaces/markings are decals over it with negative polygon
offset (holds at any distance, ticket 0002); ground materials are `MeshBasicMaterial`
tinted by `applyGroundLight()` (per-pixel Lambert on a full-screen ground is too slow on
software GL). Approach guidance
(ILS bars, PAPI text, APR autopilot, DME, NAV1) follows `sim.activeEnd`, re-picked twice
a second by `selectActiveRunway` from whatever you're lined up on. Loop per frame
(`renderLoop`): `step6DofPhysics(dt)` (dt capped at 250 ms, split into ≥ 3 sub-steps of
≤ 1/60 s, each: input + autopilot in main.js → `stepFlightModel`, so sim time keeps pace with real time down to 4 fps) → `updateCamera` →
`terrainLod.update` (re-selects tiles 5x a second) → `renderer.render` → `renderHud`
(2D canvas) → `renderRadar`
→ `syncUI` (DOM text) → `audio.update`.

### URL parameters (deep links, ticket 0028)

The site launcher links into the sim with these. `airport`/`mission` are stripped after use
(a refresh starts at the default mission); invalid values are ignored. **Nothing skips the
Start flight tap**, and the billable Google session still starts only there (see 0024).

| Param | Effect |
|---|---|
| `?airport=KDFW\|KDAL\|KADS\|KAFW\|KFTW\|KGKY` | fly from that airport: its takeoff if it has one, else its first approach (`src/deeplink.js`) |
| `?mission=<key>` | that mission from `src/missions.js` (wins over `?airport`) |
| `?view=terrain` | free terrain map this visit: no Google config/session request at all |
| `?photoreal` | force photoreal off the live origin (tests/debugging; Google refuses other referrers) |
| `?debug` | debug overlay |

## 5 · Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server at http://localhost:5173/openaero/ |
| `npm run build` | Production build into `dist/openaero/` |
| `npm run preview` | Serve the production build locally (static only: the /api Worker isn't running, the client falls back) |
| `npx wrangler dev --local --port 8799` | Build first; serves assets **and** the edge Worker locally (real METARs) |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | Playwright e2e (builds first) |
| `npm run check` | **The gate**: backlog validator + unit + build + e2e. CI runs exactly this. |
| `npm run check:fast` | Everything but e2e, for sandboxes that can't install Playwright browsers. CI still runs the full gate. |

Budgets: JS ≤ 190 kB gzipped at boot (2026-10-17: 184 kB, almost all three.js; raised
from 180 for photoreal: three is one module, so the core classes the lazy glTF/3D-tiles
chunk needs are hoisted into the entry chunk; 3d-tiles-renderer + Draco load only when
photoreal starts), CSS ≤ 10 kB gzipped (4.2 kB). Frame-time numbers live in `docs/PERF.md`.

## 6 · The agents

Three cloud routines run this repo with no human in the loop (see `agents/prompts/`):

| Agent | Job | Branch prefix |
|---|---|---|
| Scout | Plays the build, researches, grooms and refills `docs/backlog/` | `scout/` |
| Builder | Ships the top ready ticket test-first, merges on green, verifies live | `build/`, `fix/` |
| Keeper | Dependencies, perf budget, refactors, prompt tuning, red-main backstop | `keep/` |

The operator controls them via `agents/control.json` (pause, per-agent enable, focus,
caps) and their schedules at https://claude.ai/code/routines (frequency).

## 7 · Definition of done

- [ ] `npm run check` green locally and in CI
- [ ] Test added that fails without the change
- [ ] Screenshot checked at 1280x720 and 390x844
- [ ] No new runtime hosts, no new console errors, frame budget held
- [ ] Ticket marked `shipped` with PR number; `docs/CHANGELOG.md` line added
- [ ] Lesson appended to `docs/LESSONS.md` if one was learned
