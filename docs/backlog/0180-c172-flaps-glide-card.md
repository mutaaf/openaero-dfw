---
id: 0180
title: Cessna glide with full flaps is steeper than clean (flight card)
status: ready
priority: P2
size: S
lens: authenticity
created: 2026-11-12
pr:
---

## Why
The only glide card (`c172.test.js`, "glides about 9:1 at 68 KIAS") is flaps up. Every real
landing is flown with flaps, and the Handbook says extending flaps steepens the descent at the
same speed (FAA-H-8083-3C ch. 8/9, "Effect of flaps"; read the wording first). A model whose
flaps barely change the glide would make the PAPI and the coach's "high/low" calls too kind.
JSBSim's own C172 already glides 7.2:1 at 61 KIAS with flaps 30 (see the 0085 comment in the
test), so the headless data exists.

## What
Cards on flightModel.js and JSBSim: idle, trimmed, settled 20 s, glide ratio over 10 s at
the best-glide speed for flaps 0, 10 and 30 (POH speeds; 68 KIAS clean). Assert the ratio falls
monotonically with flaps and that flaps 30 loses at least 25% of the clean ratio at the same
speed. Measure first, bounds from the measurement, widen only with a reason; a miss is a KNOWN GAP
`it.fails` with a ticket. Settle the baseline before the window (LESSONS 2026-11-12).

## Acceptance criteria
- [ ] Monotonic glide-ratio card exists and passes, or is a named KNOWN GAP.
- [ ] A mutation (flap drag per notch to 0) fails it.
- [ ] check-gaps passes.

## Test plan
`npm test -- tests/flight/c172.test.js`; record measured ratios in the PR body.

## Out of scope
737 or F-16 flap glides; changing flap drag in this PR.
