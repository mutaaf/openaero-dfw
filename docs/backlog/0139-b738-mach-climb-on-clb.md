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
at a 2,500 ft/min climb while this climb is ~1,185 (about 1-2% of thrust, small but rule it out);
the fact sheet gives the 26.5 kN for every -7B rating, so the anchor is not variant-specific. Find a cited climb thrust at FL250-FL300 or a
cited 737-800 cruise drag, and fit to it; do not tune to make the card pass.

## Acceptance criteria
- [ ] `tests/flight/b738.test.js` "KNOWN GAP (0139)" becomes a passing `it`, and the full-throttle
      Mach-climb card moves to CLB
- [ ] The 0135 climb cards, cruise, ceiling (0129), descent and take-off cards do not regress

## Test plan
Promote the flight card; a unit check of any new thrust or drag source.

## Out of scope
VNAV, derates, the ceiling (0129).
