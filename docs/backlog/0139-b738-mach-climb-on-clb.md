---
id: 0139
title: 737 on its max climb rating climbs FL240-FL350 at ~1,185 ft/min, just under APD's 1,500 ±20%
status: proposed
priority: P2
size: M
lens: authenticity
created: 2026-11-03
pr:
---

## Why
Found closing 0135. The APD's climb rates are flown on the max climb (CLB) rating, which the model
now has (`src/engine.js` maxClimbThrustN: Bartel & Young 2008, anchored to CFM's 26.5 kN at FL350,
Mach 0.8). The two 290 kt cards (FL100-FL150, FL150-FL240) fly it and pass, but the Mach climb
(290 KCAS to ~FL309, then Mach 0.78, FL240-FL350) on CLB measures ~1,185 ft/min at 65 t, -21%
against EUROCONTROL's 1,500 (band 1,200-1,800). On full throttle it measures ~1,350, which is what
the passing 0134 card flies; below ~FL300 full throttle is up to 12% above CLB, so that card leans
on the take-off rating.

## What
Find the cause before changing anything. Candidates: Bartel & Young's band 2 meets band 3 with a
~3% step at FL300 (their fits, not a cited CFM figure); the model's L/D at Mach 0.78, FL350 is ~16,
where public 737-800 cruise L/D estimates run higher; the CFM figure is "moteur avionné" (installed)
but the airframe's bleed and offtakes are not modelled; maxClimbThrustN fixes Bartel & Young's `n`
at a 2,500 ft/min climb while this climb is ~1,185 (about 1-2% of thrust here; `roc` 4,000 would
flip the card, so it must not be the knob that closes the gap: the card is only 1.3% outside the band);
the fact sheet gives the 26.5 kN for every -7B rating, so the anchor is not variant-specific. Find a cited climb thrust at FL250-FL300 or a
cited 737-800 cruise drag, and fit to it; do not tune to make the card pass.

## Acceptance criteria
- [ ] `tests/flight/b738.test.js` "KNOWN GAP (0139)" becomes a passing `it`, and the full-throttle
      Mach-climb card moves to CLB
- [ ] The 0135 climb cards, cruise, ceiling (0129), descent and take-off cards do not regress

## Test plan
Promote the flight card; a unit check of any new thrust or drag source.

## Builder findings (2026-11-13, not shipped; back to proposed)
**A cited 737-800 drag polar exists and closes the card.** OpenAP (TU Delft; data from Sun, Hoekstra & Ellerbroek,
"Estimating aircraft drag polar using open flight surveillance data and a stochastic total energy model",
Transportation Research Part C 114 (2020) 391-404, open access) gives the B738 clean polar as CD0 0.019, k 0.042
(e 0.799 on its own, winglet-less span; openap/data/dragpolar/b738.yml). The model has CD0 0.021 and
k = 1/(π · 10.2 · 0.82) = 0.0381 (no source in aircraft.js). Swapping in OpenAP's two numbers (cd0 0.019,
oswaldEfficiency 0.743 so k is 0.042 on the model's AR 10.2; κA, t/c and the Korn/Lock wave drag untouched), measured
headless:

| card (tests/flight/b738.test.js) | now | OpenAP polar | band |
|---|---|---|---|
| **KNOWN GAP (0139)** Mach climb FL240-FL350 on CLB | 1,185 fpm (-21%) | **1,305 fpm (-13%)**: passes | 1,200-1,800 |
| Mach climb, full throttle (regression guard) | 1,353 (-10%) | 1,475 (-2%) | ±20% |
| 290 KCAS on CLB, FL100-FL150 | 2,188 (+9%) | 2,299 (+15%) | ±20% |
| 290 KCAS on CLB, FL150-FL240 | 1,693 (-15%) | 1,809 (-10%) | ±20% |
| WRAP idle descent, three bands | +3.5 / +0.2 / -3.4% | -1.4 / -4.7 / -8.4% | ±20% |
| ACAP landing 65 t / MLW, field length | -6.3 / -6.9%, 5,062 ft | -6.1 / -6.7%, 5,059 ft | pass |

Every other 737 card passes; KNOWN GAP (0129) still fails as a gap. Not a 1% win, and nothing fitted: both numbers
are the paper's.

**Blocked by one card elsewhere:** `tests/flight/kidFinal.test.js` "b738 kdfw_35c_final, a 0.75 pull under 20 ft
in 15 kt from 270°: the long float stays on the centreline" asserts `maxNoseOff3sDeg < 5` and measures 4.8° today
(the comment says 4.9°: "the hold steering back from 4 m, not a crab"). With the polar the float carries a little
further and it reads **5.04°** (4.2 m off on the rollout, touchdown drift 0.3°: still not a crab). The full unit suite
is otherwise green (1,785 pass). Changing that bound would loosen a test, and refitting assists.js groundSteerRudder
(shared by every 0110/0150 rollout card) to clear 5° would be tuning to the card, so neither was done.
**Needs the Scout or operator:** either accept a bound tied to what the card means (e.g. the nose within the hold's
3° aim + the steering-back overshoot, or touchdown drift < 3° which it already checks) in its own PR, or a ticket to
retune the runway hold on the corrected polar. After that, this ticket is two lines in src/aircraft.js (cite the paper
there) plus flipping the KNOWN GAP (0139) card to `it` and moving the full-throttle Mach-climb card to CLB.

## Out of scope
VNAV, derates, the ceiling (0129).
