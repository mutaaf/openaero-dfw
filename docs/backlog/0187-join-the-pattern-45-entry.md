---
id: 0187
title: Join the pattern: fly the 45° entry to Addison's downwind, coached
status: ready
priority: P2
size: M
lens: content
created: 2026-11-15
pr:
---

## Why
The pattern mission (0048) starts the player already on downwind. At a field with no tower
(Addison has one, but the entry is the same skill at Arlington or Gainesville) the first thing
a pilot flies is the join: arrive at pattern altitude, aim at the runway midpoint at 45° to the
downwind, level, then turn onto downwind. It is a standard private-pilot item and a place where
real pilots collide. Source: FAA AC 90-66C, https://www.faa.gov/media/13671 (the 45° entry to
downwind at the midpoint, at pattern altitude; read the AC before writing text, the web summaries
disagree on the midfield-crossing alternative, so teach only the 45° entry) and Boldmethod's
overview https://www.boldmethod.com/learn-to-fly/maneuvers/how-to-fly-a-traffic-pattern-at-non-towered-airports/.

## What
New mission `pattern_entry_kads` (Cessna, KADS, Drills or the Addison group): spawn 4 NM out,
1,000 ft AGL (the AC's pattern altitude, as pattern.js already uses), 90 KIAS, heading the join
point. A pure helper in `src/pattern.js` (`entryLeg`) names `inbound`, `entry45` (within ±30° of
the 45° line to the midpoint, on the downwind side), `downwind` and hands over to the existing
`patternLeg` once established. Coach words: "Level at 1,000 ft, aim at the middle of the runway",
"Join: turn onto downwind", then the existing pattern prompts. Grade (reusing the landing card):
entered the downwind at pattern altitude ±100 ft, 45° entry within ±20°, speed band, then the
normal landing. Kid's guide flies the join. Lazy chunk; no physics change.

## Acceptance criteria
- [ ] `entryLeg` unit tests for both traffic directions of KADS 16/34 (left or right pattern)
- [ ] A scripted pilot who flies the 45° entry then the pattern lands and grades; one that dives to pattern altitude through the entry or joins on a straight-in base is told so on the card
- [ ] Appears in the picker with a blurb; own personal best key
- [ ] Works at 390x844 touch and 1280x720 keyboard; boot JS budget unchanged

## Test plan
tests/unit/pattern.test.js for `entryLeg`; tests/flight scripted pilots both ways; e2e loads the mission and asserts the first coach prompt and the card.

## Out of scope
Midfield crossover entry, radio calls, other traffic in the pattern.
