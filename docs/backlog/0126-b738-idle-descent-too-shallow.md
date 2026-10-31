---
id: 0126
title: 737 idle descent at 280 kt sinks ~1,850 ft/min, about half of EUROCONTROL's 3,500
status: proposed
priority: P2
size: M
lens: authenticity
created: 2026-10-31
pr:
---

## Why
Found by the Validator flying ticket 0119's descent card. At 65 t, clean, throttle 0, holding
280 kt EAS, the model descends 1,870 fpm at FL200 and 1,760 at FL150 (1,220 at 250 kt, 5,000 ft);
EUROCONTROL's Aircraft Performance Database (B738, read 2026-10-31,
learningzone.eurocontrol.int/ilp/customs/ATCPFDB/details.aspx?ICAO=B738) lists 3,500 ft/min for
the 280 kt descent to FL100. The APD is a nominal-rate table, not an idle measurement, so
a real idle rate from the FCOM descent table or a BADA-style idle-descent model is the better
reference. A shallow idle descent means the Kid autopilot and any player descent from altitude
need far more distance than a real 737 (and no speedbrake is needed to be steeper).

## What
Find the cause: the clean airframe drag at 280 kt (CD0 plus any Mach term) or the idle thrust
(`idleFraction` 0.04 of static, no Mach or density lapse at idle). Fit to a cited figure; do
not tune to make the card pass.

## Acceptance criteria
- [ ] `tests/flight/b738.test.js` "KNOWN GAP (0126)" becomes a passing `it`
- [ ] No 737 card (final, go-around, cruise) regresses

## Test plan
Promote the flight card; add a unit check of idle thrust at 280 kt if the thrust is the cause.

## Out of scope
Speedbrakes; VNAV logic; the thrust lapse at climb power (0116).
