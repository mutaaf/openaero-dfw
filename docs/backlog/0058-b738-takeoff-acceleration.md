---
id: 0058
title: The 737 takes off in Boeing's field length (find why the roll is ~20% long)
status: ready
priority: P1
size: M
lens: authenticity
created: 2026-10-20
pr:
---

## Why
Boeing's ACAP (D6-58325-7 Rev C, §3.3.25) gives a 4,600 ft takeoff field length for a
65 t 737-800 at sea level, standard day. By 14 CFR 25.113 that is at least 1.15 × the
all-engines distance to 35 ft, so the airplane must reach 35 ft in ≤ 4,000 ft. Our model
needs ~4,710 ft (ground roll ~3,900 ft; lift-off ~151–158 kt; acceleration averages
~0.25 g), so 1.15 × that is ~5,420 ft. The card in `tests/flight/b738.test.js` is an
`it.fails` (0058). A pilot notices a 737 that needs ~4,710 ft to 35 ft, not ≤ 4,000 ft.
Candidates, on equal terms: the turbofan thrust lapse, rolling and ground-run drag, and the
rotation speed (one `vrKts` 142 for every flap; the model lifts off at 151–158 kt).

## What
Find the cause before changing anything: compare the model's thrust vs speed at sea level
(`engine.js` turbofan `machLapse` [0.9, 0.6], ~18% loss by M0.23) with published CFM56-7B
takeoff thrust lapse, and check rolling friction, ground-run drag (flaps, gear, AoA on the
roll) and the Vr / rotation the harness flies (`vrKts` 142). Fix the data with a cited
source, not a fudge factor; keep the approach-thrust and climb behaviour.

## Acceptance criteria
- [ ] The 0058 card in `tests/flight/b738.test.js` is promoted from `it.fails` to `it`
- [ ] Every other 737 card and the e2e takeoff / autoland specs stay green
- [ ] The source for any changed thrust number, or Vr per flap setting, is quoted next to it

## Test plan
`npm test -- tests/flight`; e2e flight spec (takeoff, 737).

## Out of scope
Engine-out continued takeoff, accelerate-stop, flap-optimisation.
