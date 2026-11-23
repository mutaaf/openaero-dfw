---
id: 0216
title: The imagery credit wraps instead of clipping on 360 and 375 px phones
status: ready
priority: P1
size: S
lens: accessibility
created: 2026-11-23
pr:
---

## Why
AGENTS.md invariant 3: attribution "must stay visible". Played the build headless at 360x800 (a Galaxy S-class
Android) and 375x667 (iPhone SE / mini): `#mapCredits` is `white-space: nowrap`, centred with `left: 50%` and
`translateX(-50%)`, and its line "Satellite imagery © Esri, Maxar, Earthstar Geographics · Elevation: USGS 3DEP via
AWS Terrain Tiles" is 378 px wide, so it runs from x = -9 to 369 at 360 px and x = -2 to 377 at 375 px: the
first and last words are cut off the screen ("ellite imagery © Esri … Terrain Ti"). At 390 px and up it fits. The
e2e device matrix (`tests/e2e/devices.spec.js`) starts at 390 px, so nothing catches it. Android phones at 360 px
are the most common width in the world; the brief says the people to impress hold an iPhone, iPad or Android.

## What
In `src/styles.css` `.imagery-credit`: drop `nowrap` for the free-imagery line and cap the box at the viewport
(`max-width: calc(100vw - 16px)`, `white-space: normal`, centred text) so it wraps to two lines at narrow widths,
and check the two lines still sit in the gap under the touch deck (the deck pads the same inset plus 0.75rem) and
clear of the throttle and stick. Keep the Google variant (logo + data line) just as visible. No JS.

## Acceptance criteria
- [ ] At 360x800, 375x667 and 360x640 the credit's whole box is inside the viewport (left >= 0, right <= width) and
      none of its text is clipped (scrollWidth <= clientWidth)
- [ ] The credit does not overlap any touch control (throttle, stick, gear/flaps/brakes/ILS buttons)
- [ ] 390x844, 844x390 and 1280x720 look unchanged (one line)
- [ ] Both credits still link where they did; the Google attribution test still passes

## Test plan
`tests/e2e/devices.spec.js`: add 360x800 (Android), 375x667 (iPhone SE) and 360x640 to the device matrix for the
credit-in-viewport and no-overlap checks only (the horizon and tape checks for those sizes are 0217).

## Out of scope
The HUD tapes at 360 px (0217); the title screen layout.
