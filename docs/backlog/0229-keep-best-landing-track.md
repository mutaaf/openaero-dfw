---
id: 0229
title: Keep the track of your best landing per mission (a compact stored path, the ghost's data)
status: ready
priority: P1
size: S
lens: player-feel
created: 2026-11-27
pr:
---

## Why
A personal best today is a number and a letter (`openaero_best`: score, grade, at). To beat it
you have to remember how you flew it. The replay (0019) is in memory only and gone on reload.
Storing the best landing's final approach as a few hundred bytes lets a later ticket (0230) draw
it as a ghost to chase. Pillar 4: a game worth replaying. This ticket is data only, so it ships
and tests alone.

## What
- New pure module `src/bestTrack.js`: `packTrack(replayBuf, runwayFrame)` takes the replay
  buffer's samples (replay.js, `REPLAY_STRIDE`) for the last 30 s before touchdown and returns
  `{ v: 1, dt, pts: [[x, y, z]...] }`: runway-relative metres (x across, y up, z along) rounded to
  1 m, at most 1 sample/s plus the touchdown point, total under 1.5 kB of JSON.
- `landing.js` writes it under a new key `openaero_besttrack_v1 = { v: 1, tracks: { <missionKey>: pack } }`
  only when the landing sets a new personal best for that key (same key rule as `openaero_best`,
  `@kid` / `@learner` suffixes included). Never written for crashes, drills with their own track
  plot, or a track shorter than 5 s. Reads and writes in try/catch; a quota error drops the track
  and leaves the best's score untouched.
- Prune: keep at most 40 mission keys (oldest `at` out). `openaero_best` format unchanged (AGENTS.md
  invariant 6).

## Acceptance criteria
- [ ] A new best on 35C autoland stores a pack under its key; a worse landing leaves it alone
- [ ] Pack JSON is under 1.5 kB and decodes to metres within 1 m of the replay samples
- [ ] A crash, a track under 5 s, a drill card: nothing stored
- [ ] A full or blocked localStorage never breaks the results card or the best score
- [ ] Boot JS within the budget (the module is imported lazily with the results card)

## Test plan
Unit `tests/unit/bestTrack.test.js`: pack/unpack round trip, size bound, prune at 41 keys, quota
throw swallowed. e2e in `landing.spec.js`: land twice (worse then better) and read the key through
`?debug`.

## Out of scope
Drawing the ghost (0230). Sharing or exporting tracks. Any server.
