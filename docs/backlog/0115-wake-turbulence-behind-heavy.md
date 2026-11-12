---
id: 0115
title: Land past the heavy's touchdown point: a wake-turbulence lesson on the parallel final
status: shipped
priority: P2
size: M
lens: content
created: 2026-10-30
pr: 239
---

## Why
Every DFW pilot is taught to stay at or above the larger aircraft's flight path and land past
its touchdown point (FAA AC 90-23G, wake turbulence: https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_90-23G.pdf;
the same procedure is in AIM 7-4-5, https://www.angleofattack.com/aim/chapter-7/7-4-5/).
A mission that teaches it with the jet from 0080 in front of you is real procedure, not a gimmick.
Depends on 0080 shipping (the ambient jet); promote when it has.

## What
A lazy-chunk drill like `goAround.js`: the C172 on a 5 NM final behind 0080's jet on the same
runway; the coach says stay above its path and name its touchdown point once it lands; grade
the touchdown beyond that point and the glidepath at or above the jet's. No simulated vortex
force in v1 (a graded procedure, not a wake model; say so on the card).

## Acceptance criteria
- [x] Touching down short of the jet's touchdown point, or flying below its path inside 2 NM, is capped C with the reason on the card
- [x] Touchdown past the point on or above the path grades normally
- [x] Coach words are in the lazy chunk (boot budget), readable at 568x320

## Test plan
Pure state-machine unit tests (above/below path, short/long touchdown), headless flight card with the traffic jet; one e2e flow.

## Out of scope
Vortex physics, departures behind a heavy, crossing runways.

## Builder notes (2026-11-12, shipped)
- Source read: AIM 7-4-6 (faa.gov, chap7_section_4): "Landing behind a larger aircraft - same runway. Stay at or above the
  larger aircraft's final approach flight path - note its touchdown point - land beyond it." The 737-800 is a larger
  aircraft to a Cessna, not a Heavy (AIM 7-4-9): the game's words say "the jet".
- `kdfw_35c_wake` (src/missions.js), src/wake.js, traffic.js's same-runway jet (wakeSpawnFor), which records its wheel
  height along the final and its touchdown point. Measured touchdown: ~676 m (2,200 ft) in calm air, ~564 m in 15 kt on the nose.
- "Below its path": over 20 ft under the jet's wheels for 2 s, inside 2 NM. The jet holds the 3° path within ~2 ft; the
  PAPI's on-path band's lower edge (2.83°) is ~30 ft under it at 2 NM and is flagged (tests/flight/wake.test.js).
- The touchdown zone is rescored from the jet's point (full marks 30-750 m beyond: a game choice). The stabilized gate's
  glideslope and the PAPI coach's "high" accept 3° up to Kid's path (aimed 100 m past the jet), or the lesson's own
  technique was called unstabilized ("go around") on the first run.
- Flown at midday (`sun: 'Noon'`): the traffic has no lights yet.
