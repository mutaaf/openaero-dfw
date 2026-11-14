---
id: 0179
title: Ground effect on induced drag matches the published curve (flight card, and a formula check)
status: shipped
priority: P1
size: S
lens: authenticity
created: 2026-11-12
pr: 255
---

## Why
`src/aero.js` `groundEffectFactor` returns `(r / (1 + r))²` with `r = 16h/b`. The
McCormick form usually quoted is `r² / (1 + r²)`, a different curve: at h = b/4 (r = 4) the
code gives 0.64 (36% less induced drag) where `r²/(1+r²)` gives 0.94 (6% less). The FAA's
Airplane Flying Handbook gives a table of induced-drag reduction against wing height as a
fraction of span (read it before writing the card; the figures are quoted from memory as about
1.4% at one quarter span and tens of percent only below a tenth of a span). If the model is far
off, the flare float (0085, 0098) and every landing-distance card is tuned around a wrong
curve. Source: https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/airplane_handbook/10_afh_ch5.pdf
("Ground effect"; confirm chapter and wording in the PDF) and McCormick, Aerodynamics,
Aeronautics and Flight Mechanics.

## Source used (Builder, 2026-11-14)
The figures are in the Pilot's Handbook of Aeronautical Knowledge (FAA-H-8083-25C) ch. 5, "Ground
Effect" (https://www.faa.gov/sites/faa.gov/files/07_phak_ch5.pdf), not the Airplane Flying Handbook
(that URL 404s): 1.4% at one span, 23.5% at a quarter, 47.6% at a tenth. The card cites PHAK.

## What
A unit card (`tests/unit/` or `tests/flight/`) that tabulates `groundEffectFactor` at
h/b = 1, 1/2, 1/4, 1/8, 1/10, 1/20 for the C172 (b ≈ 11 m), 737 and F-16 and compares the
induced-drag reduction (1 - factor) with the cited table within a stated tolerance. If the
curve is wrong, ship it as `it.fails('KNOWN GAP (<ticket>) ...')` with a follow-up ticket;
fixing it moves flare and landing-roll cards, so do the fix in its own PR with those cards
re-measured. Note `Math.max(1.0, heightM)` clamps at 1 m: say what the clamp does at each span.

## Acceptance criteria
- [ ] A card prints the factor at each h/b and compares with the cited figures.
- [ ] A mutation (return 1 everywhere) fails it.
- [ ] `node scripts/check-gaps.mjs` passes.

## Test plan
`npm test`; the PR body lists the table (model vs source).

## Out of scope
Ground effect on lift and pitching moment; changing the curve in this PR if it fails.
