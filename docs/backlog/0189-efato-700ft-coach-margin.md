---
id: 0189
title: Engine failure at 700 ft: in still air the coach now says "land ahead" by 3 ft (after 0183)
status: proposed
priority: P2
size: S
lens: player-feel
created: 2026-11-15
pr:
---

## Why
0183 put ground effect on PHAK's curve (FAA-H-8083-25C ch. 5): less induced-drag relief just above the
runway, so the Cessna's Vy climb out of Addison 16 reaches 700 ft ~36 m further down the runway (the
lift-off moved 7 m). engineOut.js turnbackHeightFt there rose from 664 to 678 ft; with EO_MARGIN_FT 25
the coach wants 703 ft, so `efato_kads_16_700` in still air hears "land ahead". The turn back flown
by tests/flight/engineOut.test.js still makes runway 34 (the airplane makes it from 450 to 800 ft;
the coach allows 500 to 650 ft, four heights where the card asked for five). The mission's blurb
says "a quick 45° turn back can make it; the coach says if today's wind and your climb allow it", so
nothing is false, but the mission meant to show a coached turn back no longer does in calm air.

## What
A decision, then a small change. Options:
1. Move the mission's failure height to 750 ft (the coach allows it in calm air with the new curve),
   keeping the mission key and its personal bests, and update the blurb/label.
2. Keep 700 ft and accept "land ahead" in still air (a headwind opens it): rewrite the two gap cards
   as plain cards that say so.
3. Revisit EO_MARGIN_FT (25 ft is a game choice, uncited); not by less than the coach model's error
   against the flown turn at the window's far end (850 ft: need 849, missed).

## Acceptance criteria
- [ ] The two KNOWN GAP (0189) cards in tests/flight/engineOut.test.js pass, or are replaced by cards
      that state the chosen behaviour; "wherever the coach says it can, it makes it" still holds.

## Test plan
`npm test -- tests/flight/engineOut.test.js`.

## Out of scope
The turnback model itself (0184, in PR #256, covers its still-air misses at 500/550 ft on a straight roll).
