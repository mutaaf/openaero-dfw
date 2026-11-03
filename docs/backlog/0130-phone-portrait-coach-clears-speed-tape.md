---
id: 0130
title: On a phone held upright the coach card no longer covers the speed tape or the runway
status: shipped
priority: P1
size: S
lens: accessibility
created: 2026-11-02
pr: 160
---

## Why
Scout played the 4 NM final at 390x844 (iPhone 14 emulation, Learner, night): the coach card
("Keep two white, two red on the PAPI") sits across the lower part of the HUD at y ~ 570-650 px
and hides the bottom of the airspeed tape (the 120-140 kt marks and the red stall band of 0128),
most of the "SPD 155" label and the ground just under the horizon, which is where the runway and
PAPI are on a short final. AGENTS.md pillar 1: the HUD never overlaps itself at 390x844 and never
hides the horizon. The first-30-seconds coach is the thing a first-timer reads, so it is also the
thing most likely to be sitting on top of what it is talking about (the PAPI).

## What
Place `#coach` (index.html, styled in styles.css; the layout maths belongs in `src/hudLayout.js`
next to the other screen-dependent geometry) so its box clears the speed and altitude tapes' boxes,
the SPD/target label and the band from the horizon line down 12% of the viewport height, at 390x844
and 844x390 and on an iPad (820x1180). Options the Builder may pick: narrower card between the
tapes, or moved below the touch deck's top edge, or a one-line card on phones. No change to coach
words or timing, and desktop is unchanged.

## Acceptance criteria
- [ ] At 390x844, 844x390 and 820x1180 the coach card's rect does not intersect the airspeed tape,
      altitude tape, SPD label, or the strip 0..12% of viewport height below the horizon
- [ ] The Skip button stays >= 44x44 px and reachable (not under the touch deck)
- [ ] Desktop 1280x720 layout unchanged (screenshot diff by eye)
- [ ] No e2e perf regression; boot JS budget held

## Test plan
`hudLayout.js` pure function for the card's rect with a unit test over the three viewports; an
e2e spec in the phone project that starts the default final, waits for the first coach prompt and
asserts the rect-vs-rect clearances with `getBoundingClientRect()`.

## Out of scope
New coach prompts, the results card, the desktop panels.
