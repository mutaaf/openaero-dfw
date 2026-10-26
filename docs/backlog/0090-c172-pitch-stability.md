---
id: 0090
title: Static pitch stability in flightModel.js: a released stick lets the nose find its trim
status: shipped
priority: P1
size: M
lens: authenticity
created: 2026-10-24
pr: 96
---

## Why
Found building the stall drill (0087). flightModel.js has no pitching moment from the angle
of attack: its pitch rate is the elevator against damping (`qRate` in `src/flightModel.js`),
so a neutral stick holds whatever attitude the airplane has. Released at the stall, the
Cessna keeps its nose at 10.5° and sinks deeper into the stall (α 26° after 7 s), where a real
172 (and JSBSim flying our `public/jsbsim/` C172 with Roskam's Cmα −0.89) drops its nose and
flies again in about a second. In the game a Pilot who lets go after a stall holds a −22°
dive to 150 kt, and an over-pull can lock at α 90°, falling flat. Kid and Learner never see
it (their assists hold pitch), Pilot does every flight: there is no trim either, so a neutral
stick is never "trimmed".

## What
Add a static stability term (Cmα, about a trim angle of attack per airframe and flap notch)
and its elevator balance to the pitch axis in `src/flightModel.js`, with an elevator trim
the assists and autopilot already imply (their pitch holds), so a neutral stick flies the
trimmed speed. Check every pitch control law that assumed the axis had no stiffness
(`autopilot.js` elevatorForPitch, `assists.js`, the harness pilots), per the 0081 lesson.

## Acceptance criteria
- [x] `tests/flight/c172.test.js` "released at the stall, the nose drops by itself" passes on flightModel.js (promote it from `it.fails`)
- [x] No other flight card regresses (C172, 737, F-16)
- [x] Hands off in level flight, the airplane holds its trimmed speed within a phugoid, not an attitude
- [x] Works at 390x844 touch and 1280x720 keyboard; no frame-time regression

## Test plan
The `release` card above; a trimmed hands-off card (speed returns after a 10 kt upset); every
existing card green.

## Out of scope
Spins, a trim wheel in the HUD (a keyboard trim key may come with it), JSBSim (it has Cmα).

## Shipped
`src/flightModel.js` pulls the nose back to the trimmed angle of attack: the stiffness is the
pitch authority over `spec.elevatorAlphaDeg` (Cmδe·δe / Cmα: Roskam's C172 −1.28/−0.89 at the
25.5° mean throw, 36.7°; JSBSim's generic 737 −1.2/−0.6 at 0.3 rad, 34.4°), so a neutral stick
flies the trim and the stick moves α by the source's balance. The short period is as soft as
the model's elevator (~0.8 rad/s at 50 KIAS, about a third of the 2.2 rad/s Roskam's Cmα and
the C172's Iyy give): closing that needs a stronger elevator, and every pitch law retuned. Trim: spawns set it (final/drill: the spawn's
trim α; takeoff: 1.2 Vr flaps 1; tours: their speed); the assists, a pitch-holding autopilot
and the harness pilots trim as they fly (`autoTrim`), and the F-16 (`pitchFbw`) self-trims
as before. Cards: release at the stall flies again in ≤ 2 s (promoted from `it.fails`), hands
off after a 10 kt upset at 70/90/110 KIAS the speed is back within 2 kt in a damped phugoid;
e2e: push and let go in Pilot (keyboard, touch) and the nose comes back up.
