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
   progress you can measure (`scripts/check-gaps.mjs` fails the gate on a gap card with
   no ticket tag, or whose ticket is missing, shipped or dropped). Every object that moves in the world (aircraft, gear,
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
   **One exception, the operator's decision of 2026-10-30 ("split by audience"):** the same-origin
   Marquee loader `../ads/v1/ads.js` (mutaafaziz.com/ads, a separate Worker and repo; app id
   `openaero`, audience kids) is allowed, wired by `src/ads.js` (a lazy chunk). Its slots are all
   menu context (`title` banner on the start screen, `postflight` interstitial on FLY AGAIN,
   `livery` rewarded): Google ads appear only there, tagged child-directed by Marquee, which may
   then load Google's ad script (`pagead2.googlesyndication.com` and its frames) from a menu, never
   at boot and never in flight. **No ad, ad request or ad call in flight** (start screen or results
   card on screen, the sim paused for any break, audio with it). The rewarded ad is opt-in only (a
   button that says it is an ad, hidden when the slot has no fill). Kid shows no ads at all, nor
   does a clean view the player chose (stored). The post-flight break skips a visit's first FLY
   AGAIN and is capped (`BREAK_GAP_MS`). A missing or blocked loader is a no-op; nothing waits on an
   ad. e2e serves an empty loader (tests/e2e/fixtures.js); tests/e2e/ads.spec.js proves no call
   fires in flight. Any other ad network, tracker or analytics still needs a `proposal/` PR.
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
   `openaero_view_v1 = { v: 1, clean, at }` (`src/viewPrefs.js`); haptics
   `openaero_haptics_v1 = { v: 1, on, at }` (`src/haptics.js`). Kid and Learner keep
   their personal bests under `<missionKey>@kid` / `@learner` in `openaero_best`; Pilot keeps
   the plain mission key.
7. **Accessibility floor.** Respect `prefers-reduced-motion` for screen shake/flashes;
   every control has a keyboard path; text meets 4.5:1 contrast on HUD backgrounds.

## 4 · System map

```
index.html          markup: viewport canvases, HUD panels, onboarding modal (Tailwind classes)
                    + the installable app (0086): public/manifest.webmanifest (fullscreen,
                    relative start_url/scope, no service worker), icons in public/icons/ drawn by
                    scripts/build-icons.mjs from assets-src/icons/icon.svg; viewport-fit=cover, so
                    every edge element keeps clear of env(safe-area-inset-*)
src/main.js         renderer + scene build, 6-DOF integrator, camera, HUD/radar drawing,
                    scenarios, UI event wiring, render loop. Still large (ported glue):
                    the Keeper carves it into modules, no behavior change per PR.
src/constants.js    units, KDFW origin, field elevation
src/aircraft.js     aircraft database (mass, wing, lift/drag, thrust, V-speeds, damping)
src/airports.js     real runways (OurAirports; KAFW's ends from the FAA record, 0124, end.src) for KDFW/KDAL/KADS/KAFW/KFTW/KGKY, runway-end
                    thresholds, approachGeometry, selectActiveRunway, approach/takeoff spawns; papiWhite (0131: the one
                    PAPI reading for the HUD, coach and 3D lamps, aero.js papiWhiteLights at AC 150/5340-30J's G ±10'/±30'); runwayFactsText
                    (0114): the start screen's chart line (ident, length x width, °M, threshold ft MSL)
src/missions.js     mission catalogue (approaches by runway end, tours by spawn, a blurb each;
                    groupMissions() builds the start-screen picker, ticket 0029) + the dynamic
                    crosswind_today mission (weather.js pickCrosswindRunway, live METARs only)
                    + night/dusk missions (0060): `sun` (a TIME_MODES preset) flies for that mission's run;
                    missionSun keeps the player's When? choice and gives it back on the next mission without one
src/landmarks.js    Dallas landmarks at true lat/lon (cited) + real heights, via geo.js;
                    DOWNTOWN_DALLAS (map dot, skyline tour), ATT_STADIUM
src/gamepad.js      Gamepad API mapping (deadzone/expo, edges) + per-frame poll; a lazy chunk fetched once a pad shows up in
                    main.js updateGamepad's getGamepads (0161: also a pad pressed before boot's listener), PAD_CLICKS names the button each pad button presses
src/landing.js      landing grade (rate, centreline, zone, flare, speed → S/A/B/C/D/CRASH) +
                    versioned personal bests + the bounce tracker (0091: wheels > 2 ft for 0.3 s
                    after a contact; the card waits for 1 s on the wheels; 1 bounce caps C, 2+ D,
                    a re-contact past 600 fpm or 10° bank is a CRASH; wheels past 50 ft drop the
                    landing as a go-around; Kid holds the flare through a bounce)
src/results.js      the results card (lazy chunk, prefetched after boot, retried at the card); the
                    flight pauses behind it, in the air and on the rollout (0106); its runway strip
                    (0088, src/touchdownStrip.js, in the same chunk) draws gradeLanding's `touchdown`
                    (along/across, runway length/width, the end's displaced pavement): the aiming point at
                    airports.js AIM_POINT_M, the green band at landing.js ZONE_FULL_M (the zone's full marks)
                    The card is a flex column (0125): the grade and the button row stay put, #resultsBody
                    (reason, tip, gate, strip, factors) scrolls if the screen is short (Safari sideways ~340 px)
src/coach.js        landing coach on every final (0073): gear, flaps, speed, centreline, PAPI,
                    sink, flare/de-crab, then the rollout (pure state machine) + seen flag;
                    e2e specs import `test` from tests/e2e/fixtures.js (speech stubbed: silent)
src/takeoffCoach.js the takeoff mission's coach (0093, lazy chunk loaded with the mission, behind the coach
                    checkbox; not on the RTO/engine-failure drills): full power, brakes off, centreline, rotate
                    at Vr to ROTATE_PITCH_DEG (737 8°, FCTM; F-16 10°, the -1's 8-12° as quoted second-hand;
                    Cessna 7°, unpublished), "ease the nose" 1° short of tailStrikeDeg under 10 ft (the 737's 11°,
                    the Cessna's tail on static struts 13.7°), "slow" under 1.13 Vs, positive rate gear up, climb at
                    the speed the takeoff trim flies at the flaps set (climbKts; the F-16 an attitude); over at 1,000 ft. Feeds coach.js as s.ds/s.dsGround, adds its
                    words/ranks; a prompt that left can't return for 4 s. Cards: tests/flight/takeoffCoach.test.js
src/assists.js      assist levels Kid · Learner · Pilot (ticket 0042): shapes the pilot's
                    input before stepFlightModel (physics untouched): bank/pitch/AoA
                    envelope, auto-trim (the pitch hold damps only the pitch rate past a coordinated turn's (g/V)·tan φ·sin φ, 0161),
                    auto-coordination; Kid adds hands-off line-up,
                    no-dive floor, auto-flare (sink profile per airframe: spec.kidFlarePerS, the 737's quicker, 0101) and its de-crab
                    (0100: under 2.5 m, not climbing away, rudder lines the nose up with the track: driftDeg, yawRateRight; on the mains
                    with the nose wheel up, noseWheelDown false, the rudder turns it to the runway hold's heading; kidFinalGuide's line-up
                    banks low over the whole runway); kidFinalGuide is Kid's hands-off final (the
                    3° path, past the threshold only low over the first third, ≤ 2°, 0098;
                    flight cards in tests/flight/kidFinal.test.js); main.js adds Kid's autothrottle, gear/flaps
                    and soft landing. On the runway Kid and Learner hold its centreline with the
                    pedals (groundSteerRudder, 0110); at landing speeds shapeControls asks 5°/s more per degree (up to 1°), so the
                    rudder surface helps (0150: the nose tyre's grip can't hold a 737 against 20 kt alone; no yaw-rate damping,
                    it chattered through the nose wheel; Learner gets Kid's rudder on the mains too; the F-16 in 25 kt is 0158). Pilot never calls in (pure, flown headless in tests).
                    A first visit (nothing stored) flies Learner; a stored level wins (0059)
src/goAround.js     go-around drill (0047, lazy chunk loaded with the mission): pure state
                    machine (unstabilized gate → positive rate through 500 ft = complete,
                    landing anyway = capped D), the go-around grade; coach.js has its prompts
                    and in the missed approach the flap lever comes up a notch
src/stallDrill.js   stall recovery drill (0087, lazy chunk like goAround.js): the C172 at 4,500
                    ft over Grapevine Lake; pure state machine (armed → stalled → unstalled →
                    complete/failed), the grade (reaction, height vs POH 230 ft, bank, secondary
                    stall; held stick capped D, even when an assist unstalls it; secondary C; no
                    recovery without power; only a slow, idle stall counts) and drillAssist
                    (Kid/Learner stall protection off until the stall); coach.js picks its
                    prompts, their words are STALL_TEXT here. Every drill chunk adds its words
                    to coach.js DRILL_TEXT when it loads (0036: off the boot budget)
src/deadStick.js    dead-stick challenge (0036, lazy chunk): the C172 3,500 ft AGL abeam
                    Addison with sim.engineFailed (flightModel.js no power whatever the
                    throttle, JSBSim fuel off; HUD "ENG OUT"/"THR OUT"; no autopilot, no
                    stabilized gate, idle/retard/bounce-power calls or engine tone). Its coach
                    (best glide 68 KIAS; glide on, "turn left now" for a 1 NM final, low/high
                    against the glide ratio by flaps and wind, POH Fig. 3-1) feeds coach.js as
                    s.ds; Kid's hands-off guide flies the same pattern at best glide (no dive
                    floor, autothrottle or auto flaps). The touchdown is graded on Addison
                    wherever it is (made the runway 30%; missed = D with the distance and why:
                    short, long or beside); ?debug openaeroDebugDeadStick puts it on a final
src/pattern.js      traffic pattern (0048, lazy chunk): the C172 on a left downwind for Addison 16 at
                    1,000 ft AGL (AC 90-66C), 0.75 NM out. patternLeg names the leg around any runway
                    end (upwind, crosswind, downwind, base, final; left or right traffic), the turn
                    to start (base with the threshold 45° behind the wing, final a 20° turn's radius
                    out) and the height (1,000 ft, then ~4.2° down from abeam the numbers). Its
                    pt* words reach coach.js through s.ds (the landing coach takes the final);
                    Kid's guide flies the legs, and past the threshold the 3° path to the aim point
src/engineOut.js    engine failure after takeoff (0104, lazy chunk): the C172 on all of Addison 16,
                    the engine quits at the mission's engineOutFt (300 or 700 ft). turnbackHeightFt
                    (reaction, a turn of 180° + twice the cut back from 2R beside, sink 1 + k(n²−1),
                    the glide back downwind, less the climb's spare speed) decides "you can turn
                    back" / "land ahead"; flight cards fly the window (tests/flight/engineOut.test.js).
                    Graded on Addison (deadStick.js's miss grader): ahead in a field ≤ B, a turn back
                    below the height or a stall ≤ D with what the turn cost; Kid glides ahead
src/rto.js          rejected takeoff drill (0107, lazy chunk): the 737 on DFW 35C, an engine fire
                    warning at 75-110 kt (below V1) on the roll; the engine keeps its thrust until the
                    levers close. Pure state machine (armed → fire → stopped / overrun / off / rotated),
                    the grade (reaction to idle, stop vs a 2.5 s + 14 ft/s² reference, centreline; D
                    capped for an overrun, off the side or a takeoff), the coach's steps (ranks join
                    coach.js RANK); the HUD banner says ENGINE FIRE — IDLE, BRAKES; Kid gets idle +
                    autobrake MAX. Flight cards: tests/flight/rto.test.js (25.109 accelerate-stop)
src/windshear.js    microburst windshear drill (0112, lazy chunk): the 737 on a 3 NM final to DFW 35C;
                    at 600 ft the shear (shearAt: +15 kt headwind, 35 kt of it lost in 15 s to a 20 kt
                    tailwind, a 1,500 fpm downdraft in the core fading out below 400 ft, 46 s) is added to
                    the METAR's air in main.js updateWind (addShearWind, windVec.y down). State machine
                    (final → shear → warning at 7 s → clear / failed), WINDSHEAR banner + callout, the AP
                    and its tutor stay off in the warning, no stabilized gate; graded on reaction to full
                    power, the pull-up to 15°, the nose held up (a dive below the attitude at full power, or
                    a nose held low, caps C), height lost, stick shaker; the ground is a CRASH. Kid: power
                    held through the outflow, then full power and 15° (its cap 12.75°), no gear/flaps; its
                    card scores only the result. Touch words say which way the stick goes (TOUCH_WORDS).
                    Cards: tests/flight/windshear.test.js (no reaction hits ~1.4 km short; thrust-only
                    loses ~460 ft; the escape ~150 ft; a dive for speed ~370 ft)
src/steepTurns.js   steep turns (0161, lazy chunk loaded with the mission): the C172 at 3,000 ft AGL over Grapevine Lake,
                    95 KIAS; a 360° at 45° of bank, then one the other way, graded to FAA-S-ACS-6C Area V Task A (entry
                    altitude ±100 ft, airspeed ±10 kt, bank ±5°, roll out on the entry heading ±10°): worst altitude and
                    speed (IAS through a 2 s filter: a gust's spike is not the pilot's), the share of each turn's middle at
                    45° ±5, the worst roll-out (a 720° counts its extra turn); outside a tolerance or under 90% of the bank
                    ≤ B, more than 200 ft off or under 30% of the bank ≤ D, not finished (500 ft, a stall, 150 s) D. Its stt* words reach coach.js through s.ds; Kid
                    and Learner get a 53° bank cap there (assists.js s.bankMaxDeg: full stick = 45°), Kid's guide flies the
                    turns (pitch for the path less α(1 − cos φ)) and Kid's autothrottle holds 95. sim.steepTurns is null once
                    graded (KEEP FLYING is free flight). Cards: tests/flight/steepTurns.test.js
src/apTutor.js      autopilot "show and teach": what it is doing and why, per phase (pure
                    state machine like coach.js); shown in the coach card, spoken, Your turn.
                    A lazy chunk fetched right after boot (0091); its on/off flag and blank
                    state are src/tutorPrefs.js, at boot
src/trim.js         Pilot's pitch trim (0094): trimStep moves sim.trimAlphaDeg, 9%/s of hands-off
                    speed ([ ] / Numpad 7 1, the touch rocker by the throttle, the gamepad's right
                    stick), stops 4° short of the stall and at spec.vneKts; trimSpeedKts is the
                    HUD's amber T speed. Not under autoTrim, the F-16's pitchFbw or JSBSim.
                    takeoffTrimAoaDeg (0141): the takeoff spawn's trim, flaps up Vy where spec.vyKts is
                    published (the C172's 74), else 1.2 Vr
src/autopilot.js    autopilot control laws (pure) + weathervane term + trim AoA. **Sign
                    conventions (pinned by tests):** aileron + = roll right, elevator + =
                    nose down, rudder + = yaw right; body rates: angVel.x + = nose up,
                    angVel.y + = nose left, angVel.z + = roll left.
src/magvar.js       magnetic variation (0078): WMM-2025 2.7° E over DFW (NCEI, cited); the HUD heading,
                    HDG, NAV1 runway course and tutor read magnetic (°M), physics/geometry/wind stay true
src/geo.js          Web Mercator tile math, lat/lon → sim metres, Esri tile URLs
src/terrain.js      the one ground truth: baked DEM (public/terrain/dfw-dem-v1.bin, from
                    AWS Terrain Tiles via scripts/bake-terrain.mjs) + every runway
                    flattened onto the plane through its surveyed end elevations.
                    ground.heightAt(x, z) → sim Y; physics, AGL, runways, PAPIs read it
src/ecef.js         WGS84 ECEF ↔ geodetic ↔ sim (geoid plane fit), rigid ECEF→sim matrix
src/googleSession.js  the billable part of Google 3D Tiles: one root per page, quota
                    back-off, signed URLs, usage counters (pure, tested)
src/photorealLazy.js  boot stand-in for photoreal.js (same API, idle until Fly loads the chunk) +
                    photorealAllowed (0084)
src/photoreal.js    Google Photorealistic 3D Tiles (lazy 3d-tiles-renderer): exact per-
                    vertex ECEF → sim remap on load, vertical calibration against runway
                    thresholds, attribution, ?debug usage readout
src/tileTree.js     quadtree LOD selection for the streamed imagery (pure, tested)
src/terrainLod.js   streamed Esri imagery draped on terrain.js: per-tile height grids with
                    skirts, hillshade in vertex colours, load queue, LRU cache; reset() drops it
                    when the WebGL context is lost (0034: main.js pauses behind #gfxLost, Resume
                    after restore, Reload after 5 s)
src/sun.js          real sun (NOAA solar position) over DFW, Now/Dawn/Noon/Dusk/Night presets
                    (each with its moment, `at`), sky zenith/horizon/glow, haze (= horizon) and
                    light colours by sun elevation; night ambient keeps the imagery moonlit
                    defaultTimeMode (0151): the boot's When? is Noon (the Day chip) while the live sun is
                    below -6° (civil twilight), else Now; nothing stored, Live one tap away
src/sky.js          the real night sky (pure, tested): sidereal time, J2000 → sim rotation, the
                    Moon's topocentric position + illumination, nightness, star colours
src/skyDome.js      lazy chunk after boot: atmosphere dome (sun disc/halo, twilight glow, deeper
                    towards space with altitude), Yale BSC stars (public/sky/stars-v1.bin from
                    scripts/bake-stars.mjs), the Moon with its real phase, METAR cloud layers
src/nightGround.js  shader patch on the ground's MeshBasicMaterials (terrainLod, photoreal):
                    moonlit grade after sunset + street lights on the asphalt (world space)
src/runwayLights.js lazy chunk: edge/centreline/threshold/end lights and ALSF-2/MALSR approach
                    lights with sequenced flashers, one Points draw (layout pure, tested); on at night or under 5 SM
                    (its update). Re-exports landingLight.js, so the landing light shares its chunk (no boot name)
src/landingLight.js the landing light (0076, in runwayLights.js's chunk): a grid over the beam's footprint on terrain.js heights
                    (lifted 0.3 m + 0.4% of the distance over the coarser drawn tiles), drawn twice: dst · (1 + k) (the ground's colour)
                    and k · PAVEMENT added (the near-black runway decals); k = gain · cone · cos(incidence) / r², a display gain on the
                    sRGB frame tuned by eye (poolK, FRAG, footprint, lampAxis: pure, tested), faded by the scene fog both ways;
                    lampGain = GAIN · uNight⁴ (nothing while the sunset sky is bright, 0 by day: hidden). Re-laid only when the lamp
                    moves past the grid's margins; no per-frame allocation. A faint beam cone in outside views and the replay. LAMPS
                    (placement, aim for the landing attitude, spread; approximate; the F-16's on the nose gear) here, not in boot
                    aircraft.js. On at every new flight; off climbing through 10,000 ft MSL, on descending (AIM 4-3-23 encourages
                    them below 10,000 ft); L (not in a form field) or the menu's #btnLandLight (💡; "Landing light" from lg); not stored.
                    ?debug: window.openaeroLandingLight (as runwayLights.js/windsock.js set their own ?debug handles)
src/touchdownFeel.js touchdown you can feel (0147, in runwayLights.js's chunk like landingLight.js): at each contact main.js touchdownBuzz
                    counts (first touchdown and re-contacts) touch() plays a synthesized tyre chirp (band-passed noise) and, from
                    240 fpm, a thump (95 → 40 Hz + an overtone a phone speaker plays) on audio.js's ctx (only while it runs, not behind a menu), louder with the sink (touchdownFeel: pure, capped at the 600 fpm
                    crash line; a belly landing: the thump alone), and puffs smoke at both mains' axles from 100 fpm: a pool of 6 sprites on one DataTexture, drifting downwind,
                    animated by its own rAF on the wall clock for 1.4 s (no render-loop call). A game-feel cue by the sink, not a tyre
                    spin-up model. Reduced motion: no puff; sound off: silent; Kid: a light chirp only. ?debug window.openaeroTouchdownFeel
src/buffet.js       stall buffet (0079, in runwayLights.js's chunk, created by its createTouchdownFeel wrapper on the group's 'added'): buffetIntensity (pure) 0 below 85% of aero.js stallAoaDeg on |α|, smoothstep
                    to 1 at the stall angle (1 past it): ~2.5-3.5 kt above the C172's stall, after the Vs + 5 horn. wingBuffet: the stall angle where the
                    flaps are (flapPos, in transit too) and × (IAS / Vs)² capped at 1 (a tail slide hardly shakes). createBuffet sets
                    scene.onBeforeRender/onAfterRender: the AoA smoothed ~0.15 s, a camera shake (shakeAt into a scratch object, ≤ 0.35° pitch,
                    11/17 Hz; yaw 40%) only in the Cockpit 3D and Wing Tip views, put on after the camera's pose and taken off after the draw (the
                    HUD's projections never see it), and a 300 Hz low-passed noise rumble wobbling at 9 Hz on audio.js's ctx (only while it runs
                    and sound is on; its noise made in idle time, its nodes stopped 2 s after the buffet ends). Off on the ground, paused,
                    behind the start screen, in the replay. Reduced motion: no shake, #buffetCue (the screen's edge, inside the safe area, glows
                    amber by the intensity; z 15, under the panels) instead. Never feeds the physics. Kid's and Learner's AoA caps stay under
                    its onset (the F-16: 0.007 at their 24°; its limiter's ~25° and Kid's flare cap 0.2). A full-stall touchdown's hold-off
                    (the C172 a knot above Vs) buffets ~0.66. Cards: tests/flight/buffet.test.js. ?debug window.openaeroBuffet
src/fuel.js         the Cessna's fuel (0162, in runwayLights.js's chunk, created with buffet.js on the group's 'added'; Pilot only):
                    53 gal usable, burnt on the sim clock (scene.onBeforeRender, sim.simTime) at the POH Fig. 5-8 lean flow for the
                    brake power: torque × rpm, the torque engineN × engine.js's piston lapse (inlined with the ISA and the altimeter
                    setting, pinned by a unit card), the rpm engineSound.js engineRpm's (fetched lazily, passed in: a static import
                    cost boot 20 B); at each Fig. 5-8 row's KTAS the model turns its rpm within ~1% and makes its power within ~4
                    points (Fig. 5-8's rows are one line of % BHP, extended past 40-83% along its end segments). A ground spawn starts full, an airborne
                    one less Fig. 5-7's 1.4 gal start/taxi/takeoff and its climb fuel. Dry: sim.engineFailed (the dead-stick path, ENG
                    OUT) and sim.fuelOut (the results card's FUEL EXHAUSTED). #txtFuel (the weather ribbon, panels shown) / #txtFuelCell
                    (desktop clean view: a 7th cell in #topRow's strip, #fuelCell; never on a touch screen) /
                    #txtTouchFuel (over THR, inside the throttle's 64 px: two lines): "FUEL 50.2 GAL 5h31" (the hours left at this
                    burn, only at Fig. 5-8's 40-83% power, else gallons alone), amber under a fixed reserve (45 min at 75%, ~7.6 gal). main.js loadScenario nulls sim.fuelGal (fuel.js then refills and clears fuelOut);
                    Kid/Learner and the jets have none (a level change reloads the mission). Cards: tests/flight/c172.test.js
                    (Fig. 5-8 rows' rpm and power; burn; Section 1's 518 NM / 4.26 h and 638 NM / 6.72 h); ?debug window.openaeroFuel
src/windsock.js     wind cones (0027, lazy chunk after boot): one beside every runway end's touchdown zone
                    (~1,000 ft in, ~300 ft left, clear of every runway), streaming downwind in its own field's
                    METAR (the flown field: sim.wx), lifted by drag ∝ V² to straight out at 15 kt at the cone (AC 150/5345-27)
                    and swung there as a damped pendulum on the sim clock; gusts and the log-law thinning are
                    weather.js's, passed in. Two InstancedMesh draws; a minimum 0.7° on screen (≤ 7x) at range;
                    lit at night. ?debug: openaeroDebug().windsocks (debugScreen.js reads the handle), window.openaeroWindsocks
src/traffic.js      ambient traffic (0080, lazy chunk fetched by runwayLights.js's touchdown-feel hook, as fuel.js is):
                    one 737 at a time on a parallel final into DFW (only while the player's end is at KDFW; same flow,
                    2,500 ft+ beside the player's runway first, JO 7110.65 §5-9-6; placed never on their runway and
                    ≥ 1 NM from them, not kept apart afterwards: no collision; none on an end with over 10 kt of
                    tailwind, none after dark (uNight > 0.5: no lights yet)), the first one 5 s into a flight and 2.5 NM
                    closer than the player (1.5 NM at least: ~20° off the default final's nose, just inside a phone's portrait
                    view), later ones 4-8 NM out after a 40-90 s gap. Flown by stepFlightModel and the
                    autopilot's glidepath/flare/autothrottle laws at 1/60 s on the sim clock; its localizer is a track
                    law with a slow integral (main.js's heading law weaved in 18 kt of crosswind) and it de-crabs in the
                    last 2 m; its own wind from sim.wx at its own height (never sim.windVec: the windshear drill's
                    microburst); autobrake 2 (3 on 9,300 ft or less, MAX with under 1,800 m left), gone at 30 kt; drawn
                    with aircraftModel.js's twin-jet copy.
                    The flight model comes in as main.js `sim.fm` (importing flightModel.js, or autopilot.js without
                    assists.js, from a lazy chunk split aero.js out of boot; three's Group split Object3D). Off for the
                    flight once resScale sits at 1 on a screen above 1x. Cards: tests/flight/traffic.test.js (every
                    KDFW end lands in the touchdown zone). ?debug: window.openaeroTraffic()
src/replay.js       landing replay (0019, lazy chunk after boot): main.js records pos, quat, throttle, gear, flaps and
                    the stick into one preallocated ring buffer, the last 30 s at 20 Hz of sim time (reset by loadScenario);
                    ▶ REPLAY on the results card plays it back with the physics paused (main.js renderLoop calls its step
                    instead of updateCamera; the aircraft is posed from the recording, sim untouched): chase, then the
                    wing, then Side: a spot beside the end of the track (level with it if it ended aloft) for the last 7 s; any key or tap (#replayBar) returns
                    to the card. The HUD and panels hide (body.replaying), the imagery credits stay
src/debugScreen.js  ?debug only (lazy): openaeroDebug().runwayScreen, the active runway's screen outline, and papiLampsWhite (the 3D PAPI's white lamps);
                    hooks() installs the test hooks openaeroDebugFinal/Hop/DeadStick (0137; openaeroDebugCaption stays in main.js)
src/gateVerdict.js  the stabilized gate's HUD verdict (0020; lazy, fetched after boot, 0137): gateVerdictRect (pure, tested); the speed
                    tape's trim bug (0094) and low-speed band (0128) drawing (moved from main.js, 0156); also the
                    wind box's plain words for Kid/Learner (0142: windPlainWords RIGHT WIND / AIM INTO IT, Kid HANDS OFF, TAILWIND /
                    FLOATS LONG, HEADWIND / SHORT ROLL; a 24 px strip over the box; not on the ground, under 30 ft RA or under a
                    .coach-top card), drawn through drawAltCaption's call (main.js passes sim and _windBox)
                    and the altimeter setting (0146: baroRect/baroLabel/baroSource, "30.11 IN" over METAR / STANDARD (weather.js's 29.92 fallback) /
                    SCENARIO under the altitude tape, sim.altimInHg and sim.wx; Pilot only, not on an upright screen too short for it over the
                    touch deck; ?debug hudWind.baro). The tape is true MSL (terrain.js yToFtMsl): the setting feeds airAt, not the tape
                    puts it at cy + 76 under the boresight; on a screen held upright too short for that over the touch
                    deck (TOUCH_DECK_H + 40 px of inset) it takes the callout caption's slot under the heading box, as
                    narrow, and gives way while a caption shows (on a 320 px phone its lines are squeezed to fit)
src/viewPrefs.js    clean view (desktop panels folded, H) on by default, remembered
src/resScale.js     adaptive render resolution: steps the 3D pixel ratio down on slow 1 s
                    windows, back up after a fast cool-down that backs off (pure, tested)
src/haptics.js      phone haptics (0033): touchdownPattern by sink (landing.js's bands: < 240 fpm a 40 ms
                    tick, ≤ 600 80 ms, else [80,40,120]; Kid never the last; re-contacts too), stall/pull-up pulses once per onset (createAlertEdge,
                    3 s hold-off), feature-detected navigator.vibrate (Android; iOS has none). Reduced motion:
                    no alert pulses, one short touchdown tick. "Vibrate" toggle only on touch-only screens
                    with the API (main.js canBuzz); e2e haptics.mobile.spec.js stubs vibrate
src/wakeLock.js     Screen Wake Lock while flying (not paused/hidden/modal/results), feature-
                    detected and silent; hiding the tab pauses the sim + audio (ticket 0032)
src/hudLayout.js    canvas HUD geometry that depends on the screen (heading box clears the
                    phone's top bar in landscape) and the camera FOV (62° vertical in
                    landscape; portrait opens towards 60° across, capped at 80° vertical:
                    an iPad gets 60°, a phone ~42°, 0044; pure, tested) + the coach card's slot (0130:
                    coachOverHud; over the tapes, SPD label or 12% under the horizon on a short upright
                    screen or the iPad held sideways, main.js placeCoach moves #coach under the top bar,
                    .coach-top, for the rest of the flight; .coach-tight if it would reach the heading box) + the wind box
                    (0075): over the altitude tape, its text (source, arrow, speed, XW/HW
                    vs the active runway under 1,500 ft) refreshed once a second; fixed1
                    (the AoA badge's one decimal, never "-0.0", 2026-10-31); altCaptionRect (0132): the altitude tape's "MSL"
                    tab under its readout box, right of the ticks (drawTape keeps the scale's numbers off it); gateVerdict.js (lazy) draws it and holds
                    altLabels (0140): Pilot MSL / AGL, Kid and Learner "SEA LVL" (a 51 px tab) / "GROUND" (index.html's
                    .plainWord/.pilotWord spans, body.assist-pilot from setAssist)
src/prism.js        flat-sided prism from a convex outline (the primitive 737's wing and fin; no
                    ExtrudeGeometry, which costs ~8 kB of boot JS: earcut + three's curves, 0105)
src/aircraftModel.js  detailed open-licensed glTF aircraft (0045), lazy after the first Fly:
                    GLTFLoader + three's bundled meshopt decoder, public/models/*.glb in the
                    body frame (nose -Z, wheels at -gearHeight), gear_* nodes follow the gear;
                    the primitive in main.js buildAircraft stays as the fallback. Built by
                    scripts/build-models.mjs from assets-src/models/ (README: sources, rules)
src/surfaces.js     moving parts (0063, lazy chunk after boot): ctl_* surfaces from the control
                    state at each aircraft's real throws (spec.controlThrowsDeg), flaps from
                    flapDeg, gear legs swung by gearPos, prop/fans by the spool; pure mapping,
                    poseParts allocates nothing. The twin-jet glTF has no ctl_* nodes yet
src/flightModel.js  the 6-DOF rigid body: one sub-step of forces, moments, gear contact and
                    integration on a `body` (main.js passes `sim`). Pure: flown headless by
                    tests/flight/ against published performance data. Sideslip (0081): side
                    force spec.cyBeta/cyRudder and dihedral spec.clBeta (as aileron, /clAileron).
                    Pitch stability (0090): the nose returns to body.trimAlphaDeg, full stick =
                    spec.elevatorAlphaDeg (Cmδe/Cmα); autoTrim (assists, AP, harness pilots) and
                    spec.pitchFbw (F-16) carry the trim with α; Pilot's is the spawn's (or the
                    autopilot's), moved only by a held stick (main.js, ~8 s, 4° short of the stall).
                    Roll (0156): rollRateGain, the steady rate per aileron, goes as the TAS where a
                    source gives the roll power (spec.rollPerTas: C172 Roskam p·b/2V 0.116; F-16
                    TP-1538 0.128, capped by its 308°/s roll-rate command spec.rollCmdRad); the 737
                    keeps the old constant rollAuthority/rollDamping. Every bank hold (autopilot,
                    assists) multiplies its aileron by rollHoldScale, so its loop is the old one.
                    body.loadFactor (0121): the seat's g along the body up axis, the HUD's G-LOAD
src/fbw.js          the F-16's g/AoA limiter (0121; a push stops at TP-1538 Fig. 62(b)'s 0 to −3 g by q̄, 0138; lazy chunk right after boot; tests/flight/harness.js
                    imports it), and its roll-rate stick (0156: spec.pilotRoll, Pilot's expo curve on touch/gamepad and a
                    ~0.5 s ramp on the keys; main.js smooths linearly until it loads): installs spec.fbw on pitchFbw airframes, which flightModel.js calls in
                    the air. NASA TP-1538 App. A + Fig. 63: the stick commands 1 g + 8 g × the pull,
                    capped at 9 g less 0.322 g/° past α 15° and 1.322 g/° past 20.4° (1 g at ~25°)
src/supersonic.js   the F-16's wave drag (0133, lazy chunk right after boot; tests/flight/harness.js
                    imports it): installs f16.transonic (Korn + Lock rise) and f16.supersonicCd past MDD
                    (Raymer's Sears-Haack correlation, AeroSandbox's transonic fairing), aero.js waveDragCd
src/pitchBreak.js   the Cessna's post-stall pitch break (0109, lazy chunk right after boot; tests/flight/harness.js imports it):
                    installs c172.pitchBreak, which flightModel.js reads in the pitch moment: the elevator's share of its power
                    by α (up: NASA CR-3201 model C, δe −15°; down: CR-3097 model B, δe +23°) and model B's nose-down break
                    at the stall as degrees of α; full back stick settles at α ~17° (was ~41°). The same tables in
                    public/jsbsim/ c172.xml (Cmde_up, Cmde_down, Cm_break). Cards: tests/flight/c172.test.js, tests/unit/pitchBreak.test.js
src/fdm/jsbsim.js   JSBSim adapter (?fdm=jsbsim): the same contract as stepFlightModel on
                    JSBSim (LGPL WASM, own chunk, lazy after Start flight); trims the
                    elevator and settles the engine at its throttle on an airborne spawn
                    (0085), lever→plate throttle map. fdm/loadJsbsim.js loads it
                    in the browser, tests/flight/jsbsimNode.js in Node. The aircraft it flies
                    is our own MIT data: public/jsbsim/ (C172 from POH + Roskam)
src/systems.js      aircraft systems (pure, run first in every flightModel sub-step): hydraulic
                    gear and flap travel (levers are commands; gearPos/flapDeg/flapPos are where
                    they are), 737 flap load relief, brake pressure + anti-skid, autobrake
                    1/2/3/MAX (Boeing decelerations), thrust reversers, belly when not locked; a wet
                    runway (0108: body.wetRunway) caps the brakes at 14 CFR 25.109(c)'s wet μ by
                    groundspeed and tyre pressure × anti-skid efficiency (cards: tests/flight/wetRunway.test.js)
src/gear.js         landing gear on oleo struts (0074): nose + mains at their real positions,
                    per-wheel loads and moments through spec.inertia, harder rebound damping,
                    pedal nose-wheel steering, the tail against the mains' moment with q;
                    tyre friction per wheel at its axle, brakes on the mains only (0082); the loaded
                    nose tyre holds its steered yaw rate against the fin and lets go as the nose lifts
                    (noseWheelYawHold, 0110; cards in tests/flight/groundSteer.test.js); nearly
                    stopped and not breaking away, static friction holds a parked airplane against wind and
                    idle thrust, and its heading up to the tyres' scrub moment (wheelScrubYawHold, 0106)
                    spec.gear.tail (0144, the C172): a stiff structural tail contact at our JSBSim C172's TAIL
                    point (15.0° about the mains) in the same loop, wheelLoads[3]: it carries load, scrapes (μ 0.5)
                    and stops the rotation in the air too, but alone it is not onGround (no grade, bounce or
                    horn from it); flightModel.js's onGround pitch clamp is off for it; damper sized for 1/60 s sub-steps
                    radioAltitudeM (0122): the lowest main wheel's height (struts out, 0 at touchdown) =
                    sim.raFt, what the GPWS heights, retard, sink rate / pull up and too low gear read
                    (audio.js, main.js), as do the RADAR AGL box, the phone's AGL, the HUD FLARE/IDLE cue
                    and the AP tutor's flare/retard; the coach, grade and assists keep sim.aglFt (the CG's)
src/atis.js         ATIS-style briefing (0030, lazy chunk loaded on Start flight): buildAtis (pure) says the flown METAR
                    as FAA JO 7110.65 para 2-9-3 lists it (field, letter by the observation's UTC hour, time, wind magnetic to
                    10° (its own copy of magvar.js's 2.7°, pinned by a unit test: importing magvar.js split it out of boot),
                    visibility (the raw SM group: less/more than), weather (+FC a tornado), sky (CLR "clear below 12,000", VV an
                    indefinite ceiling, CB/TCU), the remarks' lightning/CB/TCU, temp/dew, altimeter, landing or departing runway,
                    "your runway, tailwind N" when the mission's runway has one) with 2-4-17's numbers ("niner"). #atis: Pilot
                    sees it after Start flight (not Kid/Learner, not a phone held sideways); #btnAtis at the weather ribbon's
                    right end opens it at any level. Placed under #phoneHeader and a .coach-top coach card; hidden under the
                    menu sheet; re-rendered when sim.wx changes. Spoken only from the button and only when no coach talks (ground
                    without a coached takeoff/drill, or above 1,000 ft), its own utterance, so a tap/Esc/Sound OFF stops it alone.
                    Labelled "not the real broadcast"; SCENARIO on the offline weather
src/atmosphere.js   ICAO standard atmosphere + the METAR's temperature/altimeter: density,
                    IAS ↔ TAS, speed of sound (pure, tested against the ICAO table); densityAltitudeFt
                    (0111: the FAA-H-8083-25 rule, display only) for the start screen's #txtDensityAlt line
                    and the takeoff briefing toast on Fly, with a thin-air hint 1,500 ft above the field
src/engine.js       thrust by engine type: fixed-pitch prop (thrust table + power lapse: δ/√θ less friction, 0099;
                    windmilling at idle), turbofan (Mach/density lapse, idle, spool lag; the 737's σ^0.94
                    fitted to CFM's FL350 max climb thrust, 0116); full throttle is the take-off/go-around
                    rating. maxClimbThrustN (0135): the 737's CLB rating (Bartel & Young 2008, anchored to CFM's
                    FL350 figure, spec.engine.climb), what the APD climb cards fly; the game does not use it
src/aero.js         pure aero/avionics: CL with stall, CD + ground effect + the 737's Mach drag rise
                    (waveDragCd, 0120: Mason's Korn + Lock, spec.transonic), PAPI, stabilized-
                    approach gate (500/1,000 ft, ILS dots),
                    GPWS callouts, takeoff callouts (80 kt, V1, rotate, positive rate; 0035),
                    warnings, heading math; speedLimitKts (0127): VMO/VNE clean, else the flaps'
                    placard (spec.vfeKtsByFlapDeg, by where the flaps are, in transit too), overspeedStep's latch (re-arms
                    3 kt below); main.js calls "overspeed" once, flashes the IAS box, and hudLayout.js
                    speedLimitBand marks the tape (not for Kid)
                    stallSpeedKts (1 g, sea-level ρ: the model's IAS is EAS) at sim.flapPos is the tape's low-speed
                    band (0128, hudLayout.js stallBand: red up to Vs, amber to 1.1 Vs; not for Kid, not on the ground)
src/weather.js      wind vector, gusts, runway components, fog, the scenario fallback; surfaceWindFactor
                    (0106): the METAR's 10 m wind by the log law (z0 0.03 m) at the CG's height,
                    ~70% on the runway, which main.js updateWind applies
src/metar.js        reading a METAR (lazy chunk, fetched with the first report, 0092): parseMetar, cloudLayers,
                    today's crosswind pick (pickCrosswindRunway, crosswindMission); metarWetRunway (0108): RA/DZ
                    falling at the field (rawOb's weather groups) → wx.wetRunway → sim.wetRunway, the
                    wind box's amber WET RWY and the coach's "wet" call on a steady final
src/lowIfr.js       low-ceiling ILS (0092, lazy chunk loaded with kdfw_35c_low_ifr, the picker's Weather group): a
                    scripted LIFR report (BKN004 OVC008 2SM BR, 350/12; flightCategory = AIM 7-1-7) parsed by metar.js,
                    labelled scenario; main.js currentWeather() returns it while sim.dh is set (also DFW's flow); the
                    chunk's first load re-spawns in its wind. Decision height 200 ft above the threshold (FAA P/CG
                    ILS Category I): dhStep calls "minimums" once descending on the final (re-armed 100 ft above),
                    dhPrompt the coach's decision words for 5 s (s.ds), then after full power and a climb (st.missed)
                    the missed approach step by step (ma*: power, pitch, a flap notch, gear, climb, RESET to retry).
                    cloudFog: the sky dome's layers are see-through planes, so main.js sets scene.fog.density from the
                    camera's height each step (~120 m in cloud above ~440 ft, the report's 2 SM below 380); the runway
                    lamps dim only past a 1 SM fog (runwayLights.js, Allard). The wind box reads 'LIFR SCN' / 'IFR METAR'
                    for any IFR/LIFR report (hudLayout.js windReadout); atis.js says "this mission's" for wx.scripted
src/input.js        keyboard state → control targets, virtual stick mapping (main.js bindStick: a held touch control ends on its own pointer's
                    end anywhere or the window's blur, 0136, tests/e2e/handsOff.mobile.spec.js); tillerRudder: Pilot taxiing
                    (< 40 kt) steers the nose wheel with the stick's sideways push (touch has no pedals, 0110);
                    touchGroundRudder: otherwise (thumb not steering, or above 40 kt) Pilot on touch gets
                    groundSteerRudder's centreline hold on the runway (0106)
src/audio.js        Web Audio engine/wind/stall/GPWS chirps (starts on user gesture); the engine voice is
                    src/engineSound.js (0148, lazy on init): the C172's prop rpm from prop76.xml's Cp(J) against the
                    IO-360's torque (2300 static, 2700 at 126 KTAS, 650 idle, windmilling dead), sounded at 4x the blade-pass
                    (two octaves up: phone speakers drop the 22-90 Hz blade-pass); a plain drone if the chunk never loads; jets by
                    N1 = √(idle + (1 − idle)·engineN), so the spool lag is heard; the GPWS heights,
                    sink rate / pull up and the sim's calls are picked sound or not, each to a caption
src/audioSession.js iOS's silent switch (0169, in engineSound.js's lazy chunk, re-exported there): audio.js update calls it each frame
                    once sound has started; navigator.audioSession.type (W3C Audio Session; through the switch from iOS 17) 'playback' with sound on
                    (plays through the ringer switch), 'auto' with it off, 'ambient' paused (pause() sets it too: a hidden tab draws no frame); written only on a change; speech unverified; feature-detected
                    (Chromium/Firefox: nothing). e2e tests/e2e/audioSession.spec.js stubs it
src/captions.js     callout captions (0117): #calloutCaption shows each spoken call's words for 1.2 s, in
                    the takeoff call's slot under the heading box (it wins it), left of the wind box; a queued
                    call joins the line, two calls at most: the newest, and of the two before it a warning over a height count (0137); plainCaption gives Kid/Learner plain words (pure, tested)
src/controlsSheet.js controls cheat sheet (0049, lazy): "?" or Controls (menu/toolbar) opens #controlsSheet,
                    keyboard / gamepad / touch rows (touch first on a touch screen); pauses the flight while
                    open unless it already was, owns the keyboard (Esc / "?" close, Tab trapped). Its rows are
                    data a unit test holds to every key, pad button and touch control the code binds
src/styles.css      Tailwind entry + ported custom HUD styles; the PAPI cue (0089): main.js writes the HUD word and data-papi
                    (white-lamp count), styles.css draws its colour, a fly-to glyph (▲▲ ▲ ◆ ▼ ▼▼ for low … high) and the lamp row (white
                    rings, red squares), so the reading never rests on colour alone (zero boot JS)
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
| `?debug` | debug overlay; `openaeroDebugFinal(airport, rwy, nm)` flies the final to any runway end from any distance (tests, 0068); `openaeroDebugHop(mps)` throws the airplane up off the runway, a scripted bounce (0091) |

## 5 · Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server at http://localhost:5173/openaero/ |
| `npm run build` | Production build into `dist/openaero/` |
| `npm run preview` | Serve the production build locally (static only: the /api Worker isn't running, the client falls back) |
| `npx wrangler dev --local --port 8799` | Build first; serves assets **and** the edge Worker locally (real METARs) |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | Playwright e2e (builds first) |
| `npm run check` | **The gate**: backlog validator + unit + known-gap ledger + build + boot JS budget + e2e. CI runs exactly this. |
| `node scripts/check-gaps.mjs` | The known-gap ledger (0160): every `it.fails` card the last full `npm test` ran (scripts/gap-reporter.mjs records them) is titled `KNOWN GAP (NNNN): ...` and NNNN is an open ticket (proposed, ready, in-progress). Closing a ticket means promoting or retargeting its cards. |
| `npx playwright test --project=devices --no-deps` | The device-class probe alone (iPhone 15 both ways, iPad Air both ways, iPad Pro 12.9 portrait, Pixel 8, Chromium with emulated touch; touch, 4x CPU throttle, layout + frame time; numbers in `docs/PERF.md`) |
| `npm run check:fast` | Everything but e2e (budget included), for sandboxes that can't install Playwright browsers. CI still runs the full gate. |

Budgets: JS ≤ 201 kB gzipped at boot, **enforced by `scripts/check-budget.mjs` in `npm run check` and
`check:fast`** (the entry plus its modulepreloaded chunks, gzip -9, kB = 1000 B; it reads the number from this line).
2026-10-26 (0078): 200.89 kB (magvar +70 B, paid for by `byId` for main.js's ~200
`document.getElementById` calls, −180 B). 2026-10-26 (0087): 200.99 kB (main was 199.89 after 0086/0034/0085; the drill's wiring and prompts, its
state machine, grade and card text are a lazy chunk). 2026-10-26 (0090): 200.98 kB (pitch stability +90 B, paid for by
moving the ?debug overlay's inline style into styles.css). 20 B of headroom: the next boot feature trims first. 2026-11-01 (0019): 200.19 kB (the replay's lazy import, the recorder call, REPLAY wiring and the camera hook, +0.19 kB; replay.js is a lazy chunk). 2026-11-02 (0060): 200.42 kB (the night/dusk missions' entries and missionSun's wiring). 2026-11-02 (0130): 200.60 kB (the coach card's slot check, placeCoach, +0.18 kB). 2026-11-02 (0131): 200.72 kB (the ?debug PAPI fields; the HUD and 3D lamps share airports.js papiWhite). 2026-11-02 (0132): 200.99 kB (the altitude tape's MSL tab, its layout and ?debug rect, +0.27 kB); 10 B of headroom: the next boot feature trims first. 2026-11-03 (0121): 200.99 kB (the seat load factor and the F-16 limiter's hook, paid for by the limiter's lazy chunk src/fbw.js and the ?debug runwayScreen moving into src/debugScreen.js); a few bytes of headroom. 2026-11-03 (0136): 200.98 kB (every touch control lets go on its pointer's end anywhere and on the window's blur, +70 B, paid for by the ?debug-only papiLampsWhite moving into src/debugScreen.js). 2026-11-03 (0141): 200.94 kB (the flaps-up Vy takeoff trim, +20 B, paid for by the ?debug snapshot's landmark seats moving into src/debugScreen.js `landmarkSeats`, −60 B). 2026-11-03 (0133): 200.98 kB (the F-16's wave drag and its data are a lazy chunk, src/supersonic.js; boot pays its import and aero.js's hook, +50 B; 20 B of headroom). 2026-11-04 (0100): 200.92 kB (Kid's de-crab, its hold on the mains and the line-up over the whole runway, +~130 B, paid for by the graphics-lost card's three longer lines moving into index.html data-* on #txtGfxLost and the weather badge's live colours into Tailwind data-[live]: classes there, −150 B: bytes moved into the boot HTML, not saved). 2026-11-03 (0137): 200.91 kB (the caption's warning-first cap; paid for by the HUD's gate verdict moving into the lazy src/gateVerdict.js and the ?debug test hooks openaeroDebugFinal/Hop/DeadStick into src/debugScreen.js hooks()). 2026-11-01 (0027): 199.96 kB (main was 199.70; the windsocks' lazy import, update and ?debug line, +0.26 kB; windsock.js is a lazy chunk). 2026-10-27 (0048): 200.996 kB (the pattern mission and its wiring +160 B, paid for by one
`loadDrill` for the drills' lazy chunks, `startDrills`, and the ?debug Google usage line and
snapshot moving into photoreal.js `debugLine`/`debugState`); 4 B of headroom. A lazy chunk that
imports a boot symbol nothing else imported grows the boot chunk's exports: inline it instead. 2026-10-27 (0097): 200.996 kB (Kid's
line-up on the ground track, paid for by main.js's seven `0.514444` literals becoming `KTS_TO_MPS`). 2026-10-28 (0098): 200.994 kB (Kid's final guide as assists.js
kidFinalGuide with its past-the-threshold gate, +70 B, paid for by the ?debug snapshot's moving-parts poses moving into the lazy surfaces.js
chunk (`partPoses`), its go-around a plain copy, one `if (debugOverlay)` for the ?debug hooks and a dead `_q1`); 6 B of headroom. 2026-11-04 (0140): 200.91 kB (the altitude tab's drawing moved into the lazy gateVerdict.js with Kid/Learner's plain words; the top bar's word is CSS). 2026-11-04 (0148): 200.97 kB (the engine voice's lazy import, per-frame call and fallback drone, +60 B over 0140's 200.91; src/engineSound.js is a lazy chunk). 2026-11-05 (0150): 200.98 kB (Kid/Learner's rollout rudder, +~50 B, paid for by the ?debug readout's element and text moving into src/debugScreen.js `overlay` and dropping the snapshot's elevInput, which nothing read). 2026-11-04 (0151): 200.98 kB (the dark-sun Day default at boot and the caption's dark band on the unrounded -6°, +30 B over 0152's 200.95: grows, under the 201 line). 2026-11-04 (0144): 200.96 kB (the C172's tail contact, +~120 B, paid for by dropping three snapshot fields nothing read (trimShown, crosswindMission, cloudLayers), one heading sum in it, and its draw-call readout moving to debugScreen.js renderInfo). 2026-10-28 (0099): 200.982 kB (the piston lapse's friction term, paid for by folding engine.js's P0/T0 constants into the one line that used them); 18 B of headroom. 2026-10-30 (0112): 196.74 kB (main was 196.07; the windshear mission's entry and wiring, +0.67 kB; windshear.js is a lazy chunk). 2026-10-29 (0108): 195.06 kB (main was 194.35; the wet-runway μ table, the METAR weather-group parse and the labels, +0.71 kB). 2026-10-29 (0107): 195.42 kB (main was 195.06; the rejected takeoff's mission, wiring and ENGINE FIRE banner, +0.36 kB; rto.js is a lazy chunk). 2026-10-29 (0111): 196.02 kB (the density-altitude rule, line, per-mission hints and briefing, +0.60 kB). 2026-10-29 (0104): 194.29 kB (the engine-failure missions' entries and wiring, +0.40 kB over main's 193.89; engineOut.js is a 2.6 kB lazy chunk). 2026-10-28 (0105): 192.38 kB (−8.6 kB, no behaviour change: the primitive 737's wing and fin were three's `ExtrudeGeometry`, which pulled earcut and every curve class into boot; `src/prism.js` builds the same flat-sided outlines from a `BufferGeometry`). A headroom under ~10 B is noise: the boot chunk embeds ~20 lazy chunks' hashed names, and a lazy-only edit moved the total −6 to +9 B over 8 rebuilds (0141's panel). Rank the boot chunk by source (a `--sourcemap` build, gzip per source) before trimming: one three.js class can outweigh a week of literal trims. 2026-11-06 (0076): 200.988 kB (the landing light rides in the runway lights' chunk, so boot pays its constructor call and per-frame update, +~40 B; paid for by the runway lights' on/off rule moving into their own update, the runway lights' and windsocks' ?debug handles set by their chunks, and openaeroDebug's runwayScreen/render spread from debugScreen.js `screen`, −55 B; a ConeGeometry in a lazy chunk split three's BufferGeometry out of boot, +620 B: CylinderGeometry(0, …) draws the same cone). 2026-11-09 (0161): 200.98 kB (the steep-turn mission's entry, its lazy import and wiring, the snapshot's steepTurns and the assists' turn compensation, +~0.35 kB, paid for by src/gamepad.js becoming a lazy chunk fetched once a pad shows up in getGamepads, −0.40 kB, and one drillCard for the stall/RTO/windshear/steep-turn cards; ~20 B of headroom). 2026-11-09 (0162): 200.99 kB (the Cessna's fuel is in the runway lights' chunk, created with the buffet; boot pays loadScenario's `sim.fuelGal = null`, ~+6 B). 2026-11-10 (0109): 200.60 kB (the Cessna's post-stall pitch break is a lazy chunk, src/pitchBreak.js; boot pays its import and flightModel.js's two reads of spec.pitchBreak, +50 B over main's 200.55). 2026-11-10 (0092): 200.55 kB (the low-ceiling mission's entry, the Weather group, its lazy import, currentWeather/flow/coach/DH hooks and the wind box's category, +~0.39 kB, paid for by moving parseMetar, metarWetRunway, cloudLayers and today's crosswind pick out of boot into src/metar.js, a lazy chunk fetched with the first report, −0.86 kB: nothing at boot reads a METAR). 2026-11-10 (0080): 200.97 kB (the traffic's lazy chunk imports ~13 boot symbols the boot chunk now exports and main.js passes `sim.fm`, +~90 B, paid for by the gamepad toast's words and padName moving into gamepad.js, the ?debug snapshot's windsocks into debugScreen.js, its unread sun.azimuthDeg and three lazy-import catches becoming `.catch(console.warn)`; importing flightModel.js, three's Group or nightGround.js from a lazy chunk split aero.js, Object3D or Color out of boot, +0.3-0.6 kB each: see traffic.js). 2026-11-10 (0169): 200.98 kB (the iOS audio session rides in engineSound.js's lazy chunk; boot pays its two hooks in audio.js (update and pause), +~30 B, paid for by main.js's four primitive-aircraft ConeGeometry becoming CylinderGeometry(0, …), the same mesh, which drops three's ConeGeometry class, −20 B; setValueAtTime → .value trims measured 0). 2026-11-09 (0079): 200.98 kB (the stall buffet costs boot nothing: runwayLights.js's createTouchdownFeel wraps touchdownFeel.js's and creates it when the group is added to the scene; a constructor call in main.js measured 200.99-201.004 over lazy-only edits, i.e. over the line). 2026-11-09 (0147): 200.97 kB (the touchdown feel's constructor and its touch() call (not behind a menu), its re-export through the runway lights' chunk and audio.js's ctx getter (replacing `started`), +~60 B, paid for by three lazy-chunk catches becoming `.catch(console.warn)` (the failed import names its chunk) and the mission picker's colour map becoming one ternary). 2026-11-06 (0030): 200.997 kB (the ATIS chunk's lazy import on Start flight, +~20 B, less the DFW FLOW text built from the flow's own word, −8 B; src/atis.js is a lazy chunk; 3 B of headroom: the next boot feature trims first). 2026-11-05 (0156): 200.94 kB (the roll law's rollRateGain/rollHoldScale, their wiring into the autopilot and assists and the
F-16's stick hook, +~170 B, paid for by the speed tape's trim bug and low-speed band drawing moving into the lazy gateVerdict.js, −230 B;
the F-16's stick shaping is fbw.js's). 2026-11-04 (0093): 200.99 kB (the takeoff coach's lazy import and coach wiring, +~100 B, paid for by the go-around
and stall drills' ranks and the go-around's touch words moving from coach.js into goAround.js / stallDrill.js; the lazy
chunk reads sim.stallKts rather than import aero.js, and inlines trim.js's rule: importing trim.js split it out of boot, +620 B). Gzip
eats repeated-literal trims (an `onClick` helper for ~35 click bindings and a `noseHdgDeg()` helper each
measured 0 or worse): move code to a lazy chunk instead. 2026-10-26 (0036): 200.95 kB (the dead-stick mission, engine-out flag and its effects, coach hook and HUD readouts, paid for by moving the go-around and stall drills' coach words into their lazy chunks through coach.js DRILL_TEXT, and the abeam spawn to a lat/lon). 2026-10-26 (0091): 200.61 kB (the bounce tracker, prompts and re-contact crash, paid for by moving the results card (results.js) and the autopilot tutor's words and phases (apTutor.js) into lazy chunks fetched after boot). 2026-10-23 (0084): 199.2 kB by that measure (main was 206.7, which Vite printed as 208.9): bare `three` resolves to
`three/src/Three.js` (vite.config.js) so the bundler splits it per file, the three.js the lazy glTF/3D-tiles chunks
need (animation, skinning, loaders' classes) leaves the boot chunk for theirs (the boot part of three that they share
is a few small modulepreloaded chunks: a manual `codeSplitting` group for it made a chunk cycle through rolldown's
runtime helpers, `__exportAll is not a function` at boot, and `strictExecutionOrder` cost 7 kB); photoreal.js + googleSession.js load on Fly through `src/photorealLazy.js`. Vite's own per-file gzip column reads
~1% higher than the script. History: 208.9 kB after 0082, 205.68 kB on 2026-10-22 (over the line since 0045). (2026-10-21: 201.00 kB after 0045's model hook; the loader,
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
