---
id: 0116
title: 737 thrust lapse at altitude matched to CFM (the FL410 ceiling itself moved to 0120)
status: shipped
priority: P1
size: M
lens: authenticity
created: 2026-10-30
pr: 132
---

## Why
Found shipping 0113. At 65 t, ISA, the 737 still climbs at ~1,200 fpm with full thrust at
42,000 ft (Mach 0.79) and holds level flight to about FL520, where the real airplane's ceiling
is FL410 (EUROCONTROL Aircraft Performance Database B738; EASA TCDS IM.A.120 Issue 30 p. 28,
maximum operating altitude 41,000 ft). 41,000 ft is a legal operating limit, not a
published thrust-limited ceiling, so the card's bound (no level flight at 42,000 ft, 65 t) rests on
that limit and the APD's FL410; the stronger evidence is that the model holds level ~11,000 ft
above it. The likely cause is the turbofan model: `src/engine.js` lapses thrust as
σ^densityExp × (1 − 0.9 M + 0.6 M²) from 240 kN static, with densityExp 0.7 in `src/aircraft.js`,
which leaves 2 × 35 kN at FL350 and 2 × 29 kN at FL410. A CFM56-7B's maximum cruise thrust there
is thought to be nearer 2 × 24 kN (an estimate, uncited: find a CFM56-7B source first). There is also no buffet boundary (CL at FL410 is ~0.66 at Mach 0.79). A pilot who
climbs the jet finds it rockets past where any 737 can go.

## What
Refit the turbofan lapse for the 737 (a steeper density exponent above the tropopause, or a
thrust-rating step: takeoff vs maximum climb/cruise, from a cited CFM56-7B source) so the
known-gap card `tests/flight/b738.test.js` "KNOWN GAP (0116)" passes, without regressing the
takeoff, go-around (25.119) and spool (33.73) cards. Optional: a high-speed buffet onset CL.

## Acceptance criteria
- [x] A cited CFM56-7B (or 737-800) high-altitude thrust source before any fit to it
- [ ] The 0116 card passes and moves from `it.fails` to `it` (not met: the thrust half is fixed, the wing half is 0120)
- [x] The FL350 Mach 0.79 cruise cards (0113) still pass: level flight within the thrust available
- [x] Every other b738 card unchanged and green; the thrust source cited in aircraft.js

## Test plan
`tests/flight/b738.test.js`; `tests/unit/engine.test.js` for the new lapse.

## Out of scope
Fuel burn, step climbs, the F-16's engine.

## Shipped notes
- Source: Snecma's CFM56-7B fact sheet (Direction de la Communication, June 2006): max climb
  thrust at 35,000 ft, Mach 0.8, ISA, installed, 26.50 kN for every rating (-7B18 to -7B27).
  The model had 35.1 kN there. `densityExp` 0.7 → 0.94 puts it at 26.49 kN, a new card (±5%).
  Cross-check: Mattingly's high-bypass lapse (Aircraft Engine Design, 2nd ed., eq. 2.45a)
  agrees within ~1% at 10,000 ft, Mach 0.5, and is ~11% under the fit at FL410. JSBSim's
  Aero-Matic CFM56.xml (a generic table, not CFM data) gives ~42 kN at FL350, Mach 0.8: not used.
- Measured at 65 t, Mach 0.79, full thrust: FL350 +875 fpm, FL410 +271, FL420 +172, FL430 +74,
  FL440 −23 (level ceiling ~FL438, was ~FL520). The 42,000 ft card still fails: the drag stays
  ~36 kN from FL410 to FL440 as CL rises 0.66 → 0.76, because the airframe has no
  compressibility drag rise or buffet boundary. It is now KNOWN GAP (0120). Not tuned to pass:
  closing it with thrust alone would put full thrust ~6% under CFM's own figure.
- Partial by design: the thrust half shipped; the title's original outcome (no level flight
  above FL410 at 65 t) is 0120's card. The JSBSim backend (`?fdm=jsbsim`) has its own engines
  and is untouched. Panel: physics, device and first-timer found no regressions; the fixes were
  wording (a stale 56% margin comment, the Mattingly check's disagreement at FL350, changelog).
- Below FL100 the lapse costs a few % (at DFW's 600 ft −0.4%, at 10,000 ft −7%); every takeoff,
  go-around (25.119), spool (33.73), drill and cruise card is unchanged and green.
