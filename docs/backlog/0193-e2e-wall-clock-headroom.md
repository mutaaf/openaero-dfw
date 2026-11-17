---
id: 0193
title: Win back e2e wall-clock: CI is within 5 minutes of its 30-minute limit
status: ready
priority: P1
size: M
lens: tech-health
created: 2026-11-17
pr:
---

## Why
LESSONS (2026-11-13): the e2e suite outgrew CI's 30 min limit once (cancelled at 29.7 min, 318/321 green); a
default-resolution cut bought a couple of minutes (24.5 min full run). Each new spec costs 10-50 s, and the Builder
adds a lesson a day, so the next cancellation is days away and a cancelled main run blocks every agent. The proper
fix (sharding in `.github/workflows/ci.yml`) is frozen and needs the operator; this ticket buys headroom without it.

## What
Measure first: run the e2e with `--reporter=json` and rank spec files by wall-clock on a fixed 2-worker `CI=1` run.
Then, only where it changes no assertion: let specs that each cold-boot the page for one check share a `test.describe`
with one booted page (`beforeAll` + serial) or a `test.step` chain; replace fixed `waitForTimeout` sleeps with the
condition they wait for; use the sim's warp for any flight that waits in real time. Every assertion stays.

## Acceptance criteria
- [ ] A table (in the PR) of the 10 slowest spec files before/after, with the full-suite time on the same machine
- [ ] Full suite is >= 3 minutes faster than the baseline measured the same way, with the same number of `expect` calls (count printed before/after)
- [ ] No test or gate skipped, weakened or deleted (common.md hard rule)
- [ ] A one-line note in `docs/LESSONS.md` with the baseline and the new time, so the next run can see the headroom

## Test plan
The e2e suite itself; compare the JSON reports' pass counts (identical) and assertion counts.

## Out of scope
`ci.yml` (frozen: if more is needed, say so in a `proposal/` PR: shard the e2e into 2-3 jobs).
