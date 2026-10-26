---
id: 0091
title: A bounced landing is noticed, coached and graded
status: ready
priority: P1
size: M
lens: player-feel
created: 2026-10-26
pr:
---

## Why
`landing.js` grades the first touchdown only, and `coach.js` has no prompt for a bounce, so
a player who skips back into the air gets the rollout prompts at 10 ft, a second hard hit
and a grade that never mentions the bounce. It is the most common real landing error and the
one a first-timer makes most: the FAA Airplane Flying Handbook describes the bounce and the
porpoise that follows a bad recovery, and the standard advice is to hold attitude and add a
little power for a small bounce, and go around after a second one (Sporty's:
https://www.sportys.com/blog/how-do-i-recover-from-a-bounced-landing-/ ; AOPA quoting the
AFH: https://aopa.org/news-and-media/all-news/2014/june/flight-training-magazine/accident-report ;
FAA NSPB 17-01 makes bounce recovery a required sim task:
https://www.faa.gov/sites/faa.gov/files/about/initiatives/nsp/bulletins/17-01.pdf).

## What
Pure `bounceTracker` in `src/landing.js` (wheel height as in LESSONS 2026-10-21: use
`pos.y - groundY - spec.gearHeight`, never `aglFt`): a bounce is a touchdown followed by
airborne above 2 ft for ≥ 0.3 s before the rollout. Count them. `coach.js` gets one prompt
per case: first bounce "Bounced: hold the attitude, add a little power" (nose-down on the
climb is wrong, so do not say "pitch down"), second bounce "Go around". The results card
shows "Bounced ×n" and the grade is capped at C for one bounce, D for two or more. The
touchdown-rate/zone scoring stays on the first touchdown.

## Acceptance criteria
- [ ] Unit: a wheel-height trace with a 3 ft, 0.5 s hop after touchdown counts 1 bounce;
      a trace that never leaves 1 ft counts 0; a strut rebound under 0.3 s counts 0
- [ ] Unit: grade caps (C for 1, D for 2+), no cap for 0
- [ ] Coach prompts appear only while airborne after a first touchdown and clear on the rollout
- [ ] Flying a deliberately hard flare on the C172 and the 737 (headless harness) bounces ≥ 1
      or documents that it does not (no false positives on the 35C and 35C flare missions flown by the autopilot)
- [ ] Works at 390x844 touch and 1280x720: the results card line fits without scroll
- [ ] No per-frame allocation in the tracker

## Test plan
`tests/unit/landing.test.js` for the tracker and caps; `tests/unit/coach.test.js` for prompts;
an e2e on the results card text with a scripted bounce via the debug hook.

## Out of scope
Changing the gear or bounce physics (a gap goes in as an `it.fails` card with its own ticket).
