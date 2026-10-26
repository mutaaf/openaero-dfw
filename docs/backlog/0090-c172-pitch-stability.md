---
id: 0090
title: Static pitch stability in flightModel.js: a released stick lets the nose find its trim
status: proposed
priority: P1
size: M
lens: authenticity
created: 2026-10-24
pr:
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
- [ ] `tests/flight/c172.test.js` "released at the stall, the nose drops by itself" passes on flightModel.js (promote it from `it.fails`)
- [ ] No other flight card regresses (C172, 737, F-16)
- [ ] Hands off in level flight, the airplane holds its trimmed speed within a phugoid, not an attitude
- [ ] Works at 390x844 touch and 1280x720 keyboard; no frame-time regression

## Test plan
The `release` card above; a trimmed hands-off card (speed returns after a 10 kt upset); every
existing card green.

## Out of scope
Spins, a trim wheel in the HUD (a keyboard trim key may come with it), JSBSim (it has Cmα).
