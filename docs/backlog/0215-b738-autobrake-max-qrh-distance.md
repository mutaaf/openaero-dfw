---
id: 0215
title: The 737's autobrake MAX stops ~15% short of Boeing's QRH flaps 40 distance
status: proposed
priority: P2
size: M
lens: authenticity
created: 2026-11-21
pr:
---

## Why
0204 carded the 737's landing against Boeing's QRH "Normal Configuration Landing Distances, Flaps 40"
table (737-800WSFP1/CFM56-7B27), reproduced as Table 1 on p. 19 of India's VT-AXV Mangalore accident
report (skybrary.aero/sites/default/files/bookshelf/1680.pdf, PDF page 35). Max manual braking and autobrake
1, 2 and 3 land within 1-5% of it (no reverse, 60 t, sea level). Autobrake MAX does not: the QRH gives
3,470 ft from 50 ft (its NO REV adjustment is 0), the model stops in ~2,950 ft. Its flat 14 ft/s²
(aircraft.js systems.autobrake) brakes almost as hard as full pedals (2,845 ft; QRH 2,820), where the QRH's
MAX averages ~10 ft/s² over the roll. Forum copies of the FCOM say MAX is 14 ft/s² above 80 kt and 12 below,
which would close only ~100 ft. Autobrake 1-3 also land 3-5% short, all the same way, while the model's air
distance (~1,100 ft) is longer than the QRH's 1,000: the ground roll is short everywhere, so the first suspect
is the brakes' onset (systems.js starts the autobrake's integrator at 0.3, or 1 for MAX, at touchdown, with a
0.3 s pressure lag; Boeing's figures include a ramp-up).

## What
Find what the QRH's MAX AUTO assumes (the autobrake's pressure ramp-up, a lower deceleration target, the
3,000 psi MAX pressure limit, or a later brake onset) from a source read in full: Boeing's FCOM 14.20 autobrake
description, an FCTM landing section, or an accident report (NTSB, AAIB, ATSB, DGCA) that quotes the
deceleration schedule. Change systems.js / aircraft.js to match, so the KNOWN GAP (0215) card in
tests/flight/b738.test.js passes and is promoted to `it`. On a real 737 NG, RTO is its own selector position
at full pressure, separate from MAX, and tests/flight/rto.test.js uses autobrake 4 (MAX) as its RTO stop: split
RTO from MAX (a systems.js position or an RTO flag at full pressure) so softening MAX does not lengthen the RTO.
If no source is found, write that in a Builder note and send the ticket back to proposed: do not tune the
model to the number.

## Acceptance criteria
- [ ] The 0215 card passes (flaps 40, 60 t, sea level, MAX, no reverse: 3,470 ft ±5%) and becomes `it`
- [ ] The other QRH flaps 40 cards, the ACAP cards and the RTO cards (rto.test.js uses MAX/RTO braking) stay green
- [ ] The source and page are named in aircraft.js's comment

## Test plan
tests/flight/b738.test.js (QRH flaps 40 cards), tests/flight/rto.test.js, tests/flight/b738-systems.test.js.

## Out of scope
Reverse thrust credit; wet or contaminated runways (the same QRH table's braking-action rows).

## Builder note (2026-11-21, not shipped: no source for MAX's schedule)
Searched for what MAX AUTO assumes and found no readable primary source that says. The model is
unchanged and the KNOWN GAP (0215) card stays.

What the sources do say:
- **Boeing's own stopping chart agrees with the QRH.** The same VT-AXV report, Appendix "Item No. 3" (report p. 159,
  PDF p. 175) and Figure 8 (report p. 170, PDF p. 186, an image: render at 300 dpi) is Boeing's own calculation (737-800W SFP1, CFM56-7B27,
  30 Aug 2010): ground distance from touchdown to a stop, dry, flaps 40, no reverse, 450 ft, 83 °F, 10.5 kt
  tailwind, Vref40+6, for autobrake 1/2/3/MAX and max manual. Read at 132,300 lb (60 t): manual ~2,370 ft, MAX
  ~3,160, 3 ~4,910, 2 ~6,720, 1 ~8,150. As ratios to max manual: MAX 1.33, 3 2.07, 2 2.84, 1 3.44. The QRH
  table's ground rolls (total − its 1,000 ft of air) give 1.36, 2.09, 2.92, 3.58. Both say MAX rolls about
  a third further than full pedals. Not independent: the report says Figure 8's parameters are "consistent with
  the databases used to develop the airplane flight manual and operational performance data provided in the
  FCOM", so it is the same Boeing model in other conditions, a check on the read-off, not a second witness.
