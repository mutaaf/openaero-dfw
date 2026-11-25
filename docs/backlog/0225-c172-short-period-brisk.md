---
id: 0225
title: The Cessna's pitch rate to a held pull is half of JSBSim's Roskam C172
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-11-25
pr:
---

## Why
Validator card `tests/flight/shortPeriod.test.js`: a held -0.2 elevator step, stick-fixed, 1,500 m. Peak pitch rate flightModel.js
0.152 rad/s at 90 KIAS (0.144 at 75) against JSBSim's 0.293 (0.247); the peak comes at 0.78 s against 0.37 s. The game's Cessna
feels sluggish to a quick pull and has no short-period overshoot. JSBSim carries Roskam's derivatives (the repo's existing C172
comparator); there is no POH figure for it, so this is a comparison, not a published number.

## What
Tune pitch damping / pitchAuthority (aircraft.js, flightModel.js) so the step's peak pitch rate is within 30% of JSBSim's at 75 and
90 KIAS, without breaking the phugoid, Va, full-aft-at-Vr or trim cards.

## Acceptance criteria
- [ ] The two `KNOWN GAP (0225)` cards pass and are promoted to `it`
- [ ] Every other tests/flight card still passes unchanged

## Test plan
tests/flight/shortPeriod.test.js promoted.

## Out of scope
Other aircraft.
