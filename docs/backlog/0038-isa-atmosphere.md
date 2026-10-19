---
id: 0038
title: ISA atmosphere with altitude, METAR temperature and altimeter; IAS vs TAS
status: shipped
priority: P1
size: M
lens: authenticity
created: 2026-10-18
pr: 42
---

## Why
The model flies in sea-level air (ρ = 1.225) at every altitude, and IAS = TAS. A C172 at
10,000 ft climbs as well as at sea level (flight card: 696 vs 697 fpm; POH: roughly half),
a 737 at FL350 behaves like it is on the runway, and the airspeed tape never diverges
from true airspeed. Today's METAR already gives temperature and altimeter: hot Texas
afternoons should lengthen the takeoff roll, as they do for real pilots (density altitude).

## What
New pure `src/atmosphere.js`: ICAO ISA troposphere/tropopause (T, p, ρ, a) from
geopotential altitude with a temperature offset from the METAR (`tempC` vs ISA at field
elevation) and pressure altitude from the altimeter setting. `stepFlightModel` takes ρ
and the speed of sound from it (MSL height comes from the caller: `body.altMslM`); IAS =
TAS·√(ρ/ρ₀) (equivalent airspeed is fine below Mach 0.3; add compressibility for jets);
Mach uses local a. HUD shows IAS on the tape and TAS/GS in the readouts.

## Acceptance criteria
- [x] Unit tests: ISA ρ at 0/5000/11000/20000 m match the ICAO table within 0.5%
- [x] ~~Flight card "climbs much slower at 10,000 ft" promoted~~ moved to 0039: with constant static thrust, thinner air raises excess power (T−D)·TAS, so the card closes only with thrust lapse
- [x] At FL100 standard day, TAS ≈ IAS × 1.16 (±2%)
- [x] A +15 °C METAR lengthens the C172 ground roll vs ISA (density altitude card)
- [x] Works at 390x844 touch and 1280x720 keyboard/mouse
- [x] No frame-time regression (e2e perf probe within budget)

## Test plan
`tests/unit/atmosphere.test.js` against ICAO Doc 7488 values; promote the flight card;
add a density-altitude takeoff card.

## Out of scope
Winds aloft, turbulence models, icing.
