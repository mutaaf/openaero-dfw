---
id: 0107
title: Rejected takeoff drill: an engine fire before V1, stop the 737 on the runway
status: shipped
priority: P2
size: M
lens: content
created: 2026-10-29
pr: 125
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
- [x] `?mission=kdfw_35c_rto` and the picker start it (in the KDFW group, beside the go-around drill: the Drills group is for drills away from an airport); boot JS within budget (+0.3 kB)
- [x] The failure fires once, at the scripted speed, with the HUD warning and a coach call
- [x] Idle + full braking stops the 737 with runway left (headless flight card, pure pilot)
- [x] Doing nothing, or rotating, grades D with the reason on the results card ("still rolling at the end", "took off after the failure")
- [x] Reaction time and stop distance appear on the card
- [x] Works at 390x844 touch and 1280x720 keyboard

## Test plan
Unit: the drill state machine and grade (reaction, overrun, rotated). Flight card in
`tests/flight/` flying the roll with a scripted pilot (stop vs no-stop). e2e: the mission
starts, the warning appears, a held-brake pilot gets a graded card.

## As built
- `src/rto.js` (lazy chunk): `createRto` draws the fire speed (75-110 kt, below V1 = Vr - 3 =
  132 kt); `stepRto` fires once on the runway at that speed, times the reaction to idle (the levers
  closed) and the brakes, tracks the centreline, and ends at the stop, an overrun, off the side
  (both mains past the edge) or a takeoff (wheels > 15 ft, or airborne past the end). `gradeRto`: reaction 40%, stop 40%
  (against a reference: 2.5 s at the failure speed, then autobrake MAX's 14 ft/s², which a 1 s
  autobrake MAX stop matches within 10% in the flight card), centreline 20%; overrun, off or took off
  capped at D with the reason. Coach words and ranks join coach.js `DRILL_TEXT`/`RANK` from the
  chunk; each step of the reject (idle, brakes, reverse, straight) replaces the last at once.
- The fire is a warning, not a lost engine: the engine keeps its thrust until the levers close,
  as a real fire bell (the model has one thrust lever for both engines, no asymmetric thrust).
  The HUD banner says `ENGINE FIRE — IDLE, BRAKES` until the thrust is idle (2 s at least): on a
  phone held sideways alerts take the coach's slot, and the coach has the rest of the reject.
- Kid: from the fire to the stop the plane holds the thrust at idle and autobrake MAX (the RTO
  setting's effect), whatever the throttle is pushed to; its banner says only ENGINE FIRE; the card
  says so and scores the reaction as the plane's.
- The reaction is the levers coming back (a key's first tenth of travel), not the time Ctrl takes
  to wind them to idle; Ctrl+R and Ctrl+B no longer reload or bookmark the page. A D for running
  off names the real fault (never idled, never braked); a slow stop names its weakest part.
- Known: the 737 has no RTO autobrake setting (MAX disarms on takeoff thrust), and no fire bell
  (the coach speaks the call).
- Flight cards (tests/flight/rto.test.js): the 737's accelerate-stop per 14 CFR 25.109 (idle and
  maximum braking at V1, no reverse, + 2 s at V1) is 5,006 ft against Boeing's 5,100 ft field
  length at 65 t (ACAP §3.3.29); a second's hesitation at full thrust past V1 would need
  ~5,370 ft. The drill's worst case (110 kt, 1 s) stops with ~9,900 ft of 35C left and grades S.

## Out of scope
Engine failure after V1 (0104 covers climbing away on one engine); tyre/brake fire damage.
