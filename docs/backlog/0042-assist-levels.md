---
id: 0042
title: Assist levels Kid · Learner · Pilot over the same physics
status: ready
priority: P1
size: M
lens: player-feel
created: 2026-10-18
pr:
---

## Why
The same game has to delight a 9-year-old with an iPad and satisfy a pilot. Real
training aircraft and airliners already solve this with envelope protection, auto-trim
and coordination (Airbus normal law); games like Pilotwings and Microsoft Flight
Simulator's assistance presets show the pattern. Today there is one setting: raw.

## What
A pure `src/assists.js` that shapes pilot input before `stepFlightModel` (physics
untouched): **Kid**: bank ≤ 30° and pitch envelope protection, auto-coordination and
auto-trim, auto-throttle on speed, gear/flaps automatic, a stall becomes a gentle
nose-drop, a hard landing bounces and resets instead of crashing, big friendly prompts.
**Learner**: protections on, manual throttle/flaps/gear, coach on. **Pilot**: raw
(today). Chosen on the start screen (big icons, ≥ 64 px on touch), remembered as
`openaero_assist_v1 = { v: 1, level }`; the landing grade and personal best are kept
per level.

## Acceptance criteria
- [ ] Unit tests: in Kid, full stick for 10 s never exceeds 30° bank or stalls
- [ ] e2e: Kid level on the default final, touch only, lands with a grade (no crash)
- [ ] Pilot level is byte-for-byte today's input path (existing e2e unchanged)
- [ ] Start-screen picker readable and tappable at 390x844, 844x390, 820x1180
- [ ] No frame-time regression (e2e perf probe within budget)

## Test plan
`tests/unit/assists.test.js` (envelope, coordination, auto-throttle); an e2e per level.

## Out of scope
Voice tutor, new missions.
