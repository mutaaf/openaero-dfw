---
id: 0205
title: Daily landing: one seeded approach per calendar day, same for everyone, no server
status: ready
priority: P1
size: M
lens: content
created: 2026-11-18
pr:
---

## Why
Pillar 4 ("a game worth replaying") has a personal best per mission but no reason to come back tomorrow.
A daily seeded challenge (the Wordle / daily-run pattern) gives a fresh, shareable-by-word-of-mouth goal
with no accounts, no leaderboard and no network: the seed is the Dallas calendar date, so every player gets the
same airport, runway, wind and light that day. It teaches variety (every runway, every wind) which is the
point of the sim, and it is vanity-free: the only output is the player's own grade.

## What
- `src/daily.js` (pure): `dailyChallenge(dateStr)` returns `{ airport, runway, windDir, windKt, gustKt, tod, aircraft }`
  from a small integer hash of the `America/Chicago` date (`Intl.DateTimeFormat`, no library). Pick only
  from the existing approach-mission runways; wind from a bounded table (calm to 20 kt, crosswind <= the C172's
  demonstrated 15 kt, no tailwind); time of day from Day/Dusk/Night; aircraft is the player's current one.
- A "Today's landing" entry at the top of the mission picker that builds a normal approach mission through the
  existing mission/METAR-override path (the crosswind challenge in 0018 already injects a scenario wind).
- Personal best keyed `daily:YYYY-MM-DD` in the existing `openaero_best` store; the picker shows the grade and
  "Done today" once flown. Entries older than 14 days are pruned on read so storage stays small.
- Honest label: "Scenario wind (same for everyone today)", never "live".

## Acceptance criteria
- [ ] `dailyChallenge('2026-11-18')` is deterministic and identical across 1,000 repeat calls; across 365 consecutive dates
      every runway chosen exists in `airports.js` and no result has a tailwind or crosswind above 15 kt
- [ ] The date used is the Dallas date: 2026-11-18T05:30Z and 2026-11-18T06:30Z give the same day in winter, and a test pins the
      midnight rollover at both the CST and CDT offsets
- [ ] Flying it grades and stores a best under the daily key; the picker row reads "Done today" afterwards and the key is pruned after 14 days
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse; the picker row is >= 44 px tall
- [ ] No new network call, host, or dependency; boot chunk stays under its budget (lazy-load `daily.js` with the picker if needed)

## Test plan
`tests/unit/daily.test.js` (determinism, bounds, Dallas-date rollover at both offsets, prune). One e2e: open the picker, assert the
Today row exists, start it, assert the mission's runway/wind match `dailyChallenge()` for the page's date.

## Out of scope
Leaderboards, share cards, streak badges, any server.
