---
id: 0013
title: Voice GPWS altitude callouts
status: shipped
priority: P1
size: S
lens: authenticity
created: 2026-10-16
pr: 9
---

## Why
The altitude callouts are chirps. Real airliners call "one thousand… five hundred…
one hundred, fifty, forty, thirty, twenty, ten" and "retard" — the soundtrack of every
landing.

## What
Use `speechSynthesis` (no network) for the callouts in `GPWS_ALT_THRESHOLDS`, with a
fast, flat voice; fall back to the existing chirps when speech is unavailable; respect the
audio toggle. Add "RETARD" at 20 ft when throttle is above idle on landing, and "SINK
RATE"/"PULL UP" voice with the existing banners.

## Acceptance criteria
- [ ] Unit test: callout words map 1:1 to thresholds
- [ ] e2e: with `speechSynthesis.speak` stubbed, descending through 50 ft queues "fifty"
- [ ] Audio off → nothing spoken

## Test plan
Vitest for the word map; Playwright stubbing `speechSynthesis`.

## Out of scope
Recorded voice samples.
