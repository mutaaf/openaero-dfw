---
id: 0119
title: B738 card: idle descent rate and speed schedule match EUROCONTROL's published descent
status: proposed
priority: P2
size: M
lens: authenticity
created: 2026-10-30
pr:
---

## Why
The 737 has takeoff, go-around, final and (0113) cruise cards, but nothing between FL350 and the
final. A player who descends from altitude (or the Kid autopilot, when it flies a descent) meets
the drag and idle-thrust model for the first time with no check. EUROCONTROL's Aircraft Performance
Database lists nominal cruise, climb and descent speeds and rates for the B738
(https://www.eurocontrol.int/model/bada ; APD per aircraft at
https://contentzone.eurocontrol.int/aircraftperformance/).

## What
Fly the 737 at 65 t from FL350 / M 0.78 at idle in the harness along the APD speed schedule
(M 0.78 / 280 kt CAS / below 10,000 ft 250 kt): the descent rate is within APD's published nominal
band (read the exact figures from the APD page and write them in the card's comment), and the
speed schedule holds without exceeding VMO/MMO (340 KCAS / M 0.82, EASA TCDS IM.A.120).
A mismatch becomes an `it.fails` card with its own ticket.

## Acceptance criteria
- [ ] A card quotes the APD descent figures with the URL and the date read
- [ ] Idle descent at the schedule is within ±20% of the published rate, or a known-gap card exists
- [ ] No existing 737 card regresses

## Test plan
Flight cards in `tests/flight/b738.test.js` beside the 0113 cruise cards, using the same harness
helpers; no src change unless trivially required.

## Out of scope
Speedbrakes, VNAV logic, any change to the thrust lapse (that is 0116).
