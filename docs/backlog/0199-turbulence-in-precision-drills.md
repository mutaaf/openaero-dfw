---
id: 0199
title: Fly slow flight in the METAR's turbulence with a fair band, and keep Kid's short-field final on the path in 25 kt+
status: shipped
priority: P2
size: M
lens: authenticity
created: 2026-11-17
pr:
---

## Why
0195 put Dryden turbulence on every flight, but two precision drills were not ready for it (the 0195 validation panel):
- **Slow flight** (`src/slowFlight.js`): a by-the-book pilot holding the middle of the band (already raised by half
  the gust spread) stalled on 3 of 4 seeds in 15G25, 4 of 4 in 25G38 and 20G40, and set the horn off in a steady
  25 kt: a vertical gust takes the wing from ~10° to the stall angle with the IAS never under 63 kt. The band is
  raised for the gust spread only, while turbulence also comes from the mean wind. 0195 flies this drill in
  smooth air (`main.js updateWind`: `sim.slowFlight ? 0`), so the drill is still fair but no longer real on a
  windy day.
- **Kid's short-field lesson in 25G38** (`src/shortField.js` kidLiftM, Kid's guide): even without turbulence it crosses
  Addison 16's threshold at ~7 ft and lands ~29 m in (the PAPI's path is ~47 ft there); with Kid's share of the
  turbulence 1 seed in 10 touched down 1 m short. 15G25 and 20G30 are carded and land 85-180 m in.

## What
Slow flight: raise the band (slowFlight.js gustAddKts) by a turbulence margin from turbulence.js turbulenceSigmaW too
(the vertical gust's α change is w / V: size the margin so a 2-3 σ_w gust stays under the stall α at the band's
low edge), say "gusty air: fly higher in the band" on the card, then drop the smooth-air exemption in main.js.
Short field: find why Kid's guide sags under the path in a 25 kt+ gusty headwind (the gust cycle's lulls, the
autothrottle's lag, kidLiftM's headwind term) and fix it there.

## Acceptance criteria
- [x] tests/flight/slowFlight.test.js flies its pilot in turbulentAir (harness.js) at 15G25, 25G38 and a steady 25 kt,
      several seeds: no stall, horn within the drill's rules
- [x] main.js no longer zeroes turbulence for slow flight
- [x] tests/flight/kidFinal.test.js's turbulent short-field card adds 25G38: on the runway, every seed of 10
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse

## Test plan
`npx vitest run tests/flight/slowFlight.test.js tests/flight/kidFinal.test.js`.

## As built (2026-11-18)
- Slow flight: the stalls were mostly the test pilot's. It chased each eddy's IAS with the nose (pitch rates to 20°/s)
  and started at 95 kt over the ground, not through the air. Flown on the drill's own 2 s airspeed filter (AFH ch. 4: hold
  the attitude in turbulence), the band's middle held 18 of 18 runs (15G25, 25G38, steady 25 kt, 6 seeds each) at α ≤ 10.5°
  with no warning. The band still gets its margin: slowFlight.js turbulenceFloorKts puts the low edge where the 1 g α plus
  a 3 σ_w gust (w / V_true) reaches the stall angle. That raises a steady 25 kt day 63 → 64 KIAS; the gust share stays
  higher on 15G25, 25G38 and 20G40. The hold's words say "Gusty air: fly higher in the band". Kid holds it hands off in
  25G38 and 25 kt (6 seeds each).
- Short field: Kid's guide flew its 3° through the air (pitch = γ + α). In a 25 kt+ headwind GS / TAS is ~0.6, so it rode
  ~35 ft under the PAPI's path and crossed the threshold at 7-10 ft. assists.js now converts the path over the ground
  (headwindPathRatio, airGammaDeg) before the threshold, and shortField.js drops the 0.5 m/kt headwind lift that made up for
  it. Kid now crosses at 26-28 ft in calm, a 10 kt headwind, a 5 kt tailwind and 15G25 to 25G38, and touches down 114-231 m in.

## Out of scope
The turbulence model itself (0195).
