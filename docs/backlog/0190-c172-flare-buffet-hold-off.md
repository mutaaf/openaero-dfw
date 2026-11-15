---
id: 0190
title: The Cessna's calm flare shakes at almost full buffet in the hold-off since 0183
status: proposed
priority: P2
size: S
lens: authenticity
created: 2026-11-15
pr:
---

## Why
0079 carded the Cessna's calm landing flare (tests/flight/harness.js crosswindLanding: 70 KIAS,
flaps 10, a flare from 30 ft at idle) as "short of the stall's full buffet (≤ 0.75) in the hold-off".
0183 put ground effect on PHAK's curve (FAA-H-8083-25C ch. 5), which takes less induced drag off in
the flare: the scripted flare now bleeds speed faster and touches down at α 14.0° of the 14.1° stall,
50 KIAS, buffet ~0.98 (before: α 13.3°, 51 KIAS, ~0.65). Still silent above 5 ft, still starting
under the horn's speed. No source says how hard a C172 shakes in a full-stall touchdown, so the
≤ 0.75 bound was the game's choice, measured on the old curve.

## What
Decide which is off, with a source if one exists:
- the harness's flare (its sink target `flareSinkMps(h) × 0.5` asks for a slower sink than a pilot
  would, so it pitches to the stall), or
- src/buffet.js's onset (85% of the stall angle) and its ramp,
- or accept a near-full shake at a full-stall touchdown and rewrite the card.

## Acceptance criteria
- [ ] The KNOWN GAP (0190) card in tests/flight/buffet.test.js passes, or is replaced by a cited one.

## Test plan
`npm test -- tests/flight/buffet.test.js`.

## Out of scope
Kid and Learner (their AoA caps keep them out of the buffet).
