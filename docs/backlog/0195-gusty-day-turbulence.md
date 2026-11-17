---
id: 0195
title: A gusty or hot day shakes the airplane: METAR-driven turbulence, felt more in the Cessna than the 737
status: shipped
priority: P1
size: M
lens: player-feel
created: 2026-11-17
pr: 279
---

## Why
Today's METAR already gives the sim a steady wind and a smooth gust cycle (`src/weather.js`, "Smooth,
deterministic gusting"), but nothing ever *shakes* the airplane: a 25 G38 day flies like a calm one with a
slow wind swing. A pilot knows gusty low-level air as chop: short, erratic changes in attitude and altitude,
worse in a light airplane than in a heavy jet. The FAA defines light, moderate and severe turbulence by
those reactions and notes that the same air reads lighter in a large aircraft
(https://www.faa.gov/air_traffic/publications/atpubs/fss/fss0902.html, JO 7110.10 turbulence intensity
table; AIM chapter 7 carries the PIREP scale). The continuous-turbulence model the flight-sim industry uses
is the Dryden spectrum (MIL-HDBK-1797 / MIL-F-8785C; JSBSim implements it, read its `FGWinds` source for
the filter forms). Grep shows no turbulence term anywhere in `src/` or the worker, so this is new ground.

## What
A pure `src/turbulence.js`: an intensity from the METAR (gust spread, low-level mixing: gust factor and
temperature at the surface; scenario weather gets a mild default), and a seeded, sim-clock-driven Dryden-style
three-axis gust velocity (shaped white noise through the first-order filters, lengths scaled by height AGL as
MIL-F-8785C's low-altitude form does). `main.js updateWind` adds it to the wind vector the flight model
already takes (no new physics entry point). Scale by wing loading so the light Cessna feels more than the 737
(response follows from lift-curve slope and wing loading; state the rule in the module comment). Kid and
Learner get it at half strength (they still fly it; Kid's assists keep it safe). No per-frame allocation;
reduced motion has no extra camera shake (the physics moves the plane, nothing is faked on the camera).
Add a "bumpy" word to the weather ribbon when intensity is moderate or more.

## Acceptance criteria
- [x] `turbulence.js` is pure and seeded: same seed and clock give the same series; zero-intensity gives zero
- [x] RMS vertical gust follows the intensity (light ~0.9 / moderate ~2.7 / severe ~5.5 m/s is the usual
      mapping; cite the table you use) and falls off smoothly toward the ground
- [x] Flight card: the Cessna 10 NM final on a 25G38 METAR shows a larger pitch/roll/vertical-speed standard
      deviation than the 737 in the same air, and both are zero in calm air
- [x] Kid's hands-off landing in the turbulent scenario still grades C or better (no crash): fly it
- [x] The calm cards in `tests/flight/` do not move (turbulence is zero when the METAR is calm)
- [x] Boot JS budget unchanged (put it in an existing lazy chunk or keep it tiny)
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
`tests/unit/turbulence.test.js` (determinism, RMS by intensity, height falloff); a flight card in
`tests/flight/` for the Cessna-vs-737 response and Kid's landing; one e2e that loads a gusty METAR fixture
and asserts the ribbon says bumpy with no console errors.

## Out of scope
Thermals, mountain wave, convective microbursts (0112 has the windshear drill), visual rain.

## As shipped
- The intensity table is MIL-F-8785C's low-altitude one (σ_w = 0.1 W20; W20 15 / 30 / 45 kt = light / moderate /
  severe, σ_w 0.77 / 1.54 / 2.31 m/s), not the ticket's "usual" 0.9 / 2.7 / 5.5 (those are higher-altitude
  magnitudes). A 25G38 METAR is between light and moderate (σ_w ~1.2 m/s), so BUMPY needs ~33 kt or a 20 kt spread.
- No temperature term: a METAR carries no surface heat flux, so a hot still day stays smooth (thermals are out of scope).
- No scaling by type: the same air, and flightModel.js's wing loading makes the Cessna shake more. A span lag
  (4b/πV) on the vertical gust stops a point-mass wing feeling 10 ft eddies in full on the flare.
- flightModel.js commands a pitch rate, so the card holds the attitude and measures the seat's load factor, bank
  and vertical speed (pitch stays held); the ribbon word is also on the HUD wind box (BUMPY METAR) for phones.
- Kid's Cessna adds half the gust spread to its approach speed (AFH ch. 9): without it one seed of twelve landed
  24 m short. The 737's Kid flare landed at ~900 fpm with +4 kt, so the jet has no additive.
