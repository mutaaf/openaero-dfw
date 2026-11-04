---
id: 0148
title: The engine sound follows the real engine: prop RPM and jet spool, per aircraft
status: ready
priority: P2
size: M
lens: player-feel
created: 2026-11-04
pr:
---

## Why
`src/audio.js` drives one sawtooth oscillator from the throttle lever alone (`basePitch +
thr * 240`, base 65 Hz Cessna / 120 Hz everything else). The airplane's engine does not
move like the lever: the 737's and F-16's turbofans spool up over seconds (`spoolEngine`,
`sim.engineN`), and the Cessna's fixed-pitch prop gains RPM as it speeds up (`engine.js`
header: static ~2300 rpm, unloading in a dive). A pilot hears all of that, and it is how
you know without looking that the power is coming, that you are overspeeding in a dive, or
that the engine is dead. A first-timer on Learner reads it as feel. Reference for the
approach: a blade-pass tone at RPM x blades plus filtered noise scaled by airspeed
(https://www.redblobgames.com/x/2147-webaudio-motor/ and the FlightGear note that spinning
props want noise scaled by rpm, https://wiki.flightgear.org/Hackathon_Proposal:Realtime_Engine_Sounds).

## What
In `audio.js`, drive the engine voice from the spooled state, not the lever: for
`piston-prop`, blade-pass Hz = rpm x 2 blades / 60 with rpm from a small pure function
(`engineRpm(spec, n, tasMps)` in `engine.js`, tested) that matches the static 2300 rpm and
rises as the prop unloads; for `turbofan`, a whine whose pitch and a filtered-noise gain
follow `n` (the spool lag is audible), lower and rounder for the 737, rasp for the F-16
afterburner range. A dead engine (0036) winds down with the prop windmilling. No new
assets: Web Audio synthesis only, same nodes, no per-frame allocation. Boot JS budget
unchanged (any growth goes in a lazy chunk).

## Acceptance criteria
- [x] `engineRpm` is 2300 rpm (+-50) at static full power for the C172 and rises with TAS
- [x] Brisk throttle step on the 737: the voice's frequency target follows `sim.engineN`, not the lever (unit, with a fake AudioContext)
- [x] Engine-failed Cessna: pitch decays to windmill value, not to silence at once
- [x] Sound off (`sim.audioEnabled` false) and `mute()` still silence it
- [x] Boot JS within the budget in AGENTS.md

## Test plan
Unit: `engineRpm` values; `tests/unit/audio.test.js` with the existing fake context: step
the throttle, assert frequency targets lag via `n`. No e2e change.

## Out of scope
Recorded samples, Doppler, cockpit/external mix, gear and tyre noise (0149).

## Shipped notes
`engineRpm(n, tasMps, sigma, running)` lives in the lazy `src/engineSound.js`, not `engine.js`:
engine.js is a boot module, and a lazy chunk importing a new boot export grows the boot chunk
(AGENTS.md § 5). No filtered-noise layer for the jets ("same nodes"): the existing low-pass opens
with N1 instead. A noise layer can come with 0149's rollout sound.
