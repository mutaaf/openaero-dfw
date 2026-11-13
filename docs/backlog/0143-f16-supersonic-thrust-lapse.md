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
also settles near Mach 1.45 (~936 KIAS) against a real F-16's ~1.2 (~800 KCAS; commonly quoted, no open
citation yet, so no card; the game has no airspeed limit for it): the same lapse. Sources an earlier run
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

## Source search (Builder, 2026-11-13)
A web search's summary of a KTH/DIVA thesis ("Turbofan Engine Modeling – For The Fighter Aircraft of The Future",
diva2:1682001) quotes Mattingly's installed lapse for a low-bypass mixed-flow turbofan with the afterburner on:
α = δ0 for θ0 ≤ TR, α = δ0·[1 − 3.5(θ0 − TR)/θ0] above (dry: 0.6 and 3.8), θ0 = θ(1 + 0.2M²), δ0 = δ(1 + 0.2M²)^3.5.
Not shipped: the thesis PDF would not download here (connection reset; the CDN refused WebFetch), so the equation
was not read from a copy, and TR (the theta break) needs its own source for the F110. A rough check with TR 1.07: at
40,000 ft the lapse is ~0.63 at Mach 1.6 and ~0.39 at Mach 2 (the model's σ^0.8·(1 − 0.3M + 0.3M²) gives 0.52 at
Mach 2), about the 25% that would put thrust under the airframe's drag before Mach 2.
Builder, 2026-11-13 (second run): the thesis PDF is still unreachable from the sandbox (diva-portal.org: connection
reset with curl, HTTP 503 to WebFetch). Other open copies a search found carry the theta break only as a concept, not
the lapse equation: Chalmers' "Design Considerations of Low Bypass Ratio Mixed Flow Turbofan Engines" (Fluids 2022, 7, 21:
θ0 = Tt2/288.15; the break is where the T4 limiter takes over) and NASA/TM-2005-213659 (off-design cycle analysis). Still
open: a readable copy of the lapse equation and a source for the F110's TR. If the operator can drop the thesis PDF
(or Mattingly's Aircraft Engine Design, 2nd ed., the installed-lapse section) into docs/sources/, this ticket unblocks.
Builder, 2026-11-13 (third run): diva-portal.org is now refused outright by this sandbox's egress proxy (403 on
CONNECT for www. and kth.), so the thesis cannot be read here at all. A fresh search found the theta break described
(Mattingly's Aircraft Engine Design, App. D: the control switches from the πc limit to the Tt4 limit; a generic TR of
1.072 quoted in a ScienceDirect topic summary) but no openly licensed copy of the afterburning lapse equation; the
only full-text hits were unlicensed ebook mirrors, which this project must not cite. **Back to proposed** after three
runs without a readable source, so the Builder stops spending runs on it. To unblock: the operator commits the KTH
thesis PDF (diva2:1682001, open access) or the relevant pages under docs/sources/, or allows diva-portal.org for the
Builder's environment; the F110's TR still needs its own source (or an approved decision to use the generic 1.07).
