---
id: 0110
title: Keep it on the runway in a crosswind: a nose wheel that out-steers the fin, assists that hold the centreline, a touch rudder
status: shipped
priority: P1
size: L
lens: player-feel
created: 2026-10-29
pr: 120
---

## Why
0106 (draft PR #117) lets the METAR wind reach the runway. Its validation panel found that
once it does, nothing keeps the airplane on the runway. Today this is hidden only because
`updateWind` fades the wind to zero on the wheels. Headless probes on #117, hands off, full
power:
- A 737 in a 2 kt crosswind is 37 m off the centreline at Vr (35C is 23 m half-width). In
  10 kt the C172 is 30 m off in 17 s and the 737 in 13 s.
- Learner's auto-coordination rudder (`assists.js shapeControls`, `rud = betaDeg * 0.1`) goes
  to the nose wheel on the ground and steers *into* the wind: the C172 yaws 88° in 7.5 s.
- A crosswind landing rollout ends in the grass, and the grade can't see it (scored at
  touchdown).
- Touch has no rudder at all (`input.js combineTargets`: yaw only from Q/E or a gamepad), so
  a phone player can't correct.

Root cause in the physics: `flightModel.js` scales the yaw moments by `airspeed / 120`, not
dynamic pressure, so at taxi and roll speeds the fin's sideslip moment is far too strong. The
nose wheel's pull is a fixed 6/s blend toward its steered rate (`noseSteerYawRate`), which
the fin beats. A real loaded nose tyre corners far more stiffly than a fin at 20 kt.

## What
1. Nose wheel vs fin: while the nose tyre carries load, it holds its steered yaw rate
   firmly and lets go as the nose lifts at rotation. Scaling the ground yaw moments with q
   (V²) is another option. Keep the existing pedal-steering card
   (`gear.test.js`, full rudder at 10 kt = v·tan 7°/wheelbase).
2. Assists on the ground: Kid and Learner hold the runway centreline/heading with the
   nose wheel/rudder when the player isn't using the rudder. No beta-cancelling rudder
   while the nose wheel is on the runway.
3. Touch: a way for a phone player on Pilot to steer on the runway (a rudder strip or
   nose-wheel tiller). It must fit the deck without hiding the stick, tapes or wind box
   (lesson 2026-10-29).
4. Then land 0106 (PR #117: log-law wind at the CG, static tyre friction when parked).

## Acceptance criteria
- [ ] Headless, with the 0106 wind: Kid and Learner take off and roll out in a 10 kt direct
      crosswind within the runway half-width, C172 and 737, hands off
- [ ] Pilot, pedals neutral, 5 kt crosswind: heading drift on the roll < 3° to Vr
- [ ] The C172 15 kt crosswind cards (POH) and the 737 pedal-steering card stay green
- [ ] A touch player can steer on the runway at 390x844 and 844x390; mobile.spec and
      phone-landscape.spec keep their slots
- [ ] e2e airports.spec and bounce.spec green with 0106's wind (both failed on #117)

## Test plan
Flight cards in tests/flight/gear.test.js and c172.test.js flying the game's wind
(`surfaceWindFactor` from #117). An assists unit test for the ground hold. A touch e2e for the
steering control.

## Out of scope
Taxiing between runways, differential braking, tailwheel aircraft.
