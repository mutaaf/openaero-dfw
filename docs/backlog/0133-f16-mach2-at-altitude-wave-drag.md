---
id: 0133
title: F-16 card: full afterburner at 40,000 ft tops out near Mach 2, as the USAF says (needs wave drag past Mach 1)
status: in-progress
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

## Notes (Builder, 2026-11-03)
The wave drag is in, and on its own it does not close the card. `aero.js supersonicWaveDragCd`
is Krus & Abdalla 2019 Eq. 5 (10th Aerospace Technology Congress, doi 10.3384/ecp19162003; open):
Cdw = fM·Cdw0·kdw / (((M − kdwm)² − 1)² + kdw⁴)^¼, the 1/√(M² − 1) of linear theory without its
Mach 1 singularity, times a logistic step from Mcrit = 1 − δM; with the paper's worked parameters
(Cdw0 0.0264, kdwm 0.05, kdw 0.5, δM 0.2) it peaks at 264 counts at Mach 1.05 and falls to 79 at
Mach 2. The card (as filed, from 400 KIAS) went from Mach 5.7 to 3.7 at 240 s and still accelerates;
the panel had it start subsonic (250 KIAS, so it must cross the drag peak) and require a settled
speed (< 0.02 Mach change over the last 30 s of 300): Mach 3.3 at 300 s, 2.9 at 270 s. The cause: at 40,000 ft the
engine's full-afterburner thrust is 130 kN · σ^0.8 · (1 − 0.3M + 0.3M²), which grows without
bound past Mach 1 (1.6× its static value at Mach 2, 2.8× at Mach 3), while a real fixed-inlet
fighter's falls (a pitot inlet loses 28% of its total pressure to the normal shock at Mach 2,
NACA Report 1135, before the engine's inlet-temperature limit). Level at Mach 2 this drag is ~39 kN
against ~68 kN of thrust: a Mach 2 top speed needs ~40% less. That lapse is uncited past Mach 1 (f16.test.js's header) and intake models
are out of scope here, so the card stays `it.fails` with the measured Mach in its name. Next:
a ticket for a cited supersonic thrust lapse (e.g. Mattingly, Heiser & Pratt, Aircraft Engine
Design, the installed-thrust lapse of a mixed-flow afterburning turbofan) that flips the card.
Subsonic cards, the 737 and the C172 do not move (tests/flight 214 pass + 11 known gaps, before
and after). Boot JS +0.06 kB, paid for by the ?debug landmarks readout moving into debugScreen.js.
The panel also measured full afterburner at sea level: Mach 1.87 (~1,200 KIAS) after 180 s, still
accelerating (Mach 3.4 before), against a real F-16's ~Mach 1.2: the same lapse, for the same
follow-up ticket. Held thrust at its Mach 1 value would settle near Mach 2.1 at 40,000 ft with this
drag, so the follow-up must fly the card, not assume it.
