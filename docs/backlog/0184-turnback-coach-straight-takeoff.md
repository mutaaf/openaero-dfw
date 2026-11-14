---
id: 0184
title: Engine-out turn-back coach in still air, re-measured on a straight takeoff roll (Addison 16)
status: proposed
priority: P1
size: M
lens: authenticity
created: 2026-11-14
pr:
---

## Why
The coach in the engine-failure-after-takeoff missions (0104, `src/engineOut.js turnbackHeightFt`) tells
the player whether a turn back to the runway is possible. Its still-air card
(`tests/flight/engineOut.test.js`, "the turn back makes the runway wherever the coach says it can") was
measured on a takeoff whose pedals fishtailed: the test pilot's ground-rudder damping had the wrong sign
(−2 per rad/s of yaw rate instead of harness.js's +0.15 per °/s), so the roll swung ±12° of sideslip at full
rudder from ~23 kt and lifted off ~14 s late. 0178 fixed that pilot (its new drag due to sideslip made the
fishtail cost far more runway). Flown straight, the Cessna fails closer to the runway and the still-air
window changes shape:

`300:no/439 350:no/448 400:no/455 450:no/460 500:no/463+ 550:no/421+ 600:made/404+ … 1100:made/900+`
(height: result / coach's need, `+` = coach says "can turn"). The coach says "can" at 500 and 550 ft and
the turn misses; the window no longer closes at 1,100 ft. A coach that says "turn back" when it can't is
the dangerous direction. The 10 kt headwind window still passes every row.

Also measured (0178): with the ball centred, the 45° gliding turn sinks 1.393x the straight glide, not
the 1.35x (`EO_INDUCED` 0.35) the coach assumes (1.341x was a slipping turn without slip drag). Raising
`EO_INDUCED` to 0.39 moves the need ~10 ft and does not close the 500/550 misses alone.

## What
Find why the 500 and 550 ft turns miss though the coach's need (463, 421 ft) is below the height: trace
the turn's height loss and the glide back against `turnbackHeightFt`'s terms (reaction second, the
turn's radius and sink, the cut, the climb's energy credit) for those failures, and correct the model
(or `EO_MARGIN_FT`). Re-measure `EO_INDUCED` with the ball centred. Decide, with the 0104 mission text,
whether the still-air window should close at the far end on a 7,203 ft runway.

## Acceptance criteria
- [ ] The KNOWN GAP (0184) card in `tests/flight/engineOut.test.js` is promoted to `it`
- [ ] The coach never says "can" where the turn back misses, in still air or a 10 kt headwind
- [ ] `EO_INDUCED` matches the coordinated measurement (or its card's band is justified)

## Test plan
`npm test -- tests/flight/engineOut.test.js`

## Out of scope
The 300/700 ft mission scripts' wording; other airports.
