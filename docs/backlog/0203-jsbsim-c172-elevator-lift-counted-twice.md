---
id: 0203
title: Our JSBSim C172 may count the elevator's lift twice (aero.js's POH-fitted CL table plus Roskam's CLδe)
status: shipped
priority: P2
size: M
lens: authenticity
created: 2026-11-18
pr: 297
---

## Why
Found by 0170. public/jsbsim/aircraft/c172/c172.xml's `CLalpha` table is aero.js's lift curve (its OAERO
note): 0.35 + 4.8·α, fitted so the POH stall speeds come out. A POH stall is flown with the elevator
well up, so that fit already holds the tail's download. The file then adds Roskam's `CLde` 0.43 per radian
of elevator on top, so full back stick (28° up) costs another 0.21 of CL.

Held full back from Vr, JSBSim climbs only ~100-200 fpm in its first seconds, where flightModel.js makes
400-1,000 fpm. Its peak pitch under 5 ft is 20.0 / 21.7° (flaps 0 / 10). With `CLde` set to 0, JSBSim
peaks at 22.1 / 23.7°, and its α is unchanged (18.9 / 18.8°). Only the trimmed elevator's share is really counted twice (the deflection beyond trim at full aft is real lift lost), so 22.1 / 23.7° is an upper bound. JSBSim also stalls ~1.5 kt fast clean (tests/flight/c172.test.js's JSBSim gaps). That gap is most of what 0170's
"flightModel.js over-rotates 3-5° past JSBSim" was. The 2026-11-14 lesson already warned about this:
grep `OAERO` before calling JSBSim a second opinion.

## What
Decide what JSBSim's lift should be:
- the table with `CLde` applied only to the elevator's deflection beyond the trimmed one, or
- a table re-fitted with `CLde` in it, against the POH stall speeds flown on JSBSim.

Then re-run every JSBSim card: stall speeds, takeoff distances, the Va pull. Its stall speed with the
download double-counted is likely already high.

## Acceptance criteria
- [ ] The PR says which of the two options it chose, and why (with the stall-speed numbers)
- [ ] JSBSim's 1 g stall speeds (flaps 0/10/30) within the cards' POH bands, flown with the elevator it takes
- [ ] The `KNOWN GAP (0203)` pitch cards in tests/flight/c172.test.js (0202 shipped: 23.3 / 24.4° against JSBSim's 20.0 / 21.7°) pass, or are re-measured and retargeted if the chosen option leaves part of the gap (the first option may)
- [ ] No JSBSim card regresses (`npx vitest run tests/flight`)

## Test plan
tests/flight/c172.test.js (JSBSim runs), tests/flight/jsbsim*.test.js.

## Builder note (2026-11-21, shipped)
Chose the first option: CLδe counts only the elevator's deflection beyond the trimmed one. The trimmed elevator is
the airframe's own pitch law, δe_trim(α) = −(Cmα / Cmδe)·α / eff(α) with Cmde_up's post-stall effectiveness, held at
the stall's value past it (c172.xml `aero/function/elevator-trim-rad`); flown in idle glides at 55-100 KIAS it matches
JSBSim's own trimmed elevator within 0.4° to α 13°. The second option (re-fit the table with CLδe in it) is the same
function: the re-fit is the table plus CLδe·δe_trim(α), so the first keeps the OAERO table untouched and says why.

1 g stall, flown (KCAS, flaps 0 / 10 / 20 / 30; the table's stallSpeedKts 52.96 / 49.95 / 48.88 / 48.00, POH 53 / 50 / – / 48):
| JSBSim | 0 | 10 | 20 | 30 |
|---|---|---|---|---|
| before (CLδe·δe) | 54.85 | 51.46 | 50.17 | 49.11 |
| CLδe 0 | 53.11 | 50.01 | 48.88 | 47.95 |
| after (beyond trim) | 53.07 | 49.98 | 48.85 | 47.94 |

Full aft at Vr, peak pitch under 5 ft: JSBSim 20.0 / 21.7° → 21.1 / 22.6° (flightModel.js 23.3 / 24.4°). The rest of
the gap is real lift flightModel.js does not lose, so the pitch cards are retargeted to 0214. JSBSim's short-field
lift-off (0165's card) passes: 55.4 → 54.2 kt, roll 996 → 951 ft (POH 960). The power-on stall drill's lazy pilot
held 12° and climbed out at 56.6 KIAS on JSBSim, under the drill's 57; it now holds 11.5° (still above the 10° cap).
