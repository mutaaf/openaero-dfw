---
id: 0129
title: 737 ceiling at 65 t: a cited buffet boundary or stratosphere thrust point closes the last ~70 fpm above FL410
status: proposed
priority: P2
size: M
lens: authenticity
created: 2026-10-31
pr:
---

## Why
Found shipping 0120. With CFM's FL350 thrust (0116) and the Korn/Lock drag rise from cited 737
geometry (0120), the 65 t 737 still climbs at ~+67 fpm on full thrust at FL420, Mach 0.79, and holds
Mach 0.79 level to about FL426, above the FL410 maximum operating altitude (EASA TCDS IM.A.120 p. 28;
EUROCONTROL APD ceiling FL410). At MMO 0.82 it only just holds FL410 on full thrust (+18 fpm; fails by ~FL415). `tests/flight/b738.test.js`
"KNOWN GAP (0129)" measures it. Two uncited parts remain: there is no high-speed buffet boundary
(a real crew's maximum altitude keeps a 1.3 g buffet margin), and the thrust above FL350 is one σ^0.94
exponent fitted at FL350 only (Mattingly eq. 2.45a lapses ~10% faster by FL420).

## What
Find a cited figure: a 737-800 maximum-altitude-vs-weight table (FCOM PI, buffet and thrust limited),
a CFM56-7B thrust point above FL350, or a published buffet-onset CL vs Mach for the NG wing. Model only
what the figure supports; do not tune κA or t/c (0120's are cited) to pass the card.

## Acceptance criteria
- [ ] The KNOWN GAP (0129) card passes, or is re-pinned to a cited max-altitude figure at 65 t
- [ ] CFM's FL350 thrust card, the FL350 cruise cards and the drag-rise card still pass

## Test plan
`tests/flight/b738.test.js`; a unit test for any new buffet or lapse function.

## Out of scope
A stick shaker or buffet sound; the F-16 and C172.
