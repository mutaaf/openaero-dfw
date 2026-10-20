---
id: 0058
title: The 737 takes off in Boeing's field length (find why it needs ~6% too much runway)
status: shipped
priority: P1
size: M
lens: authenticity
created: 2026-10-20
pr: 57
---

## Why
Boeing's ACAP (D6-58325-7 Rev C, §3.3.29, non-winglet, no short field package) gives a
5,100 ft takeoff field length for a 65 t 737-800 at sea level, standard day (winglets only
improve it; the short-field-package chart §3.3.25 says 4,600). By 14 CFR 25.113 that is at
least 1.15 × the all-engines distance to 35 ft, so the airplane must reach 35 ft in ≤ 4,435
ft. Our model needs ~4,710 ft (ground roll ~3,900 ft; lift-off ~151–158 kt), so 1.15 × that
is ~5,420 ft, about 6% over. The card in `tests/flight/b738.test.js` is an
`it.fails` (0058). A pilot notices a 737 that needs ~4,710 ft to 35 ft, not ≤ 4,435 ft.
Candidates, on equal terms: the turbofan thrust lapse, rolling and ground-run drag, and the
rotation speed (one `vrKts` 142 for every flap) and the lift-off overspeed: the harness
caps ground pitch at 10° (tailstrike 11°) and the model lifts off 9–16 kt after Vr.

Since 0057 (#55) the game's 737 notches are flaps 0/10/30/40, so the card flies flaps 10,
the only takeoff notch left: 4,799 ft to 35 ft, × 1.15 = 5,519 ft (8% over; flaps 25 had
given 4,714 ft). A flaps 5 or 15 takeoff notch is a fair candidate fix if the data support it.
Also from the 0057 panel: flaps 10 (ΔCL 0.42, stall 14.8°) now stalls at 124 kt against flaps
30's 122 kt at 65 t, only ~2 kt apart where the real airplane's speeds differ by ~10 kt, and
Vr 142 is 1.14 × that stall speed: refit flaps 10 with the takeoff data.

## What
Find the cause before changing anything: compare the model's thrust vs speed at sea level
(`engine.js` turbofan `machLapse` [0.9, 0.6], ~18% loss by M0.23) with published CFM56-7B
takeoff thrust lapse, and check rolling friction, ground-run drag (flaps, gear, AoA on the
roll) and the Vr / rotation the harness flies (`vrKts` 142). Fix the data with a cited
source, not a fudge factor; keep the approach-thrust and climb behaviour.

## Acceptance criteria
- [x] The 0058 card in `tests/flight/b738.test.js` is promoted from `it.fails` to `it`
- [x] Every other 737 card and the e2e takeoff / autoland specs stay green
- [x] The source for any changed thrust number, or Vr per flap setting, is quoted next to it

## Test plan
`npm test -- tests/flight`; e2e flight spec (takeoff, 737).

## Out of scope
Engine-out continued takeoff, accelerate-stop, flap-optimisation.

## Outcome (2026-10-20)
Cause: Vr, not thrust or friction. Probed headless (65 t, flaps 10): at Vr 142 the test pilot's
2.5°/s command reached only ~2.0°/s, and the airplane lifted off at 7.0° pitch and 157 kt, 15 kt
after Vr: held on the runway past the speed its wing flies at a normal attitude. Line crews
lift off at 8–9° (NTSB, AA 737-800 LAX 2011, quoting the operator's manual; ATSB AO-2018-011:
8° at flaps 5) after an average ~2.2–2.4°/s rotation (ATSB 200500382, AO-2018-011).
- The harness pilot now commands 3°/s (FCTM top end) and averages 2.38°/s, as crews do.
- `vrKts` 142 → 132 (flaps 10, 65 t; the model's Vr, fitted to its lift curve, not a published one): lift-off at 8.4°, 149 kt; 4,245 ft to 35 ft, × 1.15 =
  4,882 ft ≤ 5,100. Engine failed at Vr: 146 kt at 35 ft ≥ V2 = 1.13 Vs = 140 kt (14 CFR 25.107),
  4,435 ft to 35 ft (25.113(a)(1)).
- Not changed: thrust lapse (Bartel & Young 2008, fitted to the CFM56-7B, gives ~20% loss by
  M0.23, slightly more than the model's 18%, so thrust is not short); rolling μ 0.03 (0.02 would
  save ~80 ft; left alone without a 737-specific source).
- Not done (0062): the panel notes lift-off is 17 kt after Vr (real: Vr + 5–10) and Vr is
  1.06 Vs; real flaps 5–10 Vr at 65 t is reported nearer 136–142. No public 737 takeoff
  V-speed table was found to refit flaps 10 against. `vrKts` isn't read by the game yet.