- **Boeing's time schedule, quoted.** The same page: "brake initiation (auto brakes) at touchdown (manual braking
  is one second after touchdown), speed-brake select one second after touchdown". So the autobrake's onset
  is at touchdown, as systems.js has it. tests/flight/b738.test.js's pilot presses the pedals *at* touchdown,
  not one second after.
- **On MAX (United Airlines 737 Flight Manual, Ch. 8 Systems, quoted in NTSB docket DCA24FA120, Ops/HP Group Chair's
  factual, §9.1, p. 27):** "on dry runways, the maximum autobrake deceleration rate in the landing mode is
  less than that produced by full pedal braking", and "After landing, autobrake application begins when: Both
  forward thrust levers are retarded to IDLE; The main wheels spin-up". No rates and no ramp.
- The 4/5/7.2/14 ft/s², "12 below 80 kt" and the pressure ramp (~750 psi in 1.75 s, then the setting's pressure
  1-1.25 s later) are from PPRuNe/AVSIM posts only. A 777 post's "MAX holds level 4 until pitch < 1°" is a
  777 rule, not shown for the 737. The manualshive.com FCOM copy blocks automated readers; not read.

What the model does (measured, 60 t, sea level, flaps 40, 133.1 kt at touchdown, ground roll after touchdown):
manual 1,749 ft (QRH 1,820, −4%; 1,878 with the pedals 1 s after touchdown as Boeing assumes, +3%), autobrake 3
3,506 (3,810, −8%), 2 5,015 (5,310, −6%), 1 6,149 (6,510, −6%), MAX 1,856 (2,470, −25%). Assuming the QRH's
touchdown speed is the model's (the QRH does not publish it), v²/2d at 224.6 ft/s gives the QRH rolls averaging
13.9 / 10.2 / 6.6 / 4.75 / 3.9 ft/s² for manual/MAX/3/2/1: 92 / 95 / 97% of the 7.2 / 5 / 4 targets, 73% of MAX's
14. The model averages its targets exactly (its PI loop seeds at 0.3). As dead time, τ = (d − v²/2a)/v: 3 1.37 s,
2 1.18 s, 1 0.91 s, MAX (at 14) 2.98 s; τ/a = 0.19 / 0.24 / 0.23 / 0.21 s per ft/s², one band (validation
panel). So the time lost grows with the target: a ramp of fixed *duration* cannot explain MAX, but an onset
ramp at a fixed *rate* (~2.3 ft/s³, roughly a fixed psi/s) explains all four settings, MAX included, with MAX
keeping its FCOM 14 ft/s². No primary source gives that rate.

Ways forward (needs the Scout or the operator to pick one):
1. Find the FCOM 14.20 autobrake description itself (a full copy, or an accident report that quotes the
   deceleration schedule and ramp; ATSB AO-2015-046, VH-VOP Christchurch, quotes autobrake 3's 7.2 ft/s² and may
   quote more: atsb.gov.au was down on 2026-11-21).
2. The simplest candidate: a rate-limited onset (deceleration command ramping at ~2.3 ft/s³ from touchdown) on
   every setting, which would bring 1-3 from −6/−8% to the QRH and MAX to it together, RTO split out at full
   pressure (tests/flight/rto.test.js). The rate is fitted to the QRH, not read from a source: it needs a source
   for the ramp (way 1) or the operator's yes, since the ticket forbids tuning to the number. (A flat effective
   MAX of ~10.3 ft/s² also fits MAX alone, but leaves 1-3 short.)
3. Separately: the card pilot's pedals at touchdown + 1 s (Boeing's schedule; max manual goes +3% long). It
   moves passing cards and is its own ticket.

