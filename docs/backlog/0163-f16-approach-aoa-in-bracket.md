---
id: 0163
title: The F-16 flies its final on-speed, 13° AoA, as its HUD bracket asks
status: ready
priority: P1
size: M
lens: authenticity
created: 2026-11-06
pr:
---

## Why
Found by 0155's card (`tests/flight/f16.test.js`, "F-16C on-speed approach vs the HUD AoA bracket").
The F-16 flies a final by angle of attack: with the gear down its HUD bracket reads 11° at the top,
13° in the middle (on-speed) and 15° at the bottom (NASA/TM-2014-218514 §4.2 p. 19, quoting
T.O. GR1F-16CJ-1). On the game's own final (main.js: Vref + 5 = 153 KIAS, flapsIndex 2, gear down,
12 t) the model flies at ~6.1°, under the bracket. A pilot who knows the jet sees the nose far too
low, and any future AoA bracket on the HUD would read "fast" on every final.

The cause is the generic flap rule: the F-16 has no `flapCl` table, so aero.js `flapDeltaCl` gives
+0.28 CL per notch (+0.56 at notch 2), which carries about half the weight. The real jet has no flap
lever; its flaperons droop when the gear goes down. At notch 0 the same final is ~14.8°, at notch 1
~10.4°.

## What
Give the F-16 a cited gear-down flaperon lift increment instead of the notch rule, and/or a
cited approach speed, so the game's final sits in the bracket. Candidate sources, not yet read
for this: TP-1538's flaperon/flap data, if legible (docs/LESSONS.md 0153: its Table III OCR is
unreadable); the references of NASA/TM-2014-218514. Stevens & Lewis's F-16 model has no
trailing-edge flap term, so it can't supply one. If no open ΔCL is found, record the gap; never
fit one to hit 13°. Check the
Kid/Learner final guides, the coach's speed calls and the takeoff cards still pass.

## Acceptance criteria
- [ ] 0155's `it.fails` card promoted to `it`: α 11-15° on the game's final
- [ ] The flaperon increment's source cited in `src/aircraft.js`
- [ ] Every other F-16 card (lift at 20°, roll on approach, turns) passes unchanged

## Test plan
The 0155 card; the full `tests/flight/f16.test.js`; tests/flight/kidFinal.test.js.

## Out of scope
An AoA bracket or indexer on the HUD; carrier approaches.

## Source search (Builder, 2026-11-11)
NASA TP-1538 (ntrs 19800005879, read as text) has the trailing-edge flap only in Fig. 47: δtef 20° with the
leading-edge flap retracted, as a deep-stall pitching-moment increment (about -0.018 Cm at α 55-60°), no lift
increment. A web search for an F-16 flaperon/TEF ΔCL in NASA reports found none. Still unblocked only by a new source.
