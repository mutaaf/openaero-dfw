---
id: 0127
title: Overspeed warning and a flap-limit mark on the speed tape (VFE, VMO / VNE)
status: ready
priority: P1
size: M
lens: authenticity
created: 2026-10-31
pr:
---

## Why
Playing the default final (390x844 and 844x390), the speed tape shows the airplane's speed and
the target bug and nothing else: nothing in the game tells a pilot they have gone too fast
for the flaps, the gear or the airplane. `src/aircraft.js` has the 737's VMO (`vneKts: 340`,
FAA TCDS A16WE) and the Cessna's VNE (163 KIAS) but only the trim stop uses them. A real
airliner shouts "OVERSPEED" with the clacker above VMO, and its tape draws the flap limit as
an amber line; a pilot dropping 30° flaps at 220 kt would hear and see it, and a Pilot-level
player in this sim is silently allowed to rip them off. 737-800 flap placard speeds are 250
(flaps 1, 2, 5), 210 (10), 200 (15), 190 (25), 175 (30) and 162 KIAS (40) in the
study-card sources the Scout found
(https://www.brainscape.com/flashcards/hpa-b737-800-limitations-test-with-cfm56-7247657/packs/11803090,
https://www.flaps2approach.com/journal/aaaaaa); no public Boeing FCOM exists, so the Builder
must say in the code comment that these are the widely published values, not a certified
source, and cite 14 CFR 25.1583 (the limitations a manual must give,
https://www.faraim.org/faa/far/cfr/title-14/part-25/section-25.1583/index.html). The Cessna
172S values (VNE 163, flaps-extended limits 110 KIAS to 10° and 85 KIAS to 30°) come from
its POH Section 2, which `aircraft.js` already cites for VNE.

## What
Add `vfeKtsByFlap` per aircraft in `src/aircraft.js` (C172 and 737; the F-16 gets none) and a
pure `speedLimit(aircraft, flapsDeg, gearDown)` helper in `src/aero.js` returning the active
limit (the lowest of VMO/VNE and the flap limit). Draw an amber tick or short band on the
speed tape at that speed when it is within the tape's span (hudLayout.js helper, not in the
draw call). When IAS exceeds the limit, caption and speak one "Overspeed" callout (the 0117
captions path in `src/captions.js` / `src/audio.js`, same cooldown rules as the other
callouts) and flash the IAS box amber; no damage, no failure, no gameplay penalty (a warning
only: structural failure is out of scope). Kid is exempt (assist level hides it, as it hides
other pilot-only cues). F-16 and gear-extended limits are out of scope.

## Acceptance criteria
- [ ] `speedLimit` returns the flap limit for the current notch and VMO/VNE with flaps up, per aircraft, pinned in a unit test with the cited values
- [ ] The amber limit mark is drawn on the tape when it is on the tape's span, and is hidden when it is off it
- [ ] IAS above the limit shows one "Overspeed" caption and one spoken callout (not repeated every frame); it clears when IAS drops below
- [ ] The 737 on the default final at Vref (150 kt, flaps 30) never triggers it; the same airplane at 200 kt with flaps 30 does
- [ ] Not shown for Kid
- [ ] Works at 390x844 touch and 1280x720 keyboard/mouse; no new per-frame allocations
- [ ] No frame-time regression (e2e perf probe within budget)

## Test plan
Unit: `speedLimit` per aircraft and notch; the hudLayout tape-mark helper (on/off span);
the callout trigger's edge detection (fires once, re-arms below). E2e: spawn the 737 at
210 kt flaps 30 and assert the caption `Overspeed` appears and the default final does not
show it.

## Out of scope
Structural damage or flap failure; MMO and Mach-based limits; gear-extended (VLE/VLO) limits;
the F-16; a separate cockpit clacker sound asset (reuse the speech path).
