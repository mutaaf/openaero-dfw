---
id: 0107
title: Rejected takeoff drill: an engine fire at 70 knots, stop the 737 on the runway
status: ready
priority: P2
size: M
lens: content
created: 2026-10-29
pr:
---
## Why
Every mission so far is about landing or climbing. The decision a line pilot is trained hardest
on is the other half of the runway: stop below V1, go above it. The FAA's Takeoff Safety
Training Aid (1993) was written because wrong go/no-go decisions caused accidents, and says to
reject below V1 for a serious failure and to continue after V1 unless the airplane is unsafe
to fly (summary: https://skybrary.aero/articles/rejected-takeoff-oghfa-se). The sim already has
takeoff callouts (0035), autobrake MAX/RTO, reversers and brake anti-skid (0072), so the
pieces exist; nothing asks the player to use them at 120 kt on a hot brake. A kid learns that
the airplane can stop; a pilot gets a drill with a number to beat.

## What
Mission `kdfw_35c_rto` (Drills group, lazy chunk like `goAround.js`/`stallDrill.js`, new
`src/rto.js`): the 737 on the 35C threshold, a takeoff roll that starts for the player; at a
scripted speed below V1 (default 85 kt, random 75-110 within the 737's V1) a failure
callout/warning fires ("ENGINE FIRE", engine on one side loses thrust through `sim.engineFailed`
style flag, as deadStick.js). The player must idle, brake/reverse and stop on the runway. Pure
state machine (armed -> failure -> stopped/overrun) + grade: reaction time (failure to first
brake/idle input), stop distance against the runway remaining, centreline drift, a capped D if
the player rotates and takes off. Kid: autobrake RTO applies itself. Coach text via
`DRILL_TEXT` (0036 pattern) so boot JS does not grow.

## Acceptance criteria
- [ ] `?mission=kdfw_35c_rto` and the picker's Drills group start it; boot JS budget unchanged
- [ ] The failure fires once, at the scripted speed, with the HUD warning and a coach call
- [ ] Idle + full braking stops the 737 with runway left (headless flight card, pure pilot)
- [ ] Doing nothing, or rotating, grades D with the reason on the results card ("still rolling at the end", "took off after the failure")
- [ ] Reaction time and stop distance appear on the card
- [ ] Works at 390x844 touch and 1280x720 keyboard

## Test plan
Unit: the drill state machine and grade (reaction, overrun, rotated). Flight card in
`tests/flight/` flying the roll with a scripted pilot (stop vs no-stop). e2e: the mission
starts, the warning appears, a held-brake pilot gets a graded card.

## Out of scope
Engine failure after V1 (0104 covers climbing away on one engine); tyre/brake fire damage.
