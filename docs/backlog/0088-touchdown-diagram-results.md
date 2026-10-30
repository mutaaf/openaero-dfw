---
id: 0088
title: Results card shows where you touched down on a runway diagram
status: ready
priority: P2
size: S
lens: player-feel
created: 2026-10-24
pr:
---

## Why
The grade names centreline and touchdown-zone numbers, but a first-timer cannot picture
"3.2 m left, 640 m down". A tiny top-down runway strip with your touchdown mark and the
1,000 ft aiming-point block turns the number into a picture and a reason for "one more go"
(pillar 4). The FAA marks the touchdown zone as the first 3,000 ft or the first third of
the runway ([AIM 2-3-3, runway markings](https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap2_section_3.html)).

## What
In `src/landing.js` expose the touchdown point as (along-runway m, cross-track m) and the
runway length/width; draw a small 2D canvas strip in the results card (CSS only for sizing,
no new assets), marking the aiming point, the touchdown zone, the centreline and the dot.

## Acceptance criteria
- [ ] After a landing the card shows a strip with the dot at the measured touchdown position (within 1 px of the computed position)
- [ ] The strip is labelled for screen readers ("touched down 640 m past the threshold, 3 m left of centre")
- [ ] The card still fits at 390x844 and 844x390 without scrolling the page
- [ ] No console errors; boot JS stays within budget

## Test plan
Unit test for the position -> pixel mapping and the text label; e2e checks the strip exists
after `openaeroDebugFinal` landing and that its aria-label contains the numbers.

## Out of scope
Replay (0019), a history of touchdowns, sharing.
