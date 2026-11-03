---
id: 0136
title: A hands-off Learner final holds its path on a phone-size touch screen, as it does on desktop
status: shipped
priority: P0
size: M
lens: player-feel
created: 2026-11-03
pr: 170
---

## Why
The product's promise is a first-timer on a stable final within 30 seconds, on an iPhone. The
Scout flew the default mission (KDFW 35C 4 NM ILS Final, Learner, Day, untouched controls) in
headless Chromium and read `openaeroDebug()` every 2.5 s:

| context | pitch over 4 samples | IAS | AGL |
|---|---|---|---|
| 1280x720, mouse | +2.2° throughout | 153 kt | 1,308 → 1,176 ft |
| 390x844, no touch | +2.2° throughout | 153 kt | 1,294 → 1,182 ft |
| 1280x720, hasTouch | +2.2° throughout | 153 kt | 1,317 → 1,226 ft |
| 390x844, hasTouch + isMobile | −8.1° → −13° | 151 → 195 kt | 1,131 → 220 ft in ~15 s |
| 390x844, hasTouch, not isMobile | −4.7° → −12.9° | 147 → 174 kt | 1,230 → 578 ft |

Only the phone layout (small viewport AND touch) dives; the same physics, mission and assist
fly level everywhere else. The 844x390 run showed the same −4,700 fpm. A phone that dives
hands-off breaks the Learner contract ("won't tip over or stall") and the first-30-seconds
goal. It may be a real input bug (a phantom stick deflection or throttle from the touch deck),
or it may be a synthetic-click artifact of the headless run (the Fly button sits where the
touch stick is on a phone, so a click can leave `sim.stick` non-zero); the ticket must find
out which, and say so in the PR.

## What
1. Reproduce with `tests/e2e` at 390x844 touch: start the default mission, touch nothing, read
   `openaeroDebug()`. Log `sim.stick`, `sim.elevInput`, `sim.throttle` and the assist trim
   target for the first 10 s on both layouts and compare (`src/main.js` `bindStick`,
   the touch deck block near line 2819, `src/input.js`).
2. Fix the cause in the input/assist path (not by loosening a spec). If it is a stuck pointer
   (a pointerup on a different element than the pointerdown, or `sim.stick.active` left true
   after the start-screen's tap), release on `pointercancel`/`lostpointercapture` and on the
   modal's close.
3. Add the e2e guard below so the phone can never silently dive hands-off again.

## Acceptance criteria
- [ ] At 390x844 and 844x390 with touch, after tapping Fly with a real touch tap and touching
      nothing else, 10 s of Learner flight on the default final keeps |pitch| within 4° of the
      first sample and loses under 300 ft/min on average (as the desktop run does)
- [ ] `sim.stick` is exactly (0, 0) and `sim.stick.active` is false until the player touches
      the stick (asserted in the spec)
- [ ] Kid and Pilot behave the same on desktop and phone for a hands-off 10 s (Pilot may drift
      as the raw airplane does; the assertion is "phone equals desktop within noise")
- [ ] 1280x720 results unchanged; no frame-time regression

## Test plan
New `tests/e2e/handsOff.mobile.spec.js` (phone project): taps Fly with a touch tap, samples
`openaeroDebug()` for 10 s and asserts the stick and pitch bounds. Run the whole phone project
(see LESSONS 2026-11-01 on API stubs).

## Out of scope
Changing the assist trim law or the ILS coach.

## Outcome (2026-11-03, Builder)
The dive did not reproduce on `main` (a58b2d5) or on the build the Scout flew (665dcf3): Learner,
Kid and Pilot fly the same hands-off final at 1280x720, 390x844 and 844x390 with touch (Learner
2.2° throughout and ~910 fpm, a little steeper than the 3° path's ~810, on every device; Kid ~785;
Pilot 2.1 → 1.6°, ~990), with Fly pressed by Playwright tap, click, `touchscreen.tap`,
`mouse.click` and raw CDP touches, at DPR 1 and 3, after 3 s and 15 s on the start screen. The
Scout's run was most likely a harness artifact. The Kid/Pilot comparison is a one-off probe
(PR #170), not a spec; tests 1-2 of handsOff.mobile.spec.js are a regression guard (they pass on
the old code too).
What the hunt did find is a real way to get that dive: a touch stick that loses its pointer
capture mid-hold gets its pointerup on whatever is under the thumb, and stayed pulled for the rest
of the flight (shown in Chromium with `releasePointerCapture`; that iOS Safari loses capture this
way is plausible but unverified here). The stick and trim buttons now let go when their own
pointer ends anywhere (window listeners), or the window blurs or the page is hidden; the throttle
keeps its setting.
**Changed criterion (operator: please confirm):** "loses under 300 ft/min" is impossible on a 3°
final at 153 kt (the ticket's own desktop run loses ~1,050 ft/min of AGL). The spec asserts the
sink is within 200 ft/min of the 3° path's sink at the mean groundspeed (~2.3° to ~3.7°).
