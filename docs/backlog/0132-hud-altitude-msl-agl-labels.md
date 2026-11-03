---
id: 0132
title: The altitude tape says MSL and the top bar says AGL, so the two numbers stop looking like a bug
status: shipped
priority: P1
size: S
lens: authenticity
created: 2026-11-02
pr: 166
---

## Why
Scout screenshots of the default 4 NM final (all three layouts) show two altitudes with the same
shape and no label on the one that matters most: the top bar reads "AGL FT 1072" while the right
tape box beside it reads "1546" (390x844: 1092 vs 1569). A first-timer, or a pilot, sees two
altitudes 470 ft apart on one screen and reads it as a bug. They are different things (the tape is
the altitude above sea level; the bar is the height above the terrain under the airplane, which is ~470 ft MSL there). A real PFD labels what it shows, and the radar-altimeter reading is a separate, boxed
number (FAA AC 120-29A / Airplane Flying Handbook ch. 5: indicated altitude is MSL; radio altitude
is height above terrain). The off-screen panel already says "ALT (MSL)" and "RADAR AGL"
(`index.html` `#txtAltMsl`, `#txtAltAgl`); the HUD itself never does.

## What
Label the altitude tape's readout "MSL" (a small caption on the tape or its box, drawn in the HUD
canvas next to the box, not a new DOM overlay over the horizon) and label the top-bar field "AGL"
everywhere it is shown (it already is on the desktop bar and `#txtPhoneAgl`; keep them). Nothing
else changes: same numbers, same colours. Touches `src/main.js` (the tape drawing) and, if the
caption needs room, `src/hudLayout.js`.

## Acceptance criteria
- [ ] On desktop, phone portrait and phone landscape the tape box carries a visible "MSL" caption
- [ ] The caption does not overlap the box digits, the tape ticks or the speed tape at 390x844,
      844x390 and 1280x720 (rects checked in the e2e)
- [ ] Text meets 4.5:1 contrast on the HUD background (invariant 7)
- [ ] Nothing new sits on the horizon line; no per-frame allocation (invariant 4)

## Test plan
Extend an existing HUD e2e spec (e.g. `tests/e2e/mobile.spec.js`) to read the caption from the
HUD's exposed state or the DOM label and assert the geometry above in the three layouts; a unit
case in `tests/unit/hudLayout.test.js` if layout math changes.

## Out of scope
A QNH/baro setting, a radar-altimeter box, any change to the AGL number's source.
