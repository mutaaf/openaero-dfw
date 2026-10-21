# AGENTS.md — Operating manual for OpenAero DFW

Everything an agent (or human) needs to work on this game. Read it fully before changing
anything. `CLAUDE.md` points here.

## 1 · Product vision

OpenAero DFW is a browser flight simulator set over the real Dallas-Fort Worth metroplex:
real satellite imagery draped on the real terrain underneath (a photoreal 3D city when
the Google tiles key is configured), real airports at their real elevations, real weather
overhead, and a 6-DOF flight model that feels believable. It opens in a second, needs no
install or account, and runs on a laptop, a phone, or with a gamepad.

It must be **approachable for a kid and rewarding for a pilot**, and the people it has
to impress are holding an iPhone, an iPad or an Android phone. Ramp-up is a dial, not a
fork: assist levels take a first-timer from a forgiving, coached flight to the raw
airplane, over the same physics. And it must be **accurate in a way anyone can check**:
the flight model is flown headless against published performance data on every change,
and the gaps are written down, not hidden. A first-timer
should be on a stabilized final to DFW within 30 seconds and land it, guided by a coach,
the PAPI and the velocity vector, then see a grade that makes them want one more go.
Someone who flies for real should recognise the place and the procedures: runway
thresholds and headings you can check against a chart, a 3° glidepath, believable
V-speeds, today's METAR pushing the aircraft around, GPWS callouts with the real cadence.

### The 10x pillars (north star; the Scout steers here, in roughly this order)

0. **Physics you can check.** Every flight-model claim has a flight test card in
   `tests/flight/` against a cited source (POH, manufacturer airport-planning data, FAA
   and NASA references). Known gaps are `it.fails` cards with a ticket; closing one is
   progress you can measure. Every object that moves in the world (aircraft, gear,
   control surfaces, ground vehicles, traffic, windsocks) moves by its own physics, not
   by keyframes.

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

**Package the best; don't rebuild what exists.** Prefer a maintained, permissively
licensed open-source library or asset over writing our own (flight dynamics, rigid-body
physics, atmosphere, glTF models, compression). Bundle it from npm or vendor it (never a
runtime CDN), lazy-load anything heavy after boot (WASM, models, textures), avoid
multithreaded WASM builds (COOP/COEP would break the cross-origin imagery), and check
the license first: MIT/BSD/Apache/Zlib/CC0/CC-BY are fine; LGPL only as a separately
loaded, replaceable module with its notice; GPL code or data needs the operator (open a
`proposal/` PR). Credit every third-party asset in `public/CREDITS.md` and on screen
where its license asks.

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
5. **Mobile.** Touch controls work at 390x844 and on every touch-only screen, whatever its
   width (an iPad held sideways is 1180 px: layout follows `(hover: none) and (pointer:
   coarse)`, not just the breakpoint), touch targets ≥44px, no page scroll or zoom while
   playing, safe-area insets respected.
6. **Save data compatibility.** `localStorage['openaero_best'] = { v: 1, missions: {
   <missionKey>: { score, grade, at } } }` (personal bests, `src/landing.js`). New keys are
   prefixed `openaero_` and carry a `v`; bump `v` only with a migration on read; never throw
   away a player's data; tolerate storage that throws (private mode). Photoreal keeps only
   our own bookkeeping: `openaero_g3dt_usage_v1` (lifetime root/reuse counts) and
   `openaero_g3dt_block_v1` (quota/forbidden back-off, no key, no Google content). The
   first-flight coach remembers `openaero_coach_v1 = { v: 1, seen, at }` (`src/coach.js`);
   the autopilot tutor `openaero_tutor_v1 = { v: 1, on, at }` (`src/apTutor.js`); the assist
   level `openaero_assist_v1 = { v: 1, level, at }` (`src/assists.js`); the clean view
   `openaero_view_v1 = { v: 1, clean, at }` (`src/viewPrefs.js`). Kid and Learner keep
   their personal bests under `<missionKey>@kid` / `@learner` in `openaero_best`; Pilot keeps
   the plain mission key.
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
src/missions.js     mission catalogue (approaches by runway end, tours by spawn, a blurb each;
                    groupMissions() builds the start-screen picker, ticket 0029) + the dynamic
                    crosswind_today mission (weather.js pickCrosswindRunway, live METARs only)
src/landmarks.js    Dallas landmarks at true lat/lon (cited) + real heights, via geo.js;
                    DOWNTOWN_DALLAS (map dot, skyline tour), ATT_STADIUM
