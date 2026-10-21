---
id: 0067
title: C172 accelerated-stall card: stall speed rises with the square root of load factor
status: ready
priority: P2
size: S
lens: authenticity
created: 2026-10-21
pr:
---

## Why
Pillar 0: every flight-model claim has a card. The three 1g stall cards pass, but nothing
checks that the wing stalls *higher* in a banked turn, the way a real pilot meets it on a
base-to-final turn. Stall speed scales with the square root of load factor: at 60° bank
(2 g) it is 41% higher; at 45° (1.41 g) 19% higher. Source: FAA Pilot's Handbook of
Aeronautical Knowledge, ch. 5 "Load Factor and Stalling Speed" and the stall-speed-versus-bank
table, https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/phak and
FAA-H-8083-3B ch. 4. The sim's lift model is CL·q·S, so this should pass on both models, which
makes it a cheap regression net for 0040-style flap or CLmax edits.

## What
`tests/flight/c172.test.js` plus a small harness helper (`stallInTurn(bank)` in
`tests/flight/harness.js`): hold a coordinated level turn at the bank, bleed speed at ~1 kt/s
at constant altitude, record the IAS/CAS at the break (CL at CLmax, same detection as the
existing stall cards). No `src/` change unless a card fails; if it does, mark `it.fails` with
the measured number and file a ticket.

## Acceptance criteria
- [ ] At 45° and 60° bank, flaps up, the stall CAS is within ±10% of 53·√(1/cos(bank)) KCAS (63, 75 KCAS), on flightModel and on JSBSim.
- [ ] Each card cites the handbook table in its title or comment.
- [ ] Full `tests/flight` stays green (no card regressed), added runtime under 20 s.

## Test plan
The two cards above, parameterized over both models like the existing stall cards.

## Out of scope
Spin entry, cross-control stalls, any change to the Learner/Kid bank envelope.
