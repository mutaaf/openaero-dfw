---
id: 0209
title: Emergency descent drill: smoke in the cockpit, get the Cessna down fast without breaking it
status: ready
priority: P1
size: M
lens: content
created: 2026-11-21
pr:
---

## Why
Every drill so far is a precision or recovery task; none teaches the other emergency the FAA tests,
getting down quickly and safely (cabin fire, smoke). The Cessna's physics now carry the pieces: a
power-off dive trades altitude for speed within Vne (0154, 0174), bank steepens the descent, and gear/flaps
limits exist (0127). The ACS lists it as Private Pilot task PA.IX.A "Emergency Descent": power idle,
bank about 30-45° to keep the descent turning, maintain an airspeed appropriate to the airplane (below
Vne and, with flaps out, below Vfe), level off at the assigned altitude within ±100 ft. Sources:
https://www.faa.gov/sites/faa.gov/files/training_testing/testing/acs/private_airplane_acs_change_1.pdf
and the CFI Notebook summary https://www.cfinotebook.net/notebook/maneuvers-and-procedures/emergency/emergency-descent
(verify the tolerance wording in the ACS PDF before coding).

## What
A Cessna drill in the picker, spawned airborne at ~6,000 ft AGL over open ground at cruise. After
Start, a "smoke in the cockpit" call asks for an emergency descent to 2,000 ft AGL. Pass = reach
2,000 ft ±100 ft within 90 s, never above Vne, never above Vfe with flaps down, never below 1,800 ft AGL, no stall
warning, load factor under 2.5 g. The results card says in plain words what went wrong ("you stayed in a
straight dive: bank 30-45° steepens it and keeps you in the clear air under you", "you went through Vne").
Touches missions.js, the scripted-spawn path used by 0174/0161 and the results text; no physics change.

## Acceptance criteria
- [ ] Drill is in the picker for the Cessna and spawns at the stated state (unit test on the spawn).
- [ ] A scripted correct descent (idle, 40° bank, ~100 kt) passes; a scripted gentle 500 fpm descent fails as too slow; a scripted dive past Vne fails with a different message.
- [ ] Never on Kid's first-flight path; works at 390x844 touch and 1280x720 keyboard.
- [ ] No frame-time regression (e2e perf probe within budget); boot budget unchanged (lazy chunk).

## Test plan
tests/flight: three pilot scripts as above; e2e: pick the drill, assert the start state and that the results card renders at both viewports.

## Out of scope
Pressurised-airplane rapid decompression, the 737 and F-16, a visible smoke effect.
