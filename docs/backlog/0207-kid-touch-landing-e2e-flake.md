---
id: 0207
title: Stop the Kid touch-only landing e2e timing out on its first try
status: ready
priority: P2
size: S
lens: tech-health
created: 2026-11-18
pr:
---

## Why
LESSONS (2026-11-17, 0193) names assists.spec's Kid touch-only landing as "the biggest flaky cost left": its first try ran 205 s,
timed out, and passed on retry (about 4 worker-minutes lost per occurrence, in a suite that sat 5 minutes from CI's 30-minute
limit before 0193). Since then 0195 (turbulence) made single-frame thresholds coin flips (LESSONS 2026-11-18), so a slow, flaky
landing spec is likelier to turn main red.

## What
Measure first: run `tests/e2e/assists.spec.js` for that test 8 times (`--repeat-each 8`, `CI=1`, 2 workers) and record each
duration and failure. Find what the 205 s try waited on (a real-time wait the sim warp does not cover, a touch-drag loop that
never converges, a condition polled at 1x). Fix the wait, not the assertion: use the sim's warp, a condition poll, or a bounded
retry of the touch input. Every assertion in the test stays.

## Acceptance criteria
- [ ] PR table: 8 before and 8 after durations of that test, worst case under 90 s, zero timeouts
- [ ] Assertion count in the file is unchanged (`grep -c expect`) and no `test.slow()`, retries bump or timeout increase is added
- [ ] Full e2e still passes with no retries on that file

## Test plan
The e2e file itself, repeated as above.

## Out of scope
Sharding the CI workflow (frozen: `.github/workflows/`), changing the Kid assist's physics.
