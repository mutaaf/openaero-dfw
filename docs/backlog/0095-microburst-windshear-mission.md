---
id: 0095
title: Microburst windshear drill on a DFW final, with the real recovery and a windshear warning
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-10-27
pr:
---

## Why
DFW sits under summer thunderstorms, and low-level windshear is the weather lesson every airline
pilot is trained on. The FAA/Boeing Windshear Training Aid teaches one recovery: maximum thrust
and rotate to a target pitch (about the angle of attack at stall warning), do not chase the
airspeed. Nothing in the game wind field shears with altitude or distance yet, so the weather
pillar has gusts but no hazard worth a drill. Sources: NASA Ames paper on the Training Aid recovery
https://ntrs.nasa.gov/api/citations/19910002374/downloads/19910002374.pdf ; AC 00-54 (cancelled 2022,
text still the best public summary) https://www.sheppardair.com/download/ac00-54.pdf

## What
A drill mission on the 737 (and the Cessna) on a 4 NM final to 35C: a pure `src/windshear.js`
gives a wind vector from position (a microburst: downdraft core with a radial outflow, head
wind rising then flipping to tail wind and sink over ~1.5 NM, peak about 40 kt change, shape cited
from the NASA/MIT microburst models). `main.js` adds it to the wind the flight model already
takes. Add a "WINDSHEAR, WINDSHEAR, WINDSHEAR" call (synthetic voice and banner, GPWS cadence)
when the head-wind loss passes a threshold; the coach says "Max power, pitch up, wings level".
Grade: recovered (positive climb, no ground contact, no stall) vs. flew it in. Own personal
best key via `groupMissions` like the other drills. Lazy chunk like `goAround.js`.

## Acceptance criteria
- [ ] The wind function is deterministic, pure, and unit tested: head wind change, downdraft and
      peak values match the cited shape within the stated tolerance
- [ ] A flight card flies it twice on the 737: holding approach speed and landing configuration with
      no recovery contacts the ground short; the Training Aid recovery (full thrust, pitch 15°) clears it
- [ ] The warning fires once per encounter and never in ordinary gusts (ambient final missions silent)
- [ ] Kid and Learner get the same drill (assists must not hide the shear: grade the input, lesson 2026-10-26)
- [ ] Boot JS within budget; works at 390x844 touch and 1280x720

## Test plan
`tests/unit/windshear.test.js` for the field; `tests/flight/` card for the two flights; one e2e that
starts the mission, sees the banner, and gets a results card.

## Out of scope
Visible rain shafts or lightning, storm cells on the radar, real-time convective weather.
