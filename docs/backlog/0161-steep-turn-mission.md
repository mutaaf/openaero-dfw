---
id: 0161
title: Steep-turn mission: hold 45° bank and your altitude, graded to the FAA test standard
status: proposed
priority: P2
size: M
lens: content
created: 2026-11-05
pr:
---

## Why
Pillar 4: missions that teach something real. Every mission today is an approach, a takeoff or a drill; none teaches the airplane's turning energy, which the new turn-rate and bank-stall cards (0152, 0159) now back with numbers. The Private Pilot ACS steep-turn task is a real, checkable standard: 45° bank, hold altitude within ±100 ft, airspeed ±10 kt, bank ±5°, roll out on the entry heading within ±10° (FAA-S-ACS-6C, Area VII, https://www.faa.gov/training_testing/testing/acs). A kid sees the horizon tilt and the nose have to rise; a pilot gets a score.

## What
A `steep_turns` C172 mission (3,000 ft AGL over open country near KADS, 95 KIAS, clean) with a lazy result card: seconds within tolerance on altitude, speed and bank across two 360° turns, graded S to D like landings (`src/landing.js` style, new small module). Kid and Learner get the existing coach slot saying "ease back as the bank steepens" and "wings level, roll out". No new HUD elements.

## Acceptance criteria
- [ ] A scripted ±100 ft / ±5° pilot (flight harness) grades A or better; a pilot who loses 300 ft grades D
- [ ] Appears in the mission picker with a deep link `?mission=steep_turns`
- [ ] Works at 390x844 touch and 1280x720; coach text clears the horizon (0137)
- [ ] Boot JS under budget (lazy chunk like the other drills)

## Test plan
Unit test for the grader; one flight card flying the turn; e2e loads the deep link and sees the briefing.

## Out of scope
Slow flight, stalls (0087 covers those), 737 and F-16 versions.
