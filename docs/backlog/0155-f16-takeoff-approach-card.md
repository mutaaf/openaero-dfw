---
id: 0155
title: F-16 takeoff and approach cards: lift-off and on-speed approach near published AoA and speed
status: proposed
priority: P2
size: M
lens: authenticity
created: 2026-11-05
pr:
---

## Why
The F-16 has airborne cards only (g, Mach, turn). The sim lets you take off and land it, yet
f16.test.js line 14 lists "takeoff and landing distances, approach speeds" as unsourced. The
public figures: approach flown on-speed at about 13° AoA (widely published; the Builder must
find an open citation, e.g. the USAF F-16 aircrew training materials on af.mil or NASA reports,
before writing the card) and a takeoff roll in the low thousands of feet at fighter weights.

## What
Find an open source for approach AoA and a lift-off speed at a stated weight. Then add one
card each to tests/flight/f16.test.js (±10% speed, ±15% roll). If no open source is found,
record the search in docs/LESSONS.md and drop this ticket; never invent a number.

## Acceptance criteria
- [ ] A cited approach-AoA card and a cited takeoff-roll card, or the ticket dropped with the reason
- [ ] No src detuning to pass; failures become KNOWN GAPs with tickets

## Test plan
Two `it` cards in f16.test.js on the existing takeoff harness.

## Out of scope
Arresting hook, carrier ops, external stores.
