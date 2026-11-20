---
id: 0183
title: Ground effect's induced-drag curve matches PHAK's 1.4 / 23.5 / 47.6% (fix aero.js, re-measure flare and landing cards)
status: proposed
priority: P1
size: M
lens: authenticity
created: 2026-11-14
pr:
---

## Why
0179's card (`tests/flight/groundEffect.test.js`) found `aero.js groundEffectFactor` takes too much
induced drag away: ~11.4% at one span, ~36% at a quarter span, ~62% at a tenth, against the FAA's
1.4%, 23.5% and 47.6% (Pilot's Handbook of Aeronautical Knowledge, FAA-H-8083-25C, ch. 5, "Ground
Effect": https://www.faa.gov/sites/faa.gov/files/07_phak_ch5.pdf). The airplanes likely float longer
in the flare than they should (unmeasured: ground effect on lift is not modelled, and Kid's
auto-flare flies its own sink profile), and the model still takes 6% off at two spans up. The flare float (0085,
0098) and landing-distance cards are tuned on that curve.

## What
Replace the curve with one that meets the cited three points within 3 percentage points.
Wieselsberger's fit, σ = (1 - 1.32 h/b) / (1.05 + 7.4 h/b), lands within ~1 point at 1/4 and 1/10
(a fit usually quoted for about 0.033 ≤ h/b ≤ 0.25) but goes negative above ~0.76 span (-3.8% at one span, against PHAK's +1.4%), so it needs a tail
that meets 1.4% at one span and tends to 0 above it; or fit one curve through PHAK's three figures. Cite the curve in
aero.js. Then re-measure every card that flies near the ground (flare, float, landing roll, bounce,
takeoff, Kid final) on flightModel.js and say in the PR body which moved and by how much; a card that
now misses its POH figure gets its own gap ticket, not a widened bound.

Also decide (and write down) what height to pass: flightModel.js passes the CG's height above the
ground (`pos.y - groundY`), not the wing's (the Cessna's high wing sits above its CG, the 737's and
F-16's low wings nearer or below it; measure from the specs before choosing). The 1 m clamp holds the factor at its 1 m value (C172 below h/b 0.091,
F-16 below 0.100, 737 below 0.028); keep or justify it.

## Acceptance criteria
- [ ] The KNOWN GAP (0183) card in tests/flight/groundEffect.test.js passes and becomes a plain `it`.
- [ ] `npm test -- tests/flight` green; every moved card listed with before/after in the PR body.
- [ ] `node scripts/check-gaps.mjs` passes.

## Test plan
`npm test -- tests/flight`; the ground-effect table in the PR body (model vs PHAK).

## Out of scope
Ground effect on lift and pitching moment.

## Held for the operator (2026-11-20, Builder)
Two complete implementations are open as drafts and wait on the operator's decision, not on more building:
- #261 (2026-11-15): PHAK-fitted curve, coaches untouched; Kid's calm landing S 95 -> A 94, the 700 ft
  turn-back call flips to "land ahead" (gap 0189), the flare stall shake 0.65 -> 0.98 (gap 0190).
- #277 (2026-11-17, on newer main): a different 3-constant PHAK fit, coaches re-centred (power180 FLOAT_M,
  engine-out margin 25 -> 15 ft), Kid A 94, the 10 kt power-off 180 and two other coach cards filed as 0198.
Both are now behind main (merge conflicts). Do not build a third: to unblock, the operator picks one
(mark it ready for review, close the other) or says which effect to waive; the next Builder then rebases
the chosen PR on main and re-measures. 0178 (CDbeta) waits on the same decision.
