# Changelog

One line per shipped change, newest last: `YYYY-MM-DD · #<ticket> · <player-facing summary>`.

2026-10-16 · port · Ported from the single-file prototype to a Vite project: three.js and Tailwind bundled (no CDNs), pure physics/geo/input/audio modules with unit tests, Playwright e2e, Esri imagery attribution, served at mutaafaziz.com/openaero/.
2026-10-16 · — · 10x vision: pillars in AGENTS.md, backlog regroomed (real runways, real weather, landing grades, gamepad, voice callouts, real sun)
2026-10-16 · #0001 #0009 · Fly on any device: phone touch deck (throttle under the left thumb, stick under the right, two thumbs at once), compact phone HUD, gamepad support (left stick, triggers for throttle, A/B/X/Y for flaps/gear/brakes/camera)
2026-10-16 · #0002 #0003 · Real airports: all 15 runways at KDFW, Love Field, Addison, Alliance, Meacham and Arlington from survey data, drawn on the imagery with markings and a PAPI at every end; 11 approach missions; ILS, PAPI, autoland, DME and the moving map follow whichever runway you line up on; wider satellite coverage
2026-10-16 · #0004 (1/2) · Edge Worker: /openaero/api/metar serves today's METARs from aviationweather.gov, validated and cached 5 min at the edge (client wiring is the next PR)
2026-10-16 · #0004 (2/2) · Fly in today's real weather: the METAR for the field you're flying to drives wind and gusts in the physics (IAS ≠ groundspeed, crosswinds you must crab into), fog from visibility, a cloud deck and grey sky under low ceilings, headwind/crosswind for your runway and DFW's real flow; clearly labelled scenario weather offline
