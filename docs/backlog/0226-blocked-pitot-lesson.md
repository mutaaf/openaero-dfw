---
id: 0226
title: Blocked-pitot lesson: the airspeed needle climbs as you climb, so trust attitude and power, not the needle
status: ready
priority: P2
size: M
lens: content
created: 2026-11-25
pr:
---

## Why
With the pitot tube and its drain hole blocked the airspeed indicator acts as an altimeter: IAS rises in a climb and
falls in a descent while true airspeed is unchanged (SKYbrary,
https://skybrary.aero/articles/unreliable-airspeed-indications and
https://skybrary.aero/articles/airspeed-indicator). Crews have stalled airplanes by pushing the nose down on a
falsely low needle. It is the single most instructive instrument failure and the sim has none
(`src/coach.js`, `src/emergencyDescent.js` cover engine and pressure emergencies only).

## What
Mission `pitot_block`: C172 climbs out of Addison 16 in good weather; at 1,500 ft AGL the pitot freezes. The HUD
IAS is replaced by an altitude-driven value (frozen IAS scaled by pressure ratio change since the failure;
`src/atmosphere.js`). The coach teaches the book fix: known pitch and power (about 5 deg nose up, full power for
climb; level 2,300 RPM), pitot heat, then level off. Graded on never entering stall (no stall horn), altitude +-150 ft
at level-off, and (Pilot assist) no big pitch changes chasing the needle. Kid: gentler failure, bigger prompt.
The real airspeed stays in physics and the debug readout; only the display lies.

## Acceptance criteria
- [ ] Displayed IAS follows altitude change at constant true airspeed: +10 kt per 1,000 ft climbed (+-3), unit test
- [ ] A flight card: attitude-and-power technique completes with no stall and level-off within 150 ft
- [ ] A flight card: chasing the needle (pitching down on rising IAS then up) is graded below the handbook run
- [ ] The failure indicator (red X/amber flag on the tape) is visible and not colour-only; works on phone

## Test plan
tests/flight/pitotBlock.test.js (both runs), unit test on the display model, e2e smoke.

## Out of scope
Blocked static port, ice accretion modelling, other airframes.
