---
id: 0018
title: Today's crosswind challenge — the worst real crosswind runway in DFW, graded
status: ready
priority: P1
size: M
lens: player-feel
created: 2026-10-16
pr:
---

## Why
The sim now knows today's real wind at six fields (edge METAR) and grades landings. A
daily "crosswind challenge" mission that picks the runway with the strongest real
crosswind right now turns live weather into a reason to come back every day.

## What
- Pure `pickCrosswindRunway(metarsByIcao, RUNWAY_ENDS)` in `src/weather.js`: for each
  runway end with a live METAR, crosswind/headwind components; choose the max crosswind
  with a headwind ≥ 0 (no tailwind landings). Ties → longer runway.
- A dynamic mission `crosswind_today` (4 NM final on that end) added to the mission list
  when live weather exists, labelled e.g. "Today's crosswind: KDAL 13L, 14 kt from the right".
- The landing grade gains a "Crab/de-crab" note: heading vs track at touchdown (≤3° is
  full marks) shown on the results card (score weighting unchanged unless the factor is
  added with a unit-tested weight change).

## Acceptance criteria
- [ ] Unit test: with KDFW 27015KT the pick is a 17/18 or 35/36 end with ~15 kt crosswind and no tailwind
- [ ] Unit test: with no live METARs the mission is not offered
- [ ] e2e (mocked METAR): the mission appears with the runway and crosswind in its label and spawns aligned
- [ ] Results card shows the drift angle at touchdown on that mission

## Test plan
Vitest for `pickCrosswindRunway`; Playwright with `stubMetar` fixtures.

## Out of scope
Leaderboards or anything needing a server write.
