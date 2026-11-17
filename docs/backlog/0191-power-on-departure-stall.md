---
id: 0191
title: Power-on (departure) stall mission: full power, nose up, recover without losing the wing
status: ready
priority: P1
size: M
lens: content
created: 2026-11-17
pr:
---

## Why
The only stall mission is the power-IDLE recovery (0087, `c172_stall_recovery`). The FAA's private-pilot test
standard asks for both an approach-to-landing stall (power off) and a power-on one: the departure stall, the
one that kills people after takeoff when the nose is held up to "clear the trees". A first-timer who has only
met the gentle idle stall never sees the Cessna's real behaviour with full power: the nose goes much higher,
the torque and slipstream roll and yaw it, and the wing can drop. Reference: FAA-S-ACS-6C (Private Pilot
Airplane ACS) Area VII, stalls, https://www.faa.gov/training_testing/testing/acs/private_airplane_acs_6.pdf and
the Airplane Flying Handbook (FAA-H-8083-3C) ch. 5 "Power-on stalls" (https://www.faa.gov/regulationspolicies/handbooksmanuals/aviation/airplane_handbook).
Web search only returned summaries of the ACS wording: read the PDF's task and its tolerances before writing the
grade, and cite the page in the card comments.

## What
New lazy drill chunk `src/powerOnStall.js` shaped like `src/stallDrill.js` (pure state machine, grade, coach words
through `s.ds`, `DRILL_TEXT`/`RANK`), mission `c172_power_on_stall` in the Drills group: the Cessna at ~4,500 ft AGL
over Grapevine Lake, flaps 10 (a takeoff setting), slowed to Vr-ish, full power. The coach says: full power, raise
the nose to ~20° and hold it, the stall (horn, buffet, nose drop or wing drop), then nose down, wings level (rudder
for a dropped wing, ailerons after the stall breaks), flaps up, climb away. Graded on: the reaction, the height lost
and the heading change (a wing drop), the order (nose down before power is already in; wings), a secondary stall,
the bank at the break. Kid: the assists' recovery as in 0087 (`drillAssist`); Learner: protection off until the stall.

## Acceptance criteria
- [ ] Flown headless on both models, the card measures the Cessna's real behaviour (power on, flaps 10): the stall
      speed, the peak pitch, any roll/yaw at the break, and the grade is built on those numbers, not assumed ones
- [ ] The wrong technique grades lower (held stick: D; secondary stall: C; recovered with the nose still above 10°: B)
- [ ] The tolerances are the ACS's (read from the PDF), cited in the card comments
- [ ] Boot JS does not grow (lazy chunk; no new `import()` from boot; AGENTS.md invariant 4 + the budget lesson of 2026-11-16)
- [ ] Works at 390x844 touch and 1280x720 keyboard; the coach card text never overlaps the HUD

## Test plan
`tests/unit/powerOnStall.test.js` (state machine and grade), `tests/flight/powerOnStall.test.js` (scripted pilots:
correct, held stick, late power), one e2e that loads the mission and sees the first coach line.

## Out of scope
A spin model; cross-controlled stalls; the jets.
