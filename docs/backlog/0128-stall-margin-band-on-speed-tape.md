---
id: 0128
title: A red low-speed band on the speed tape at the stall speed for the current flaps
status: ready
priority: P2
size: M
lens: player-feel
created: 2026-10-31
pr:
---

## Why
On the default final the tape shows only the target bug ("SPD 155") and the IAS box. A
Learner or Pilot slowing down has no picture of how close the wing is to stalling until the
stall horn or the buffet, which is late for someone who cannot feel the airplane (a phone
player has no seat). Airliner and glass-cockpit tapes draw the margin: a red or barber-pole
band that rises from the bottom to the stall speed, so the pilot sees it coming and
the "speed decay" is visible before it matters. The model already knows its stall AoA and
`aero.js` has `vrefFor` and the aircraft files carry Vref and CLmax, so the speed at 1 g
for the current flaps is computable without new data. FAA Pilot's Handbook of Aeronautical
Knowledge ch. 5 (stall speed changes with flap setting)
https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/phak and the FAA
Airplane Flying Handbook ch. 4 (stalls and the airspeed indicator's white arc, whose lower end
is Vs0) are the references; the C172's white arc and green arc starts (Vs0 and Vs1) are in
its POH Section 2.

## What
Add a pure `stallSpeedKts(aircraft, flapsDeg, weightN, rho)` in `src/aero.js`
(`0.5 * rho * V^2 * S * CLmax = W`, using the aircraft's CLmax for the notch, 1 g) and a
hudLayout.js helper that maps it to the tape's pixel span. Draw a red band from the tape's
bottom edge up to Vs, with 1.1 Vs as the top of an amber "caution" strip; hide it when Vs is
below the tape's range. Updates when flaps or gear change. Kid hides it (assist level).

## Acceptance criteria
- [ ] `stallSpeedKts` for the C172 flaps up and 30° matches the POH Section 2 Vs1 / Vs0 (within 3 kt) in a unit test, and for the 737 matches the model's own stall (the `it` cards in `tests/flight/b738.test.js`) at the same flaps and weight
- [ ] Lowering flaps lowers the stall speed, so the band shortens: asserted by value in the unit test, not by eye
- [ ] Drawn from the tape's bottom to the right pixel for the stall speed; hidden when the stall speed is below the tape's range
- [ ] Not shown for Kid
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse; no new per-frame allocations
- [ ] No frame-time regression (e2e perf probe within budget)

## Test plan
Unit: `stallSpeedKts` against POH Vs1/Vs0 and the 737's modelled stall; the pixel-mapping
helper at the span's edges. E2e: Pilot level, C172 at 55 kt flaps up shows the band (screenshot
pixel of the band's colour just under the box) and the Kid level does not.

## Out of scope
A stick shaker or a new stall warning (0079); load-factor-dependent stall speed (g); the F-16.
