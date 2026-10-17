---
id: 0028
title: Deep links — ?airport, ?mission and ?view=terrain for the site launcher
status: shipped
priority: P2
size: S
lens: player-feel
created: 2026-10-17
pr: 0
---

## Why
mutaafaziz.com's app launcher could only open the default KDFW final. "Fly from Love Field"
or "Downtown skyline tour" had no URL to point at.

## What
`src/deeplink.js` (pure): `?mission=<key>`, `?airport=<ICAO>` (takeoff if any, else first
approach), `?view=terrain` (no Google session this visit). Applied in `boot()`, before the
Start flight tap, which is still required.

## Acceptance criteria
- [x] Each param picks its mission; junk falls back to the default
- [x] Start flight is still a tap; `?view=terrain` never requests `/api/config`
- [x] One-shot params leave the URL

## Test plan
- Unit: `tests/unit/deeplink.test.js`
- e2e: `tests/e2e/deeplink.spec.js`

## Out of scope
Auto-start (would break the user-gesture audio rule and the billing rule).
