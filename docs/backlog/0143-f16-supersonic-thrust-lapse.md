---
id: 0143
title: F-16's afterburner thrust stops growing past Mach 2 at altitude, so it settles in the Mach 2 class
status: proposed
priority: P2
size: M
lens: authenticity
created: 2026-11-03
pr:
---

## Why
Found closing 0133. The F-16 now has supersonic wave drag (`src/supersonic.js` supersonicWaveCd, Raymer's
Sears-Haack correlation, ~0.022 at Mach 1.2, ~0.018 at Mach 2), and full afterburner level at
40,000 ft no longer runs away to Mach 5.7: from 250 KEAS it is ~2.27 at 300 s. But it settles only
near Mach 3.2, after ~30 min. The engine's
thrust is `T0·σ^0.8·(1 − 0.3M + 0.3M²)` (`src/engine.js`), which grows with M² as fast as the drag
does: at 40,000 ft thrust over q·S is ~0.046 at Mach 2 against the airframe's total CD of ~0.037, so
it keeps gaining (~0.003 Mach/s at 300 s) until the two meet near Mach 3.2 (thrust over q·S tends to
~0.035). The USAF fact sheet's
"Mach 2 at altitude" (card in `tests/flight/f16.test.js`, KNOWN GAP 0143) needs the engine to run out
of thrust there, as a real F110/F100 does: the compressor inlet temperature limit (the "theta break")
and the fixed inlet's falling pressure recovery past ~Mach 1.6 (a pitot inlet loses 28% of its
total pressure to the normal shock at Mach 2, NACA Report 1135). At sea level full afterburner
also settles near Mach 1.45 (~936 KIAS) against a real F-16's ~1.2 (~800 KCAS; the game has no
airspeed limit for it): the same lapse. Sources an earlier run
named but did not verify: Mattingly, Heiser & Pratt, Aircraft Engine Design (2nd ed., AIAA 2002),
the installed thrust lapse of a mixed-flow afterburning turbofan with a theta break.

## What
Give the F-16's turbofan a supersonic thrust lapse from a citable open source (for example a
published low-bypass afterburning turbofan lapse with a theta break, or an open engine deck), for
the F-16 spec only. The subsonic thrust (every card at or below Mach 1, the 0118 pulls, the zoom
card) should not move, or move only within its cards. Verify the source's equation from a copy you
can read; do not use one from memory.

## Acceptance criteria
- [ ] The KNOWN GAP (0143) card in `tests/flight/f16.test.js` (full AB, level at 40,000 ft: Mach
      1.8-2.1, settled under 0.02 Mach over the last 30 s of 300) is promoted (and the 30-min guard's
      Mach 3.4 bound tightened) to `it`, or stays `it.fails` with the
      measured Mach and the PR says why
- [ ] Every other F-16, 737 and C172 card passes unchanged
- [ ] A unit card in `tests/unit/engine.test.js` for the lapse at the source's own points

## Test plan
The flight card above; unit cards on the lapse; e2e smoke on the F-16 spawn.

## Out of scope
Inlet modelling beyond a lapse, fuel flow, sea-level top speed.
