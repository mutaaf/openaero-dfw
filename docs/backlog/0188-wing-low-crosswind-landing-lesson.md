---
id: 0188
title: Crosswind lesson: land the Cessna wing-low, upwind wheel first, at Addison
status: ready
priority: P2
size: M
lens: content
created: 2026-11-15
pr:
---

## Why
`crosswind_today` (0018) shows a drift number; 0069 proves the airplane can do the POH's 15 kt.
Nothing yet teaches the technique. The Airplane Flying Handbook (FAA-H-8083-3C, ch. 9 Approaches and
Landings, "Crosswind Approach and Landing") teaches the wing-low method: align with the runway,
lower the upwind wing into the wind with opposite rudder to hold the nose on the centreline, and
touch the upwind main first. Read the PDF first (web search could not open the chapter text; see
the LESSONS row of 2026-11-12), and cite the page. Wing-low is the FAA's usual recommendation.

## What
Mission `kads_crosswind_wing_low` (Pilot and Learner; Kid keeps its de-crab assist): a 2 NM final
to the Addison runway with the stronger crosswind component, the METAR's when live and a scenario
wind (12 kt, 90° off, within the POH's demonstrated 15 kt) otherwise. Coach (a lazy chunk like
steepTurns.js): "Wind from the right: lower the right wing, left rudder to hold the line", read
from `sim.wx`; at 50 ft "hold it, upwind wheel first". Graded on the card: bank at touchdown
between 2° and 8° into the wind, heading within 3° of the runway at touchdown (no crab), which
main touches first (gear.js per-wheel loads), the centreline offset and the usual factors; a
crabbed touchdown caps B, a touchdown on both mains and a big bank cap nothing but are named.

## Acceptance criteria
- [ ] The wind component and "which wing" words are computed from the METAR or scenario wind, left and right
- [ ] A scripted wing-low pilot grades A/B with the upwind wheel first; a crab-to-touchdown pilot is capped at B and told why; flown on both flight models if 0081's gap allows (else `it.fails` carded with its ticket)
- [ ] Appears in the picker with a blurb and its own best
- [ ] 390x844 touch (rudder reachable) and 1280x720 keyboard

## Test plan
tests/flight pilots both ways (shape of tests/flight/crosswind*.test.js); unit tests for the coach words; one e2e for the card.

## Out of scope
Crosswind takeoffs (0069 covers the card), gusts above the POH's 15 kt, a new side-force model (0081).
