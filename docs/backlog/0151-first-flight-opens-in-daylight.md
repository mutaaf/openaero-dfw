---
id: 0151
title: A first flight never opens in the dark: the preselected When? skips a dark Live
status: shipped
priority: P1
size: S
lens: player-feel
created: 2026-11-04
pr: 187
---

## Why
The Scout's play-through at 6:15 AM Dallas time (Live sun 46° below the horizon) opened the
recommended first flight, KDFW 35C 4 NM final, as a near-black screen at both 390x844 and
1280x720: the imagery is moonlit grey, the PAPI is a tiny speck, the horizon barely reads.
The vision says a first-timer is on a stabilized final within 30 seconds and wants one more
go; a kid arriving before school or after dinner meets the dark first. `Live` is the
default (`sim.timeOfDayMode: 0`, src/main.js) and the player can tap Day, but a first-timer
does not know the chips change the sky. Aviation practice agrees that day is the
right first condition: FAA-H-8083-3C ch. 9 teaches the approach in daylight before night.

## What
When no When? choice has been made this visit and the live sun is below civil twilight
(-6°, `sunPreset('Now')` elevation), preselect Noon instead of Now on the start screen.
The chip row then reads "Day" highlighted, and the "when" line says "Today's midday in
Dallas" (already honest: no "live" claim). The Live chip stays one tap away. A dark
mission (night ILS, dusk) keeps its own sky as today (`missionSun`). Nothing is stored
(save data unchanged); a Live sun above -6° keeps Live as the default.

## Acceptance criteria
- [x] With the clock faked to 06:15 and 22:00 Dallas time, the start screen preselects Day and its line says "Today's midday in Dallas"
- [x] With the clock faked to 12:00 Dallas time, Live stays preselected and its line says "Live over Dallas"
- [x] Tapping Live while it is dark still gives the dark sky, labelled Live
- [x] The night and dusk missions are unchanged
- [x] Boot JS stays within the budget (move or inline, do not grow)

## Test plan
A pure `defaultTimeMode(sunElevationDeg)` unit test (above and below -6°, the edge); an e2e
that fakes `Date` for the three times and reads the highlighted chip and the line.

## Out of scope
Remembering the player's When? choice across visits (0022); changing the sun maths.
