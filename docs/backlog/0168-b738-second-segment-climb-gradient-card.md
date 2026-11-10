---
id: 0168
title: 737 engine-out second-segment climb card: at V2, gear up, one engine out, it climbs at least 2.4%
status: ready
priority: P2
size: M
lens: authenticity
created: 2026-11-10
pr:
---

## Why
The 737 card set covers the engine-out takeoff to V2 at 35 ft (14 CFR 25.107) and the all-engine
go-around (25.119), but not the next regulatory number: after liftoff with the gear up and one
engine failed, a twin must hold a steady gross climb gradient of at least 2.4% at V2
(14 CFR 25.121(b), "second segment"). It is the reason a real crew can lose an engine at V1
and still clear the trees. If the engine-out thrust or drag in the model is wrong this is the
check that shows it, and the engine-failure drills (0104 for the Cessna) will want it for the
737 later. Sources: https://www.law.cornell.edu/cfr/text/14/25.121 (the Builder must read the
exact (b) wording and confirm the flap setting and gear state it names);
the 2.4% twin figure is repeated in https://www.faraim.org/faa/far/cfr/title-14/part-25/section-25.121/index.html .

## What
`tests/flight/b738.test.js`: from the existing engine-out-at-Vr scenario (65 t, sea level, ISA,
flaps matching the takeoff card), keep the failed engine out, retract the gear at positive
rate, hold V2, and measure the climb gradient (vertical speed over true airspeed, not
ground speed) once the gear is up and over 400 ft. It must be at or above 2.4%. A miss ships
as `it.fails` with `KNOWN GAP (NNNN)` and a new ticket for engine-out thrust or drag.
Also assert it climbs more at flaps matching 25.121 than with the flaps one notch more, to
prove the card is sensitive to configuration.

## Acceptance criteria
- [ ] The comment cites 25.121(b) with the flap setting and gear state it requires
- [ ] The gradient is true-airspeed based and measured gear up, 400 ft or more above the field
- [ ] A shortfall is a ticketed `it.fails` gap, not a loosened bound
- [ ] `npm run check:fast` passes, gap ledger included

## Test plan
New cards in b738.test.js; `node scripts/check-gaps.mjs` accepts any `it.fails` it adds.

## Out of scope
Net gradients and obstacle clearance; the third and final segments; a 737 engine-failure mission.
