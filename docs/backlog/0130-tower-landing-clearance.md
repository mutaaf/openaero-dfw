---
id: 0130
title: The tower clears you to land: a spoken, captioned landing clearance on every final
status: ready
priority: P2
size: S
lens: authenticity
created: 2026-11-01
pr:
---

## Why
A pilot who flies a real final hears one call that this sim never makes: the tower's
landing clearance ("Cessna 172, DFW Tower, wind 350 at 10, runway 35 centre, cleared to
land"). It tells the player the wind and the runway in the words they will hear in real
life, which is the vocabulary a kid needs for the first lesson and a pilot expects. The
structure is fixed by FAA JO 7110.65 §3-10-5 (landing clearance; the runway, and the wind
when it changed) and AIM 4-4-1 phraseology: https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap3_section_10.html
Speech and captions are already there (audio.js speechSynthesis, captions.js); nothing
new on the network.

## What
A pure `towerClearance(state)` in `src/captions.js`'s neighbourhood (a lazy chunk, boot
budget has 6 B headroom) builds the line from the active runway end, the METAR wind and the
aircraft type, spoken once on a steady final at about 2 NM or 800 ft AGL, never in a drill
that already speaks (go-around, dead stick, engine out, RTO, windshear). Runway words use
"centre/left/right" like the chart. Captioned by the existing caption slot. No ATC reply
needed; Kid and Learner get the same words.

## Acceptance criteria
- [ ] On the KDFW 35C 4 NM final the clearance is spoken once, as "... runway three five centre, cleared to land", with wind from the METAR (or the scenario wind, labelled as such)
- [ ] Heading and runway number come from the active end, so 17R, 18L, 13R, 16 etc. read correctly (unit test per end)
- [ ] Not spoken in missions whose own coach speaks, nor after a go-around until a new final is picked
- [ ] Caption shows for the speech's duration; sound off still shows the caption
- [ ] Boot JS stays within budget (`npm run check:fast`)

## Test plan
Unit: `towerClearance` for each runway end of the six airports (words, wind). e2e: the
final mission has the caption in the DOM at 2 NM using `openaeroDebugFinal`.

## Out of scope
Pilot read-backs, ground/clearance delivery, ATIS (0030), other traffic calls.
