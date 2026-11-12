---
id: 0173
title: The coached 737 takeoff lifts off 3–4 s after Vr, as the FCTM says
status: proposed
priority: P2
size: S
lens: player-feel
created: 2026-11-11
pr:
---

## Why
Found by 0070's physics panel. The takeoff coach tells the 737 to rotate to 8° and hold
(src/takeoffCoach.js ROTATE_PITCH_DEG). At flaps 5 the model lifts off at ~8.3° on a continuous
2–3°/s rotation (tests/flight/b738.test.js, 3.8 s), but held at 8° it sits on the runway until
the speed builds: lift-off 4.7 s after Vr at ~167 kt (tests/flight/takeoffCoach.test.js,
`KNOWN GAP (0173)`). The FCTM (quoted in AAIB 6/2019) says 3–4 s. 9° would fix the time but leaves
only 2° to the 11° tail strike, under the coach's 3° margin.

## What
Coach the rotation the way the FCTM flies it (a continuous rotation towards ~15° with the
lift-off at 8–9°, the tail call still in front of the tail), or another cited technique, so a player
who follows the words lifts off in 3–4 s and never meets the tail.

## Acceptance criteria
- [ ] The 0173 card passes and is promoted to `it`
- [ ] The coach's tail-margin and "never says slow or ease" cards stay green
- [ ] Works at 390x844 touch and 1280x720 keyboard

## Test plan
tests/flight/takeoffCoach.test.js, tests/unit/takeoffCoach.test.js, tests/e2e/takeoffCoach.spec.js.

## Out of scope
Changing the flaps 5 lift fit (0070).

## Builder findings (2026-11-12, not shipped; back to proposed)
Tried the FCTM's way: the 737's coach says "Rotate: nose up smoothly toward 15°" / "Keep it coming toward
15°: it lifts off near 8°", and the tail call ("ease the nose") reads the climb's geometry once the wheels
leave (strike attitude 11° + asin(h / R), R = 0.51 m / sin(11.0° − 8.2°) = 10.4 m from the FCTM figures that
ATSB AO-2018-011 is quoted as giving: 8.2° lift-off at flaps 5, 51 cm tail clearance, contact at 11.0° on
extended struts. atsb.gov.au refused this sandbox, so those three numbers are from search summaries, not
the report read here). Flown headless (tests/flight/takeoffCoach.test.js's coached pilot, flaps 5, the
takeoff trim, the stick's 10/s lag, the coach fed the pitch rate as main.js does):

| Rotation (ramp, lag pre-added) | Lift-off after Vr | Attitude | Peak q | Closest to the tail call (no lead) | Coach said "ease"? |
|---|---|---|---|---|---|
| 2.0°/s | 4.6 s | 7.9° | 2.65°/s | 1.19° | no |
| 2.5°/s | 3.9 s | 8.3° | 3.15°/s | 0.55° | **yes** |
| 3.0°/s | 3.4 s | 8.6° | 3.65°/s | 0.01° | **yes** |
| 3.0°/s ramp chased from Vr (b738.test.js's pilot) | 3.7 s | 8.5° | ~3.7°/s | 0.21° | **yes** |

So in this model a rotation quick enough to lift off in 3–4 s brings the tail within the call's 1° margin
(≈ 18 cm at R) and its 0.5 s look-ahead in the second after lift-off: for ~0.4 s the wheels stay within
0.2 ft of the runway while the nose keeps coming up at 3+°/s (q overshoots the commanded rate by ~0.6°/s at
unstick). A slower rotation that never draws the call lifts off in 4.6 s, outside the FCTM's window. Shipping
the new words would have the coach tell a player who follows them to "ease the nose", so nothing shipped.

Ways forward (Scout / operator to choose):
- A source for the 737-800's tail geometry read in full (Boeing D6-58325-6 airport-planning document, or the
  FCTM's tail-clearance table: is its 51 cm the minimum over the whole rotation, as Boeing's tables usually are,
  or at the lift-off attitude on the runway? If it is the minimum over the rotation, the model's ~28 cm at
  2.5°/s is a model gap in the climb-away after unstick, not a coach problem).
- A better look-ahead for the call: it projects the wheel height with the current climb rate, which is ~0 at
  unstick and rising fast; at 2.5°/s the real path never enters the margin (0.55° of room), so a predictor using
  the vertical acceleration would not call. That changes a safety call and needs the physics panel's agreement.
- Or the 0.5 s lead / 1° margin reviewed against a cited tail-strike training figure.
