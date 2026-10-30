---
id: 0121
title: F-16 fly-by-wire limits a full pull to 9 g and 25° AoA
status: proposed
priority: P2
size: M
lens: authenticity
created: 2026-10-30
pr:
---

## Why
Found carding 0118. In Pilot, the F-16's stick is a raw stabilator: full back stick at 450 kt and
15,000 ft pulls ~14 g by 1 s, then α runs through the 28° stall to 90° and the nose goes over the
top; at 150 kt the same pull goes to α 90° too. The real airplane's flight control system flies
the stick as a load-factor command, limited to 9 g (USAF fact sheet: "can withstand up to nine
G's", https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104505/f-16-fighting-falcon/) and,
slow, to α 25° (NASA TP-1538 p. 12, https://ntrs.nasa.gov/citations/19800005879). A kid pulling
full back should get a hard, bounded pull, and a pilot should not be able to tumble a Viper with
one hand. `tests/flight/f16.test.js` "KNOWN GAP (0121)" measures both.

## What
On `spec.pitchFbw` airframes (`src/flightModel.js`), turn the stick into a command: stick → a
load factor (full back = 9 g) blended with an AoA limit (25°), whichever is less, with a pitch-
rate loop that holds it. Read the command-law shape (gains, the AoA/g blend) from TP-1538's
flight control description or Stevens & Lewis' F-16 model; cite what you use. Kid and Learner
envelopes (`src/assists.js`) stay as they are on top. A released stick keeps today's behaviour
(the FBW trims itself, 0090).

## Acceptance criteria
- [ ] The two `KNOWN GAP (0121)` cards pass as `it` (≤ 9.5 g at 450 kt; α ≤ 26° at 150 kt)
- [ ] The 0118 card "at least 7.5 g" still passes, and the F-16 zoom card does not regress
- [ ] The HUD's G readout in the game peaks near 9 on a full pull (e2e or a scratch run)

## Test plan
Promote the two `it.fails` cards; add a card that a held full pull settles near 9 g (not just a
peak), and one that a released stick from a 5 g pull returns toward 1 g.

## Out of scope
Rolling g limits, the CAT III store limiter, departures and spins, g-LOC visuals.