src/gamepad.js      Gamepad API mapping (deadzone/expo, edges) + per-frame poll
src/landing.js      landing grade (rate, centreline, zone, flare, speed → S/A/B/C/D/CRASH) +
                    versioned personal bests
src/coach.js        landing coach on every final (0073): gear, flaps, speed, centreline, PAPI,
                    sink, flare/de-crab, then the rollout (pure state machine) + seen flag;
                    e2e specs import `test` from tests/e2e/fixtures.js (speech stubbed: silent)
src/assists.js      assist levels Kid · Learner · Pilot (ticket 0042): shapes the pilot's
                    input before stepFlightModel (physics untouched): bank/pitch/AoA
                    envelope, auto-trim, auto-coordination; Kid adds hands-off line-up,
                    no-dive floor, auto-flare; main.js adds Kid's autothrottle, gear/flaps
                    and soft landing. Pilot never calls in (pure, flown headless in tests).
                    A first visit (nothing stored) flies Learner; a stored level wins (0059)
src/apTutor.js      autopilot "show and teach": what it is doing and why, per phase (pure
                    state machine like coach.js); shown in the coach card, spoken, Your turn
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
src/sun.js          real sun (NOAA solar position) over DFW, Now/Dawn/Noon/Dusk/Night presets
                    (each with its moment, `at`), sky zenith/horizon/glow, haze (= horizon) and
                    light colours by sun elevation; night ambient keeps the imagery moonlit
src/sky.js          the real night sky (pure, tested): sidereal time, J2000 → sim rotation, the
                    Moon's topocentric position + illumination, nightness, star colours
src/skyDome.js      lazy chunk after boot: atmosphere dome (sun disc/halo, twilight glow, deeper
                    towards space with altitude), Yale BSC stars (public/sky/stars-v1.bin from
                    scripts/bake-stars.mjs), the Moon with its real phase, METAR cloud layers
src/nightGround.js  shader patch on the ground's MeshBasicMaterials (terrainLod, photoreal):
                    moonlit grade after sunset + street lights on the asphalt (world space)
src/runwayLights.js lazy chunk: edge/centreline/threshold/end lights and ALSF-2/MALSR approach
                    lights with sequenced flashers, one Points draw (layout pure, tested)
src/viewPrefs.js    clean view (desktop panels folded, H) on by default, remembered
src/resScale.js     adaptive render resolution: steps the 3D pixel ratio down on slow 1 s
                    windows, back up after a fast cool-down that backs off (pure, tested)
src/wakeLock.js     Screen Wake Lock while flying (not paused/hidden/modal/results), feature-
                    detected and silent; hiding the tab pauses the sim + audio (ticket 0032)
src/hudLayout.js    canvas HUD geometry that depends on the screen (heading box clears the
                    phone's top bar in landscape) and the camera FOV (62° vertical in
                    landscape; portrait opens towards 60° across, capped at 80° vertical:
                    an iPad gets 60°, a phone ~42°, 0044; pure, tested)
src/aircraftModel.js  detailed open-licensed glTF aircraft (0045), lazy after the first Fly:
                    GLTFLoader + three's bundled meshopt decoder, public/models/*.glb in the
                    body frame (nose -Z, wheels at -gearHeight), gear_* nodes follow the gear;
                    the primitive in main.js buildAircraft stays as the fallback. Built by
                    scripts/build-models.mjs from assets-src/models/ (README: sources, rules)
src/flightModel.js  the 6-DOF rigid body: one sub-step of forces, moments, gear contact and
                    integration on a `body` (main.js passes `sim`). Pure: flown headless by
                    tests/flight/ against published performance data
src/fdm/jsbsim.js   JSBSim adapter (?fdm=jsbsim): the same contract as stepFlightModel on
                    JSBSim (LGPL WASM, own chunk, lazy after Start flight); trims the
                    elevator on spawn, lever→plate throttle map. fdm/loadJsbsim.js loads it
                    in the browser, tests/flight/jsbsimNode.js in Node. The aircraft it flies
                    is our own MIT data: public/jsbsim/ (C172 from POH + Roskam)
src/systems.js      aircraft systems (pure, run first in every flightModel sub-step): hydraulic
                    gear and flap travel (levers are commands; gearPos/flapDeg/flapPos are where
                    they are), 737 flap load relief, brake pressure + anti-skid, autobrake
                    1/2/3/MAX (Boeing decelerations), thrust reversers, belly when not locked
src/gear.js         landing gear on oleo struts (0074): nose + mains at their real positions,
                    per-wheel loads and moments through spec.inertia, harder rebound damping,
                    pedal nose-wheel steering, the tail against the mains' moment with q
