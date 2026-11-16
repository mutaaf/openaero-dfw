---
id: 0177
title: "Too high" drill: slip the Cessna down to the numbers
status: proposed
priority: P2
size: M
lens: content
created: 2026-11-12
pr:
---

## Why
Every approach drill so far starts on the glidepath or low. Real students also meet the
other case: high over the fence with flaps and power already used. The forward slip is the
standard answer (FAA-H-8083-3C ch. 9; the ACS lists "forward slip to landing" for the
private certificate). The Cessna 172's own caution is to avoid slips with flaps extended
(placard on later 172s; check the 172S POH wording at
https://www.befa.org/wp-content/uploads/2019/12/POH-Cessna-172S.pdf before writing text),
so the drill teaches: slip with flaps up or 10, take the cross-control out before the flare.
Depends on 0176 proving the slip works.

## What
A Cessna mission at KDFW or Addison: spawn 1.5 NM out, 900 ft AGL (about 2x the 3° path),
flaps up, 75 KIAS, gear fixed. Coach text: "Too high: cross the controls to slip, nose
down to hold speed, straighten before you flare." Grade: touches down in the first third of
the runway, centred, no cross-control at touchdown (rudder and aileron within 20% of neutral
over the last 2 s), IAS at the threshold within VREF +10 kt. Results card says which part was missed.
Touches missions.js, results text, coach.js hint. No physics change.

## Acceptance criteria
- [ ] Appears in the picker for the Cessna; not on Kid's first-flight path.
- [ ] A scripted slip pilot passes; a scripted no-slip (flaps 30, idle) pilot lands long and fails with the "too high" message.
- [ ] Works at 390x844 touch and 1280x720 keyboard (rudder reachable on touch).
- [ ] Boot JS budget unchanged (lazy chunk).

## Test plan
tests/flight pilot scripts both ways; e2e picks the mission and asserts the start state and the results card.

## Out of scope
Slips with full flaps, side-slip crosswind landing (0069 covers the crosswind card).

## Back to proposed (Builder, 2026-11-16)
Measured on main (6bbd8e6) with `tests/flight/harness.js forwardSlip` (idle, speed held, flightModel.js):
| config | glide | full-rudder slip |
|---|---|---|
| flaps up, 70 KIAS | 786 fpm, ~6.3° | 929 fpm (+18%) |
| flaps 30, 65 KIAS | 983 fpm, ~8.5° | — |
| flaps 30, 61 KIAS | 902 fpm, ~8.3° | — |

Two blockers, neither code the Builder can write without a decision:
1. **The spawn is not too high.** 900 ft AGL at 1.5 NM is a 5.6° path; the Cessna's idle flaps-up glide is already
   steeper (6.3°), and flaps 30 idle (~8.5°) gets down with room to spare. The acceptance criterion "a no-slip
   (flaps 30, idle) pilot lands long" cannot pass. A start that needs the slip has to sit above the flaps-30 idle
   path (> ~8.5°: e.g. ~1,350+ ft AGL at 1.5 NM), or start with flaps 30 already out (which the POH caution argues
   against slipping with).
2. **The slip barely works yet.** flightModel.js has no drag due to sideslip, so a flaps-up slip (+18%, 7.5°) is
   *less* effective than just lowering flaps 30 (8.5°): a drill grading "slip, flaps up" as the answer would teach
   the wrong lesson in this sim. That is 0178 (CDβ, PR #256), held for the operator's call on touch-Pilot turns and
   Kid's crosswind grade. 0176's slip card is still a KNOWN GAP for the same reason.

Route: ship 0178 first, then the Scout re-specifies the spawn (height/distance and flap setting) against the measured
flaps-30 idle path, and promotes again.
