---
id: 0070
title: Give the 737 a flaps 5 takeoff notch that flies the published crew speeds
status: proposed
priority: P2
size: M
lens: authenticity
created: 2026-10-21
pr:
---

## Why
0062 found citable 737-800 takeoff speeds: AAIB Bulletin 6/2019 (YR-BMF) and ATSB
AO-2014-162 (VH-VZR) print four performance-tool outputs that agree, scaled to 65 t, on
VR ~145 kt and V2 ~148 kt (V2 − VR 3–4 kt), flap not stated but most likely 1 or 5, what
line crews use on long runways. The model's only takeoff notch is 10, and Boeing's field
length card (ACAP §3.3.29, optimum flap) caps how little it can lift: refitted, it flies
Vr 135 / V2 142. A pilot who knows the jet still sees speeds ~10 kt low. The two cards are
`it.fails` in `tests/flight/b738.test.js` ("KNOWN GAP (0070)").

## What
Add a flaps 5 notch to the 737 (`src/aircraft.js` flapDetentsDeg/flapCl/flapCd/
alphaStallDegByFlap, the flap keys and buttons, `vrKts` by flap) with less lift than
flaps 10, fitted so a takeoff at the published VR lifts off at 8–9° in 3–4 s, and make it
the 737's takeoff flap for spawns, Kid and the autopilot. Check every place that indexes
flaps by number (landing notches 30/40 move up one), and the e2e flap controls.

## Acceptance criteria
- [ ] The two 0070 known-gap cards pass at flaps 5 and are promoted to `it`
- [ ] The flaps 10 field-length, rotation and engine-out cards (0058) stay green
- [ ] Landing cards (0057) and every assist/autopilot test unchanged
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse (flap control)

## Test plan
`npm test -- tests/flight`, plus the flap e2e.

## Out of scope
A full Boeing takeoff-performance table; engine-out yaw.
