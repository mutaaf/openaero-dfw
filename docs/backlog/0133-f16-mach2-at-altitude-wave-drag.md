---
id: 0133
title: F-16 card: full afterburner at 40,000 ft tops out near Mach 2, as the USAF says (needs wave drag past Mach 1)
status: shipped
priority: P2
size: M
lens: authenticity
created: 2026-11-02
pr: 176
---

## Why
`tests/flight/f16.test.js` says in its header that the model has "no transonic wave drag, so its
supersonic acceleration is not a performance claim", and the only top-speed card is a capability
bound ("past Mach 1.2 and zooms past 40,000 ft"). The gap is written down but has no ticket and no
failing card, so it cannot be measured or closed. The 737 got its Korn + Lock drag rise in 0120;
the jet whose whole point is speed has none. The USAF fact sheet gives "Mach 2 at altitude" and a
ceiling above 50,000 ft
(https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104505/f-16-fighting-falcon/).

## What
In `tests/flight/f16.test.js` add a card: clean, full afterburner, level at 40,000 ft, the speed it
settles to is Mach 1.8-2.1 (the "Mach 2 class", with the fact sheet's wording quoted; no tighter
band, because the open data gives none). It fails today, so it lands as `it.fails` with this ticket
number, then the Builder closes it by adding a supersonic wave-drag term for the F-16 spec only
(`src/aero.js` / `src/aircraft.js`, in the style of 0120's drag rise: a cited zero-lift wave drag
that rises through Mach 1 and falls past it; cite the form used, e.g. Raymer's or Mason's
supersonic wave-drag estimate, in the comment). Subsonic cards (0053, 0118) must not move.

## Acceptance criteria
- [ ] A flight card asserts the Mach 2-class top speed at 40,000 ft, citing the USAF fact sheet
- [ ] The model meets it (the `it.fails` is flipped to `it`), or the card stays `it.fails` with the
      measured Mach written in its message and the PR says why
- [ ] Every other F-16 card, the 737 and the C172 cards pass unchanged; no NaN in the zoom card
- [ ] The F-16 still handles in the game (e2e smoke on the F-16 spawn is green)

## Test plan
Flight card as above in `tests/flight/f16.test.js`; a unit case in `tests/unit/aero.test.js` that
the wave-drag term is zero below its critical Mach and finite everywhere.

## Out of scope
Sea-level top speed, supersonic lift/stability changes, the g and AoA limiter (that is 0121), heat
or intake models.

## Outcome (2026-11-03)
- `src/aero.js` supersonicWaveCd: the F-16 (`spec.supersonic`) gets Raymer's Sears-Haack wave drag
  (Sect. 12.5.9-12.5.10: E_WD 2.0, Amax 2.2 m² our estimate, length 15.06 m USAF, 40° LE sweep), the
  drag rise starting at its Korn + Lock Mcrit (NACA 64A204, κA 0.87, 32.7° quarter-chord sweep),
  faired MDD → 1.05 → 1.2 in AeroSandbox's shape. CD 0.022 at Mach 1.2, peak ~0.027 near 1.1,
  0.018 at Mach 2; within ±30% of JSBSim's open F-16 Mach drag (cross-check card).
- The card did not close. It now starts subsonic (250 KEAS) and must settle (< 0.02 Mach over the
  last 30 s of 300), as an earlier unmerged run of this ticket proposed (branch
  build/0133-f16-wave-drag, a generic Krus & Abdalla 2019 curve: Mach 3.3 at 300 s). With Raymer
  on the F-16's geometry: ~2.27 at 300 s, still gaining ~0.1 Mach per 30 s, because the engine's
  thrust grows with M² as fast as the drag. It stays `it.fails`, now for ticket 0143 (supersonic
  thrust lapse), with a passing regression guard (Mach 1.8-2.5 at 300 s). At sea level full AB
  settles near Mach 1.46 (a real F-16: ~1.2), the same lapse. Below Mcrit (~0.85 at 1 g) nothing
  moved: every other card passes.
