# AGENTS.md — Operating manual for OpenAero DFW

Everything an agent (or human) needs to work on this game. Read it fully before changing
anything. `CLAUDE.md` points here.

## 1 · Product vision

OpenAero DFW is a browser flight simulator set over the real Dallas-Fort Worth metroplex:
real satellite imagery underneath, real airports (KDFW, KDAL Love Field, KADS Addison,
KAFW Alliance, KFTW Meacham, KGKY Arlington) where they actually are, and a 6-DOF flight
model that feels believable. It opens in a second, needs no install or account, and runs
on a laptop or a phone.

It must be **approachable for a casual player and rewarding for a pilot**. A first-timer
should be on a stabilized final to DFW 35C within 30 seconds and land it with the PAPI and
the velocity vector guiding them. Someone who flies for real should recognise the
procedures: correct runway headings and thresholds, a 3° glidepath, believable V-speeds,
real frequencies, wind that actually pushes the aircraft, GPWS callouts that match the
real cadence.

**North star for the Scout:** authenticity you can check against a chart, and feel you
notice in the first minute. Prefer making the DFW world truer (real coordinates, real
procedures, real landmarks, honest weather) and the flying feel better (control response,
touch controls, landings that are satisfying to grease) over adding new aircraft or modes.
Never claim something is "live" or "real" unless it is.

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
3. **Allowed runtime hosts:** `server.arcgisonline.com` (Esri World
   Imagery tiles, loaded as WebGL textures) and nothing else. The on-screen attribution
   ("Satellite imagery © Esri, Maxar, Earthstar Geographics") must stay visible. Adding any
   other host (e.g. a live METAR source) needs the operator: open a `proposal/` PR.
   No analytics, ads, trackers, fonts or scripts from CDNs. Everything else is bundled.
4. **Frame budget.** The render loop must hold 60fps on a mid-range laptop and stay
   playable on a recent phone. No per-frame allocations in hot paths (reuse vectors and
   arrays), no layout thrash from the HUD.
5. **Mobile.** Touch controls work at 390x844, touch targets ≥44px, no page scroll or
   zoom while playing, safe-area insets respected.
6. **Save data compatibility.** No persistent state yet. When you add some, use
   `localStorage` keys prefixed `openaero_`, store a `v` version field, and migrate old
   versions on read; never throw away a player's data.
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
src/runways.js      runway table + downtown landmark origin (sim metres)
src/geo.js          Web Mercator tile math, lat/lon → sim metres, Esri tile URLs
src/aero.js         pure aero/avionics: CL with stall, CD + ground effect, PAPI,
                    GPWS callouts, warnings, heading math
src/input.js        keyboard state → control targets, virtual stick mapping
src/audio.js        Web Audio engine/wind/stall/GPWS chirps (starts on user gesture)
src/styles.css      Tailwind entry + ported custom HUD styles
tests/unit/         Vitest for the pure modules
tests/e2e/          Playwright: smoke, controls, missions, phone, perf probe
```

World frame: metres from the KDFW origin, +X east, +Y up, **−Z north**. Loop per frame
(`renderLoop`): `step6DofPhysics(dt)` (3 sub-steps of `integrateSubStep`, dt capped at
50 ms) → `updateCamera` → `renderer.render` → `renderHud` (2D canvas) → `renderRadar`
→ `syncUI` (DOM text) → `audio.update`.

## 5 · Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server at http://localhost:5173/openaero/ |
| `npm run build` | Production build into `dist/openaero/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | Playwright e2e (builds first) |
| `npm run check` | **The gate**: backlog validator + unit + build + e2e. CI runs exactly this. |

Budgets: JS ≤ 180 kB gzipped (2026-10-16: 137.6 kB, almost all
three.js), CSS ≤ 10 kB gzipped (4.2 kB). Frame-time numbers live in `docs/PERF.md`.

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
