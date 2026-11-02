---
id: 0133
title: F-16 card: full afterburner at 40,000 ft tops out near Mach 2, as the USAF says (needs wave drag past Mach 1)
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-11-02
pr:
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
