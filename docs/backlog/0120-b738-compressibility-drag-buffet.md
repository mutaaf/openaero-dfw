---
id: 0120
title: 737 compressibility drag and buffet: no level flight above the FL410 limit at 65 t
status: ready
priority: P1
size: M
lens: authenticity
created: 2026-10-30
pr:
---

## Why
Found shipping 0116. With the 737's thrust now on CFM's published max climb figure (26.5 kN
per engine at FL350, Mach 0.8), at 65 t and Mach 0.79 it still holds level on full thrust to
about FL438, above the FL410 maximum operating altitude (EASA TCDS IM.A.120 p. 28; EUROCONTROL
APD B738 ceiling FL410). The thrust matches CFM's FL350 figure; the wing does not behave: the model's drag stays ~36 kN
from FL410 to FL440 while CL rises 0.66 → 0.76 at Mach 0.79 (`src/aero.js` dragCoefficient has
no Mach term), so the airframe gets *more* efficient as it climbs into what is, on a real 737,
the buffet margin. The thrust is CFM's at FL350; its shape above that is one σ exponent,
unverified (Mattingly's eq. 2.45a lapses faster in the stratosphere: −3% at FL200, −12% at
FL440 against the fit), so a cited stratosphere thrust point is also welcome evidence. `tests/flight/b738.test.js` "KNOWN GAP (0120)" measures it (+172 fpm at
42,000 ft).

## What
A Mach drag rise that grows with CL (for example the Korn equation with Lock's fourth-power
law, Mason / Raymer), and optionally a high-speed buffet onset CL, for the 737 only, with
every parameter (sweep, thickness, airfoil technology factor) from a cited source. Find the
737-800's sweep and t/c first; the result is very sensitive to the technology factor, so it
must not be fitted to make the card pass.

## Acceptance criteria
- [ ] Every new aero parameter cited (Boeing ACAP, a published 737 NG wing study, or similar)
- [ ] The 0120 card passes and moves from `it.fails` to `it`
- [ ] The FL350 cruise cards and CFM's FL350 thrust card still pass; low-speed cards unchanged

## Test plan
`tests/flight/b738.test.js`; a unit test in `tests/unit/` for the drag rise against Mach and CL.

## Out of scope
The F-16 and C172, a shaker or buffet sound, Mach tuck.
