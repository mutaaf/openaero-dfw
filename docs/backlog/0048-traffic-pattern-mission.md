---
id: 0048
title: Fly the traffic pattern at Addison in the Cessna: downwind, base, final, coached
status: shipped
priority: P2
size: M
lens: content
created: 2026-10-19
pr: 101
---

## Why
Every approach mission today starts on a straight-in final. Real small-airplane flying is
the rectangular pattern: depart upwind, 1,000 ft AGL on a downwind about 1/2 to 1 mile out,
base, final (FAA AC 90-66A; AFH ch. 7 https://www.faasafety.gov/files/events/EA/EA68/2019/EA6896914/09_afh_ch7.pdf,
overview https://www.angleofattack.com/traffic-pattern/). It teaches the player to fly by
hand, makes the Cessna missions feel like the real thing, and gives a pilot something to
check against what they know.

## What
New mission `pattern_kads` (KADS, Cessna 172S, spawn on downwind abeam the numbers, left traffic for the active runway from `selectActiveRunway`). A pure `patternLeg(posRelRunway, heading)` in a new `src/pattern.js` names the leg (downwind, base, final) and gives a target heading/altitude; the coach card and a small HUD hint say "Turn base" at about 45° from the threshold. Landing graded as usual (0012).

## Acceptance criteria
- [ ] Unit test: `patternLeg` returns downwind/base/final for positions around KADS runway 15/33 (either direction) and a target altitude of field elevation + 1,000 ft
- [ ] Coach prompts "Turn base" and "Turn final" at the right places (screenshot at 1280x720 and 390x844)
- [ ] Mission appears in the picker with a one-line blurb and keeps its own personal best
- [ ] No frame-time regression, no new hosts

## Test plan
Unit test for `patternLeg`; e2e loads `?mission=pattern_kads` and asserts the first coach prompt is the downwind one.

## Out of scope
Other traffic, pattern entry from the 45, radio calls.
