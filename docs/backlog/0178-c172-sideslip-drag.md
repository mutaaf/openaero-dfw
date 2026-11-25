---
id: 0178
title: The Cessna's forward slip loses height: flightModel.js gets drag due to sideslip (Roskam CDβ)
status: ready
priority: P2
size: S
lens: authenticity
created: 2026-11-12
pr:
---

## Why
Found by 0176's card (`tests/flight/c172.test.js`, "Cessna 172S forward slip"). The Airplane Flying
Handbook (FAA-H-8083-3C ch. 9, p. 9-13) says a forward slip "is used to dissipate altitude and increase
descent rate without increasing airspeed". In flightModel.js a full-rudder slip at 70 KIAS, idle, flaps up
(β 23°) sinks 943 fpm against the straight glide's 798 (+18%); the card asks for +30%. JSBSim, flying our
public/jsbsim C172 with Roskam's drag due to sideslip (CDβ 0.17·|β|), sinks 1,332 against 759 (+75%); that margin is all the CDβ line (with it at 0 the JSBSim slip sinks less than its glide), so it checks the coefficient rather than independent slip physics. flightModel.js
has no sideslip drag term at all (aero.js dragCoefficient reads only CL, gear, flaps, ground effect and
Mach), so a player who slips off extra height in the game (the 0177 mission) barely gets any.

The handbook also ties the slip's sink to its bank ("the steeper the bank, the steeper the descent"): the game holds
the track with only ~6° of bank at full rudder (JSBSim ~8°), so almost none of the sink can come from tilting the
lift. Drag is the missing piece, but check the bank is still credible after the fix.

## What
Add a per-airframe `cdBeta` to `src/aircraft.js` (the C172's Roskam 0.17, the same source and value as
public/jsbsim/aircraft/c172/c172.xml) and add `cdBeta·|β|` to the drag in flightModel.js (or aero.js
dragCoefficient, with β passed in). A probe of exactly that (not shipped) gave 1,427 fpm at 67.9 KIAS (+79% on the straight glide's 798 fpm at 70.1 KIAS; IAS within the card's 5 kt).
Leave the 737 and F-16 at 0 unless a cited value is found. Re-run the crosswind cards: the 15 kt
wing-low landing (and the slip-bank comparison with JSBSim) fly a ~12° slip and may move.

## Acceptance criteria
- [ ] 0176's flightModel.js `slipSink` card promoted from `it.fails` to `it`
- [ ] `cdBeta`'s source cited in `src/aircraft.js`
- [ ] Every other C172 card passes unchanged (crosswind takeoff/landing, sideslip vs JSBSim, glide 9:1, turns)

## Test plan
`npm test -- tests/flight/c172.test.js`; the full `tests/flight` for the other airframes.

## Out of scope
Pitot-static error in a slip (the AFH notes it); flaps-extended slip limits; the 737 and F-16.

## Builder findings (2026-11-18, not shipped; back to proposed)
Built exactly the ticket's change (`cdBeta: 0.17` on the C172, `cd += cdBeta·|β|` in flightModel.js after
dragCoefficient) and flew the whole `tests/flight` suite against main (733 passed, 19 expected fail on main).

**As the ticket asks (unclamped, ground and air, JSBSim's form):** the slip card passes (942 → 1,427 fpm at
67.9 KIAS, +79%; bank 5.6 → 7.0°, still credible next to JSBSim's 8.3°), but **9 other cards fail**. The big
ones come from the ground roll, where |β| is large at low speed (a 15 kt crosswind roll is ~20-50° of β until
~40 kt) and Roskam's small-angle derivative is extrapolated far past where it was fitted:
- 15 kt crosswind takeoff, lift-off 1,138 → 1,384 ft (+22%; JSBSim with the same term 1,275 ft). Calm to 50 ft
  barely moves (1,663 → 1,680 ft).
- The engine-out turn-back window in still air closes completely (main: made from 500 to 850 ft; now made
  at no height, the coach never allows the turn). The failure point moves ~320 m down the runway and 80 m
  sideways.

**Airborne only, |β| held at BETA_LIN (20°) like CYβ/Clβ** (`if (spec.cdBeta && !body.onGround) cd +=
spec.cdBeta·min(|β|, BETA_LIN)`): the slip card still passes (1,371 fpm at 68.2 KIAS, +72%). The takeoff and
turn-back window go back to main's values. **6 cards still fail.** Each is a coach or Kid outcome that the
slip drag really changes (the airplane flies with some residual β there):
| card | main | airborne CDβ |
|---|---|---|
| engineOut 45° gliding turn, k (1.35 ±0.05) | 1.341 | 1.412 (the card's pilot centres the ball with rudder = 0.1·β: β 2.5° in the turn; with rudder = 1·β, β 0.36°, k 1.394) |
| power-off 180 as coached (0-200 ft past) | +152 | +213 |
| power-off 180 160/10 (never short) | in window | −98 ft |
| Kid kads_16_final 10 kt from 250° / 15 kt from 070° (S 95) | S | A |
| pattern join, 10 kt from 340° (no "Slow") | no ptSlow | ptSlow |
| wing-low 15 kt (drift < 1 kt) | under 1 | 1.07 kt |

Why not shipped: closing these means re-centring the power-off 180 coach (FLOAT_M / TURN_FT), the engine-out
coach's k (EO_INDUCED, which moves the 700 ft mission's turn-back call), and Kid's crosswind grade. Those are
the same constants and calls that draft #277 (0183) re-centres while it waits on the operator's decisions.
Re-centring them here would change the numbers #277 was measured against.

**Suggested way forward (Scout / operator):**
1. Ship CDβ airborne only, held at 20°. Roskam's derivative is a small-β fit. The ground roll's broadside β
   is outside it, and the POH gives crosswind takeoffs no distance penalty. Write that limit down.
2. Do it after 0183 is decided, then re-centre the power-off 180 and engine-out coaches once, on both changes.
3. Decide whether the engine-out card's pilot should centre the ball properly (rudder = 1·β). A real pilot
   does, and it is the smaller re-measure of k (0.39).
