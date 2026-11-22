---
id: 0210
title: No-flap landing lesson: a flatter, faster final and a longer float, with the right words
status: shipped
priority: P2
size: M
lens: content
created: 2026-11-21
pr: 302
---

## Why
A stuck flap handle or a gusty day is the real reason pilots land without flaps, and the lesson is
all feel: the approach is faster, the nose sits higher, the descent is flatter and the float is much longer,
so the aim point and the speed must change. Flying notes put the extra stopping distance near 50% where the
manual gives no figure, and the extra speed adds energy faster than it looks. The game already models flap drag
shape (0186), the flaps-glide card (0180) and has short-field (0181) and power-off (0189) lessons whose
coach and scoring pattern this can reuse. Sources:
https://www.cfinotebook.net/notebook/maneuvers-and-procedures/takeoffs-and-landings/no-flap-approach-and-landing
and https://www.flyingmag.com/features/no-flap-landings/ . Read the FAA Airplane Flying Handbook ch. 9 text
(FAA-H-8083-3C) before fixing the speeds.

## What
A Cessna mission on the KDFW-area general-aviation runway with the long runway: a 4 NM final with flaps
stuck at 0. The coach says to keep the speed about 10 kt above the flaps-30 Vref, aim at the PAPI as usual,
expect a long float and not to force it down. Grade the touchdown zone with the zone widened for the float, and a
results line comparing the roll to a flaps-30 landing from the same final. Touches missions.js, the coach table
and results text; the flaps lever is locked at 0 for the drill.

## Acceptance criteria
- [ ] The mission starts with flaps 0 and the lever refuses to move (unit test).
- [ ] A scripted no-flap landing at the coached speed scores a pass; a scripted flaps-30 speed (too slow, nose high) fails as "too slow for no flaps".
- [ ] The zone grading never penalises the expected float; an e2e landing at both viewports shows the results card.
- [ ] Not on Kid's first-flight path; no frame-time regression.

## Test plan
tests/flight: the two scripted approaches; e2e: pick it, check the locked lever and the card.

## Out of scope
Flap failure of the 737 or the F-16, partial flap failures.
