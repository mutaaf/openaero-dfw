---
id: 0126
title: 737 idle descent at 280 kt sinks ~1,850 ft/min, about half of EUROCONTROL's 3,500
status: shipped
priority: P2
size: M
lens: authenticity
created: 2026-10-31
pr: 172
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
- [x] `tests/flight/b738.test.js` "KNOWN GAP (0126)" becomes a passing `it` (re-referenced: see Outcome)
- [x] No 737 card (final, go-around, cruise) regresses

## Test plan
Promote the flight card; add a unit check of idle thrust at 280 kt if the thrust is the cause.

## Out of scope
Speedbrakes; VNAV logic; the thrust lapse at climb power (0116).

## Outcome
No cause in the model: at FL170, 280 KEAS, 65 t, clean CD 0.0272 (L/D 14.8) against 4 kN of idle
thrust gives ~2,260 ft/min level-speed, ~1,850 with a constant-EAS descent's kinetic energy; even
zero idle thrust gives ~2,100. Reaching APD's 2,800 floor needs L/D ~11, an airliner with its
speedbrakes out. The reference was the gap: WRAP (Sun, Ellerbroek & Hoekstra, Transp. Res. C 98,
2019; OpenAP's b738 table), fitted to ADS-B tracks of real 737-800 flights, puts the constant-CAS
descent (282 kt, ~FL318 to ~FL194) at 1,959 ft/min mean (±1σ 1,425-2,492; steepest seen 2,833,
below APD's 3,500). The model flies 1,900-2,030 across that band. The card now asks for WRAP's
mean ±1σ; no model parameter changed. WRAP's climb row agrees with APD's (0135 stands).
