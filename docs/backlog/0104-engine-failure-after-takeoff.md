---
id: 0104
title: Engine failure after takeoff: the "impossible turn" mission, and why you land ahead
status: shipped
priority: P1
size: M
lens: content
created: 2026-10-28
pr: 123
---

## Why
The dead-stick challenge (0036) teaches a glide from pattern altitude. The accident that
really kills pilots is the engine that quits just after liftoff, when the instinct is to
turn back to the runway. The FAA's Airplane Flying Handbook says that before a safe
maneuvering altitude "it is usually inadvisable to attempt to turn back"; AC 61-83J
(2018) asks instructors to teach when and how a 180° turnback can be made; the FAA Safety
Team handout notes the return needs well over 180° of turn once the turn radius is counted
(https://www.faasafety.gov/files/gslac/library/documents/2016/Feb/111580/Engine%20Failure%20on%20Takeoff%20Handout.pdf,
AOPA summary: https://www.aopa.org/news-and-media/all-news/2021/june/pilot/proficient-pilot-unintended-consequences).
The sim already has the pieces (engine-out flag, best-glide coach, graded off-airport
touchdown, headless flight cards), so a player can learn the lesson by living it: fail at
200 ft and try to turn back, then fail at 1,000 ft and make it.

## What
A lazy-chunk mission like 0036 (`src/engineOut.js` or an extension of `deadStick.js`):
the C172 is rolling on Addison 16 (or the Cessna's KDFW-area departure end), takes off
normally, and the engine fails at a chosen height (the mission picker offers 300 ft and
900 ft AGL). The coach says "pitch for 68, land ahead" first, then, below a computed
turnback height, keeps saying so; above it, it allows the turn. The turnback height is
computed from the live glide ratio and a 1 s reaction delay at the bank the assist level
allows, not a hard-coded number. The result is graded: on a runway or a clear field
ahead (the existing off-airport touchdown grader), turnback made, or a stall in the turn
(capped D with "the turn cost you X ft"). Kid's guide lands ahead.

## Acceptance criteria
- [x] Two missions (300 ft and 700 ft failure; the ticket asked for 900 ft, see As built) appear in the picker under Addison with a blurb that states the lesson
- [x] Engine is failed in the physics (`sim.engineFailed`), HUD says "ENG OUT", no autopilot
- [x] A flight card flies each mission headless: the 300 ft case landing ahead survives, the same case with a turnback stalls or lands short; the 700 ft case turnback reaches the runway (as built)
- [x] The coach's turnback height is computed from glide ratio and wind, and a unit test pins it
- [x] Works at 390x844 touch and 1280x720; boot JS budget held (new code is lazy)

## Test plan
Unit test for the turnback-height function; flight cards in `tests/flight/` as above (the
fail-then-turn case is the one that must fail without the new coach/grader); one e2e that
starts the 300 ft mission, lets Kid fly it, and sees a graded results card.

## As built
`src/engineOut.js` (lazy chunk, like deadStick.js, whose glide numbers, Addison ends and miss
grader it reuses). Two Cessna takeoffs from all of Addison 16 (flaps 0, the POH's normal
takeoff; the displaced 979 ft is usable for it): `efato_kads_16_300` and
`efato_kads_16_700`. **700 ft, not 900**: flown headless in calm air, this climb (~9% over the
ground) is shallower than the glide back (~11%), so the turnback window closes at both ends;
it opens at ~425 ft and closes at ~925 ft (900 made the runway by ~5 m, 950 missed), and 700 is
in its middle. The coach's turnback height `turnbackHeightFt` is computed live: the reaction
second, a turn of 180° plus twice the cut back from two turn radii beside the runway (well over
180° close in), the turn's sink at 1 + k(n² − 1) times the glide's (k = 0.35, measured on
flightModel.js: 1.34x at 45° and 68 KIAS, a card), the glide back downwind (a takeoff headwind helps twice), less
the climb's spare speed ((v² − vg²)/2g). A flight card fails the engine every 50 ft from 300 to
1,100 ft and turns back: the airplane makes the runway exactly where the coach says it can,
except within 25 ft of the line. The panel then flew it in wind: the coach now says "you can turn back" only with 25 ft to spare (`EO_MARGIN_FT`), and the sweep card runs in calm air and in a 10 kt headwind: wherever the coach says it can, the turn back makes the runway; wherever the need is above the height, it does not (the test pilot steers to a point down the runway and sets full flaps when high on final). A turn counts as "turned back" past 120° off 16 (a turn to a field is still landing ahead). The coach says "you can turn back" or "land ahead" at the
failure from the height there, then "keep turning" or "too low for this turn". Graded:
decision 30%, landing 70%; landed ahead in a field is a B at best ("the right call"); turned
back below the height it needed, or a stall above 50 ft, is a D at best with what the turn
cost; a crash stays a crash. Kid's guide glides ahead wings level; the takeoff (power and
rotation) is the player's at every level, as on every takeoff. Flown on flightModel.js only
(JSBSim is not carded here). `?airport=KADS` still deep-links the final, not the drill.

## Out of scope
Twin-engine failures (V1 cut), engine-fire checklists, new scenery, the 737.
