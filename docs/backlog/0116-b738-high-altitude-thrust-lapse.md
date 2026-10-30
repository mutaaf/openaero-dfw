---
id: 0116
title: 737 thrust lapse at altitude: no level flight above the FL410 ceiling at 65 t
status: proposed
priority: P1
size: M
lens: authenticity
created: 2026-10-30
pr:
---

## Why
Found shipping 0113. At 65 t, ISA, the 737 still climbs at ~900 fpm with full thrust at
42,000 ft (Mach 0.79) and holds level flight to about FL520, where the real airplane's ceiling
is FL410 (EUROCONTROL Aircraft Performance Database B738; EASA TCDS IM.A.120 Issue 30 p. 28,
maximum operating altitude 41,000 ft). The cause is the turbofan model in `src/engine.js`:
thrust lapses as σ^0.7 × (1 − 0.9 M + 0.6 M²) from 240 kN static, which leaves 2 × 35 kN at
FL350 and 2 × 29 kN at FL410; a CFM56-7B's maximum cruise thrust there is published around
2 × 24 kN. There is also no buffet boundary (CL at FL410 is ~0.66 at Mach 0.79). A pilot who
climbs the jet finds it rockets past where any 737 can go.

## What
Refit the turbofan lapse for the 737 (a steeper density exponent above the tropopause, or a
thrust-rating step: takeoff vs maximum climb/cruise, from a cited CFM56-7B source) so the
known-gap card `tests/flight/b738.test.js` "KNOWN GAP (0116)" passes, without regressing the
takeoff, go-around (25.119) and spool (33.73) cards. Optional: a high-speed buffet onset CL.

## Acceptance criteria
- [ ] The 0116 card passes and moves from `it.fails` to `it`
- [ ] The FL350 Mach 0.79 cruise cards (0113) still pass: level flight within the thrust available
- [ ] Every other b738 card unchanged and green; the thrust source cited in aircraft.js

## Test plan
`tests/flight/b738.test.js`; `tests/unit/engine.test.js` for the new lapse.

## Out of scope
Fuel burn, step climbs, the F-16's engine.
