# Proposal: give CI's e2e room (operator: `.github/workflows/ci.yml` is frozen)

**Status:** needs the operator. Agents cannot change `.github/workflows/`.

## The problem

Main is red by timeout, not by a failing test. CI on `f3ad480` (run 40649240846, 2026-10-28):
unit 18 s, build 1 s, then **178 of 178 e2e passed in 29.2 min**, and the job was cancelled at
`timeout-minutes: 30` before it could report success. The same happened on `8a01a63` (#106),
`e244f0a` and twice on #104, whose phone-at-1x fix bought ~1.5 min and was eaten within a day.

Every PR runs the same job, so while this holds **no PR can go green and auto-merge**, docs-only
ones included (this one too).

Where the 29 min go (that run): desktop project 20.6 min on 2 workers, phone 5.6, perf 0.2,
devices 2.8. Already tried or measured (docs/LESSONS.md 2026-10-17 … 2026-10-27): half-resolution
desktop, 1x phone, 3 workers (starves SwiftShader, 5 flight specs time out), parallel device
sizes (no gain). The flight specs run in real sim time, so the suite grows with every feature.
Shortening flights in specs one by one changes what they test, and the boot budget (200.99 of
201 kB) leaves no room for a test-only time warp in `main.js`.

## Proposed change (pick one)

1. **Smallest:** in `.github/workflows/ci.yml`, `timeout-minutes: 30` → `45`. One line; buys
   ~15 min of headroom at no cost to the gate.
2. **Lasting:** shard the e2e across a matrix (e.g. `--shard=${{ matrix.shard }}/2` with
   `strategy.matrix.shard: [1, 2]`, unit + build + budget in each shard or in one leading job),
   so wall time halves and the gate keeps a fixed per-job budget. Branch protection's required
   check name would change to the matrix job names.

Option 1 now and option 2 when the suite reaches ~40 min is what this run recommends.
