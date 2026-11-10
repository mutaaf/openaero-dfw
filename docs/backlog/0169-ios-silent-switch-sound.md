---
id: 0169
title: Sound plays on an iPhone with the silent switch on (Web Audio's audio session set to playback)
status: ready
priority: P1
size: S
lens: accessibility
created: 2026-11-10
pr:
---

## Why
The pillar is "flyable on any device", and the people to impress hold an iPhone. On iOS, Web
Audio is treated as ambient by default: with the ringer switch on silent (how many kids and
parents keep their phone), the whole game goes mute: the coach voice, GPWS callouts, engine
note, stall horn and the new touchdown chirp (0147) all disappear, with nothing telling the
player why. WebKit maintainers say setting `navigator.audioSession.type = 'playback'` makes
the sound ignore the mute switch (Safari 16.4 partial, iOS 17+ full). A grep of `src/` finds
no `audioSession` use. Sources: https://developer.mozilla.org/docs/Web/API/AudioSession/type ;
https://w3c.github.io/audio-session/ ; WebKit bug https://bugs.webkit.org/show_bug.cgi?id=237322
("webaudio api is muted when the iOS ringer is muted"). Support is only in Safari today, so
feature-detect and do nothing elsewhere.

## What
`src/audio.js`: where the AudioContext is created or unlocked from the first user gesture,
set `navigator.audioSession.type = 'playback'` inside a try/catch when the property exists.
Respect the in-game sound toggle: when sound is off, set it back to `'auto'` so the game does
not hold the phone's audio focus, and set it to `'ambient'` while paused/hidden if the
existing pause-when-hidden code (0032) suspends the context. No new dependency, no network.

## Acceptance criteria
- [ ] With a stubbed `navigator.audioSession`, starting a flight sets `type` to `'playback'`
- [ ] Turning sound off sets it to `'auto'`; turning it on sets `'playback'` again
- [ ] Without `navigator.audioSession` (desktop Chromium, Firefox) nothing throws and nothing changes
- [ ] No change to audio on desktop; boot JS stays under its budget (see 0084 / 0105)

## Test plan
A unit test (vitest, jsdom or a stub on `globalThis.navigator`) for the type transitions; an e2e
check that loading and starting a flight with the stub present logs no error. A real iPhone
check cannot run in CI: say so in the PR body.

## Out of scope
Background audio after the page is hidden (the AudioContext still suspends then); a
"sound is off" on-screen hint (a later ticket if players still report silence).
