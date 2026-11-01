---
id: 0019
title: Replay your last landing from the tower and chase cameras
status: shipped
priority: P2
size: M
lens: player-feel
created: 2026-10-16
pr:
---

## Why
After a grade, players want to see what happened: was it the flare, the drift, the float?
A short replay makes the grade understandable and the S-grade landing shareable to watch.

## What
Record the last 30 s of `{pos, quat, throttle, gear, flaps}` at 20 Hz into a preallocated
ring buffer (no per-frame allocation). "REPLAY" on the results card plays it back with the
physics paused, cycling chase → tower → wing cameras; any input exits.

## Acceptance criteria
- [ ] Unit test: the ring buffer keeps exactly the last N samples and never allocates after construction
- [ ] e2e: after a graded landing, REPLAY plays (aircraft position changes while `paused`) and returns to the card
- [ ] Frame time unchanged within the perf guard

## Test plan
Vitest for the ring buffer; Playwright drives the flare challenge then REPLAY.

## Out of scope
Exporting video.
