---
id: 0061
title: Results card says the one thing to fix next time
status: proposed
priority: P2
size: S
lens: player-feel
created: 2026-10-20
pr:
---

## Why
The vision wants a grade "that makes them want one more go". The card shows the grade and
its parts (rate, centreline, zone, flare, speed, stabilized verdict) but not which part cost
the most or what to do about it. A one-line, specific tip ("Sink rate 640 fpm: start the
flare a little earlier, ~30 ft") turns a grade into a goal. Games that retry quickly with
a stated cause (Super Meat Boy-style fast restart; Pilotwings' bonus tasks) keep players in the loop.
Reference: https://gameaccessibilityguidelines.com/ (provide clear feedback on failure).

## What
Pure function `landingTip(result)` in `src/landing.js` returning one sentence for the
worst-scoring factor (ties by a fixed order), shown under the grade; FLY AGAIN stays
the primary button. No tip for S.

## Acceptance criteria
- [ ] Every non-S grade and CRASH reason maps to a tip; S shows none
- [ ] Tip fits the card at 390x844 and 844x390 without scrolling the page
- [ ] Wording is plain enough for a kid and names a number the player saw

## Test plan
Unit table over `gradeLanding` outputs (each factor worst, ties, S). e2e: a hard landing shows the sink-rate tip.

## Out of scope
Replay (0019), ghost runs, scoring changes.
