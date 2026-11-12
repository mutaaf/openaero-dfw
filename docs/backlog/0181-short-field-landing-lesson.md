---
id: 0181
title: Short-field landing lesson at Addison (aim for the first 1,000 ft)
status: ready
priority: P2
size: M
lens: content
created: 2026-11-12
pr:
---

## Why
The Cessna missions teach patterns, stalls and emergencies but not the technique the POH
sizes its landing table around: a stabilized final at 1.3 Vso with full flaps, power to idle
over the fence, touchdown at the aim point, then maximum braking. FAA-H-8083-3C ch. 9 ("Short-
Field Approach and Landing") gives the steps (read the PDF for the figures; the C172 POH
Fig. 5-11 roll is ~575 ft and is already carded in c172.test.js). It is a lesson a real
student flies and the sim can check.

## What
A mission on KADS 16 (the shortest paved runway the Cessna uses in the picker): 3 NM final, flaps 30
by 500 ft, with the coach holding 61-63 KIAS, a steeper aim at the numbers, and a results line
for touchdown point (within 400 ft of the aim point full marks), stop distance versus the
POH's, and braking use. Reuse landing.js grading and the lazy-chunk drill pattern (stallDrill.js);
Kid keeps the hands-off guide to the numbers.

## Acceptance criteria
- [ ] Picker shows the lesson in Drills; loads as a lazy chunk (boot budget unchanged).
- [ ] Grade rewards touchdown within the first 1,000 ft and a stop on the runway; floats long cap at C.
- [ ] Works at 390x844 touch and 1280x720.

## Test plan
Flight card flying the guided approach (stops inside POH x 1.15); e2e loads the mission.

## Out of scope
Obstacle-clearance (50 ft) scenery, soft-field, weight and balance.
