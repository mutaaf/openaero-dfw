---
id: 0174
title: Unusual-attitude recovery drill: start nose-high or in a diving spiral, recover to level
status: ready
priority: P2
size: M
lens: content
created: 2026-11-11
pr:
---

## Why
Every drill so far starts from a good state (steep turns, slow flight, dead stick). Real
training also teaches the other end: the airplane is in a nose-high, slow, or nose-low, banked,
fast attitude and the pilot must recover in the right order. The FAA's Airplane Flying
Handbook gives the sequence (nose-high: power up, nose down, level wings, then pitch; nose-low:
power idle, level wings first, then ease out of the dive within the speed limits), and it is
exactly what the Cessna's stall, spiral and Vne physics (0109, 0154, 0161) can now be graded
on. It is a short, replayable, high-contrast drill. Source:
https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/airplane_handbook (FAA-H-8083-3C ch. 4 "Unusual Attitudes and Recoveries").

## What
Two Cessna drills in the mission picker, each spawned airborne at ~5,000 ft AGL over open
ground (no airport in range) with a scripted start: (a) pitch +35°, IAS ~45 kt and falling,
wings level; (b) bank 60°, pitch -25°, IAS ~130 kt and rising. Pass = wings within 10° of level
and pitch within ±5° of the horizon at ≥ 70 kt, never over Vne (163 KIAS) and never below the
stall warning after the first 3 s, within 20 s; the results card says what went wrong in plain
words ("you pulled while banked: the spiral tightened"). Touches missions.js, the scripted
spawn path used by the other drills, and the results text; no physics change.

## Acceptance criteria
- [ ] Both drills appear in the picker for the Cessna and start at the stated state (unit test on the spawn).
- [ ] A scripted correct recovery passes; a scripted pull-while-banked and a scripted do-nothing both fail with different messages.
- [ ] Never on Kid's first-flight path; works at 390x844 touch and 1280x720 keyboard.
- [ ] No frame-time regression (e2e perf probe within budget); boot budget unchanged (lazy chunk).

## Test plan
tests/flight: a pilot script for each recovery; e2e: pick the drill, assert the start attitude
from telemetry and that the results card renders at both viewports.

## Out of scope
Inverted starts, aerobatics, spins, the 737 and F-16.
