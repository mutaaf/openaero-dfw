---
id: 0156
title: The roll rate follows the airspeed (aileron ∝ q, damping ∝ V); the F-16 gets its 308°/s roll-rate command
status: proposed
priority: P1
size: L
lens: authenticity
created: 2026-11-05
pr:
---

## Why
0153 carded the roll rate and found two KNOWN GAPs. In `src/flightModel.js` the roll
acceleration is `(−δa·rollAuthority − p·rollDamping)·(V/120)`, so the steady rate is
`rollAuthority / rollDamping` at every airspeed: the Cessna rolls 37°/s whether it is at
60 or 110 KIAS, and the F-16 31°/s at 350 KIAS. In a real airplane the aileron's moment grows
with dynamic pressure (∝ V²) and the roll damping with V (Clp·pb/2V), so the steady rate
is p = Clδa·δa/(−Clp)·2V/b and grows with speed. Our JSBSim C172 (Roskam's derivatives)
rolls at 45, 60 and 73°/s at 60, 90 and 110 KIAS, so ours is −38% at 90 KIAS. The F-16's
flight control computer commands up to 308°/s (NASA TP-1538 App. A, p. 34), ten times what
the model gives. A trainer that rolls the same lazy rate at every speed, and a fighter
that rolls like a trainer, both feel wrong to anyone who has flown one.

## What
- `src/flightModel.js` roll law: the aileron term scales with q (or V²) and the damping with V,
  per airframe from cited derivatives where we have them (C172: Roskam via public/jsbsim/;
  F-16: TP-1538 Table III's Clp and ΔCl,δa). The 737 has no open source: keep its current
  rate (17.8°/s, logged in tests/flight/b738.test.js) at its approach speed until one is found.
- The F-16: a roll-rate command (like `src/fbw.js` for pitch, lazy): stick → commanded p up
  to 308°/s at full deflection, limited by what the airframe can make at low q.
- Retune `src/assists.js` and `src/autopilot.js` bank laws if the new rates make them
  overshoot (their gains were set against the old constant rate): Kid and Learner must still
  hold their bank envelope and line up hands-off.

## Acceptance criteria
- [ ] `tests/flight/c172.test.js` "KNOWN GAP (0156)" roll card promoted to `it` (±25% of JSBSim at 90 KIAS), plus cards at 60 and 110 KIAS
- [ ] `tests/flight/f16.test.js` "KNOWN GAP (0156)" roll card promoted to `it` (308°/s ±25% at 350 KIAS)
- [ ] Every other card in tests/flight green (turns, Kid final, pattern, crosswind, dead stick)
- [ ] Kid and Learner still hold their bank limits on a hands-off final at 390x844 touch and 1280x720

## Test plan
The two promoted cards, new speed-sweep cards for the C172, and the existing flight cards
as regression guards. An e2e that a full touch stick in the F-16 rolls faster than in the Cessna.

## Out of scope
Adverse yaw, the roll-in time constant as a carded number, the 737's roll card (no source yet).