src/atmosphere.js   ICAO standard atmosphere + the METAR's temperature/altimeter: density,
                    IAS ↔ TAS, speed of sound (pure, tested against the ICAO table)
src/engine.js       thrust by engine type: fixed-pitch prop (thrust table + δ/√θ power lapse,
                    windmilling at idle), turbofan (Mach/density lapse, idle, spool lag)
src/aero.js         pure aero/avionics: CL with stall, CD + ground effect, PAPI, stabilized-
                    approach gate (500/1,000 ft, ILS dots),
                    GPWS callouts, takeoff callouts (80 kt, V1, rotate, positive rate; 0035),
                    warnings, heading math
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
tests/e2e/          Playwright: smoke, controls, missions, phone, perf probe, device-class probe
                    (`devices` project: iPhone/iPad/Pixel sizes, touch, 4x CPU, 0044)
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
| `npx playwright test --project=devices --no-deps` | The device-class probe alone (iPhone 15 both ways, iPad Air both ways, iPad Pro 12.9 portrait, Pixel 8, Chromium with emulated touch; touch, 4x CPU throttle, layout + frame time; numbers in `docs/PERF.md`) |
| `npm run check:fast` | Everything but e2e, for sandboxes that can't install Playwright browsers. CI still runs the full gate. |

Budgets: JS ≤ 201 kB gzipped at boot (2026-10-21: 201.00 kB after 0045's model hook; the loader,
decoder and model are lazy, the twin-jet is 29 kB gz. 2026-10-19: 200.27 kB after 0055/0056/0011: the night
ground shader the imagery needs at first paint, the HUD tapes, clean view and When? picker
(+3.0 kB); the sky dome (4.9 kB gz) and runway lights (1.9 kB) are lazy chunks and the star
catalogue (43 kB gz) is fetched by the dome; raised from 198 to 201. Before that: 197.25 kB with the ?fdm=jsbsim hook and the turn-rate heading hold (+0.3 kB), raised from 197 to 198; JSBSim itself is a lazy chunk, 4.6 kB JS + 493 kB WASM gz, fetched only with ?fdm=jsbsim; 196.95 kB after 0042's assist levels, raised from 196 to 197; 195.02 kB after 0032's wake lock + pause on hide (+0.43 kB after trimming to locals and dropping a per-frame duplicate), raised from 195 to 196; 194.6 kB after 0029's generated mission picker; 193.2 kB after 0046 and 0026; 191.4 kB raised from 190 for the validated flight model: atmosphere, engines, per-flap aero, feed-forward autothrottle; 2026-10-17: 184 kB, almost all three.js; raised
from 180 for photoreal: three is one module, so the core classes the lazy glTF/3D-tiles
chunk needs are hoisted into the entry chunk; 3d-tiles-renderer + Draco load only when
photoreal starts), CSS ≤ 10 kB gzipped (4.2 kB). Frame-time numbers live in `docs/PERF.md`.

## 6 · The agents

Four cloud routines run this repo with no human in the loop (see `agents/prompts/`):

| Agent | Job | Branch prefix |
|---|---|---|
| Scout | Plays the build, researches, grooms and refills `docs/backlog/` | `scout/` |
| Builder | Ships the top ready ticket test-first, merges on green, verifies live | `build/`, `fix/` |
| Keeper | Dependencies, perf budget, refactors, prompt tuning, red-main backstop | `keep/` |
| Validator | Independently checks merged work: flight test cards vs published data, iPhone/iPad/Android device runs, a first-timer and a pilot play-through; files gaps, reverts regressions | `fix/`, `scout/` |

Nobody validates their own work. Before merge the Builder runs a three-reviewer
validation panel (flight physics, device + performance, first-timer); after merge the
Validator measures again from the outside.

The operator controls them via `agents/control.json` (pause, per-agent enable, focus,
caps) and their schedules at https://claude.ai/code/routines (frequency).

## 7 · Definition of done

- [ ] `npm run check` green locally and in CI
- [ ] Test added that fails without the change
- [ ] Flight-model changes: `tests/flight` green, a card for the new behaviour, no card regressed
- [ ] Validation panel run (Builder § 7); findings fixed and listed in the PR body
- [ ] Screenshot checked at 1280x720, 390x844, 844x390 and 820x1180 (iPad)
- [ ] No new runtime hosts, no new console errors, frame budget held
- [ ] Ticket marked `shipped` with PR number; `docs/CHANGELOG.md` line added
- [ ] Lesson appended to `docs/LESSONS.md` if one was learned
