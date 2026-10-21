---
id: 0064
title: C172 takeoff roll and 50 ft distance card against the POH
status: shipped
priority: P1
size: S
lens: authenticity
created: 2026-10-21
pr: 63
---

## Why
`tests/flight/c172.test.js` pins the hot-day roll only as a ratio (+20%) and has no
absolute takeoff card, so a drift in thrust or rolling friction could pass unseen. The
172S POH Section 5 gives, at 2550 lb, sea level, ISA, paved dry level runway, flaps up,
full throttle, no wind: ground roll 960 ft, 1630 ft over a 50 ft obstacle (one unofficial
copy of the table in the wild reads 945/1633, so read the figure from the POH PDF
itself, as the cruise card did: https://www.befa.org/wp-content/uploads/2019/12/POH-Cessna-172S.pdf,
cite the page and figure number).

## What
Add a card to `tests/flight/c172.test.js` using the existing harness pilot: full throttle,
brakes released, rotate at the POH speed (55 KIAS), then climb at Vy to 50 ft. Assert ground
roll and 50 ft distance within ±15% of the POH (the POH tables are themselves rounded
and flown by test pilots with a margin). Run it on both models (flightModel and JSBSim
via `jsbsimNode.js`) like the other cards; if a model misses, record it as `it.fails` with a
short note and open a ticket rather than retune blindly. Print the measured distances in the card.

## Acceptance criteria
- [ ] Card cites POH page/figure and the conditions above
- [ ] Measured roll and 50 ft distance printed and within the stated band, or `it.fails` + ticket
- [ ] Harness pilot checked: it holds heading and rotates at 55 KIAS (print IAS and pitch rate)
- [ ] `npm run test:unit` time not materially longer (<5 s added)

## Test plan
Headless flight card as above; no e2e.

## Out of scope
Landing roll (0051), short-field technique, wind and slope corrections, 737 and F-16.

## Shipped notes
The POH has no flaps-up takeoff table: Fig. 5-5 (p. 5-14, Revision 4 copy at befa.org) is
the short-field table only (flaps 10°, lift off 51 KIAS, 56 KIAS at 50 ft). At sea level,
interpolated to 15 °C, it reads 960 ft roll and 1633 ft over 50 ft, so the card flies the
POH's own conditions with the harness's existing short-field rotation (45 KIAS to 11°) and
climbs at 56 KIAS. Measured: flightModel 959 / 1712 ft, JSBSim 1014 / 1783 ft. The harness
pilot now holds runway heading with rudder (JSBSim swung 8° left without it).
