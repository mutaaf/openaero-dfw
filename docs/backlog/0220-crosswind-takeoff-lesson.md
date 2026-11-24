---
id: 0220
title: Crosswind takeoff lesson at Addison: aileron into the wind, hold the line, then crab
status: shipped
priority: P1
size: M
lens: content
created: 2026-11-24
pr: 317
---

## Why
The drills teach the crosswind landing (0188) but nothing teaches the other half: the crosswind
takeoff, an ACS task (FAA-S-ACS-6C, Normal and Crosswind Takeoff and Climb). The Airplane Flying
Handbook's technique is concrete and checkable: full aileron into the wind as the roll starts so the
windward wing stays down, eased out as the controls bite; rudder holds the centreline; lift off a
little firmer, then turn into the wind for a crab that holds the track on the extended centreline.
Summarised in AOPA's training tip quoting the handbook
(https://www.aopa.org/news-and-media/all-news/2015/august/31/training-tip-conrolling-crosswind-takeoffs)
and in the handbook's takeoff chapter
(https://www.faasafety.gov/files/events/SO/SO15/2022/SO15112841/Chapter6TakeoffsAndDepartureClimbs.pdf;
chapter number differs by edition: the Builder reads the PDF first and cites the page).

## What
Mission `kads_crosswind_takeoff` (Drills group, Cessna): on Addison 16 at the hold line, the wind of
0188's lessonWx (live METAR when 5-15 kt across and gusts within the POH's demonstrated 15, else a
12 kt scenario wind, labelled). A lazy chunk modelled on wingLow.js / takeoffCoach.js: coach words
name the wing and pedal from `sim.wx` ("aileron into the wind, hold it", "ease it out as the speed
builds", "centreline: rudder", after lift-off "turn into the wind: crab"). Graded at 200 ft AGL: peak
centreline excursion on the roll, the windward wing's bank held through 40 KIAS (graded as
aileron into the wind, not a number the POH doesn't give), the track over the extended centreline
(crab angle within the wind correction angle +-3 deg), a skip or a lift-off before Vr-5 named.
Kid: its hands-off line-up flies it; its card scores the result only.

## Acceptance criteria
- [x] Mission is in the picker's Drills group and spawns on Addison 16 with the wind above
- [x] Coach prompts name the correct wing and pedal for a wind from either side (unit test, both)
- [x] Grade falls for a roll that leaves the runway edge or drifts off the extended centreline
      (flight card flies a good and a no-aileron-into-wind takeoff headless; the second grades lower)
- [x] Works at 390x844 touch (RUD buttons) and 1280x720 keyboard
- [x] Boot JS budget unchanged (lazy chunk)

## Test plan
tests/unit for the coach words and grade; tests/flight card with both takeoffs (cite the handbook
page for the technique); an e2e that starts the mission and reads its HUD words.

## Out of scope
New flight-model physics (the existing crosswind card 0069 covers 15 kt); the 737.
