---
id: 0060
title: Night and dusk approaches that use the runway lights
status: shipped
priority: P2
size: M
lens: content
created: 2026-10-20
pr: 158
---

## Why
The real sun, the night sky (0055) and runway/approach lights (0011) all shipped, but no
mission starts at night: the picker (`src/missions.js`) has only the time-of-day switch,
so the lights are something a player must go looking for. A night ILS final to 35C with
ALSF-2 sequenced flashers and the PAPI is the most spectacular, and most real, thing the
sim now does. Night VFR into a lit field is also what FAA's Airplane Flying Handbook
(ch. 11, Night Operations) teaches: https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/airplane_handbook

## What
Add two missions: "KDFW 35C night ILS (4 NM)" and "KDAL 31R dusk final", each setting its
own sun preset (Night / Dusk) for that run only, without overwriting the player's When? choice.
`missions.js` carries an optional `sun` field; main.js applies it on load.

## Acceptance criteria
- [x] Both appear in the start screen under their airport
- [x] Starting one shows the preset's sky and visible approach/edge lights at 4 NM (pixel test pinned at FULL_RES, with a lights-off control per the 2026-10-19 lesson)
- [x] The player's When? selection is restored afterward
- [x] Personal bests keyed separately from the day mission
- [x] No frame-time regression; works at 390x844 and 1280x720

Built note (2026-11-02): the Dusk preset puts the sun 2.5° up, before sunset, so the runway
lights (on from nightness > 0.02, the sun below ~+0.8°; FAA JO 7110.65 §3-4 runs them sunset to
sunrise) stay off
on the dusk final; the lit-pixel test with its lights-off control is the night mission's. The dusk
mission's blurb promises the sky, not the lights.

## Test plan
Unit: mission table has `sun` validated against the presets. e2e: load each, assert preset and lit-pixel count above the lights-off count.

## Out of scope
New lights, a night-specific aircraft panel, moon-phase selection.
