---
id: 0160
title: A check that every KNOWN GAP card names a live backlog ticket
status: ready
priority: P1
size: S
lens: tech-health
created: 2026-11-05
pr:
---

## Why
Pillar 0 says known gaps are written down, not hidden. There are ~26 `it.fails` cards across `tests/flight/`, each titled `KNOWN GAP (NNNN)`. Nothing stops a ticket being marked shipped or dropped while its card still says the gap is open (or a card keeping a ticket number that never existed), so the ledger can rot silently. A card that starts passing already fails the suite (vitest `it.fails`), but a dangling pointer does not.

## What
`scripts/check-gaps.mjs` (same style as `check-backlog.mjs`): scan `tests/**/*.test.js` for `it.fails(` titles containing `KNOWN GAP (NNNN)` (also accept `NNNN, NNNN`), and require each `docs/backlog/NNNN-*.md` to exist with status `ready`, `proposed` or `in-progress`. Print a table (card, ticket, status) and exit 1 on a dangling or closed ticket. Add it to `npm run check:fast`.

## Acceptance criteria
- [ ] Passes on main today (fix any title that points at a closed ticket in the same PR, by retargeting or filing)
- [ ] An `it.fails` without a `KNOWN GAP (NNNN)` tag also fails the check
- [ ] A unit test feeds the parser fixture strings (good, dangling, closed, untagged)

## Test plan
`tests/gaps.test.js` for the parser; the script itself runs in `check:fast`.

## Out of scope
Rewriting the cards; any change in `.github/workflows/` (frozen): the script runs through the existing `check:fast` step.
