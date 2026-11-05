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
rolls at 45, 60 and 73°/s at 60, 90 and 110 KIAS, so ours is −38% at 90 KIAS against that
estimate (no flown C172 roll rate is cited yet; look for one before tuning to it). The F-16's
flight control computer commands up to 308°/s (NASA TP-1538 App. A, p. 34), ten times what
the model gives. A trainer that rolls the same lazy rate at every speed, and a fighter
that rolls like a trainer, both feel wrong to anyone who has flown one.

## What
- `src/flightModel.js` roll law: the whole bracket is already multiplied by V/120, so the damping
  is already ∝ V; only the aileron term is missing a V (it should go as q ∝ ρV², the damping as
  ρV: neither has density today). Don't double-scale the damping. Per airframe from cited derivatives where we have them (C172: Roskam via public/jsbsim/;
  F-16: TP-1538 Table III's Clp and ΔCl,δa as transcribed in Stevens & Lewis, Aircraft Control
  and Simulation, App. A, non-dimensionalised on TP-1538 Table I's 30 ft reference span, not
  aircraft.js's 10.0 m: ~9% apart). The 737 has no open source: keep its current
  rate (17.8°/s, logged in tests/flight/b738.test.js) at its approach speed until one is found.
- The F-16: a roll-rate command (like `src/fbw.js` for pitch, lazy): stick → commanded p up
  to 308°/s at full deflection, limited by what the airframe can make at low q.
- Retune `src/assists.js` and `src/autopilot.js` bank laws (their gains were set against the old
  constant rate, and `aileronForBank`'s 0.05/deg and 0.8 per rad/s are shared by every airframe;
  with a roll-rate command the F-16's aileronInput means a commanded rate). Kid and Learner's
  over-cap rollback (`assists.js`, full opposite stick) becomes a snap at 308°/s: rate-limit it.
- Stiffness: with authority ×10 a bank hold goes unstable at the game's slowest sub-step. The
  game's sub-steps run 1/180 s at 60 fps and stretch to 1/60 s at 20 fps on a slow phone
  (main.js step6DofPhysics). A panel emulation (F-16 authority ×10, aileron ∝ q, aileronForBank
  holding 30°) limit-cycles at 600 KIAS / 2,000 ft at 1/60 s: 118 roll-rate sign flips in 2 s, the
  bank stuck at 26.4°. It is clean at 1/120 s. Scale the bank-hold gains by 1/(authority·V), or cap
  the law's k·dt < 1 at 1/60 s. Add a dt option to harness.js `fly()` so the cards can fly 1/60 s.
- Frame budget (invariant 4): the roll-rate command follows fbw.js's pattern (module-level scratch,
  no allocation per sub-step).
- Keep touch and keyboard flyable: the touch stick (input.js stickFromPoint, linear) and the
  keyboard's ±1 roll get a shaped curve (expo or a rate ramp).

## Acceptance criteria
- [ ] `tests/flight/c172.test.js` "KNOWN GAP (0156)" roll card promoted to `it` (±25% of JSBSim at 90 KIAS), plus cards at 60 and 110 KIAS
- [ ] `tests/flight/f16.test.js` "KNOWN GAP (0156)" roll card promoted to `it`, re-banded one-sided around the command
  ceiling (≥ 260°/s and ≤ 315°/s at 350 KIAS) and started from a bank large enough (e.g. a 360° roll, the steady
  part measured) that a realistic 0.3-0.4 s roll-in can pass; plus an approach card (~150 KIAS, gear down) at a
  markedly lower rate
- [ ] In Pilot on a 390x844 touch screen, a half stick in the F-16 rolls no faster than ~90°/s, and a 0.2 s tap of
  A/D banks it less than ~30°
- [ ] In Kid and Learner the F-16 and the Cessna never overshoot the bank cap by more than 3° or wobble at it,
  flown at 390x844 touch and under the devices project's 4x CPU throttle; a flight card shows Kid's hands-off
  F-16 final holds its bank without oscillation
- [ ] The roll law and every bank hold (assists, autopilot) flown headless at 1/60 s sub-steps across the F-16
  envelope, high q included (600 KIAS at 2,000 ft): no limit cycle, the bank held within 1°
- [ ] Touch checked on every `devices` project size (iPhone and iPad both ways, the iPad held sideways at 1180 px,
  Pixel 8) under the 4x CPU throttle; frame time inside the docs/PERF.md budget
- [ ] When the gap cards are promoted, their pilot and sample checks stay plain `it` cards; the F-16's window is
  wide enough at 308°/s (e.g. ±40° or from 90°+ of bank) to average more than 30 samples
- [ ] Every other card in tests/flight green (turns, Kid final, pattern, crosswind, dead stick)
- [ ] Kid and Learner still hold their bank limits on a hands-off final at 390x844 touch and 1280x720

## Test plan
The two promoted cards, new speed-sweep cards for the C172, and the existing flight cards
as regression guards. An e2e that a full touch stick in the F-16 rolls faster than in the Cessna.

## Out of scope
Adverse yaw, the roll-in time constant as a carded number, the 737's roll card (no source yet).
