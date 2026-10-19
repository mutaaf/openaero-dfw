---
id: 0020
title: Call "unstabilized" and "go around" on a bad approach, and grade it
status: shipped
priority: P1
size: M
lens: authenticity
created: 2026-10-17
pr: 39
---

## Why
Every real airline approach is judged against the stabilized-approach gate: by 500 ft AAE
in VMC (1,000 ft in IMC) the aircraft must be on the lateral and vertical path, between
Vref and Vref+20 kt, configured for landing, at or under 1,000 fpm sink, with appropriate
power; otherwise the call is "unstabilized, go around". Today the sim grades only the
touchdown, so a player can fly a wild approach and save it with a good flare. Teaching the
gate is the single most recognisable real procedure we are missing, and it makes a pilot
nod. Source: Flight Safety Foundation ALAR Briefing Note 7.1,
https://skybrary.aero/sites/default/files/bookshelf/864.pdf ; summary
https://wiki.ivao.aero/en/home/training/documentation/Stabilized_approach_criteria

## What
A pure function in `src/aero.js` (`stabilizedGate({aglFt, iasKt, vref, vsFpm, gearDown,
flapsOk, glideDevDots, locDevDots, vmc})`) returning `{ gateHeight, stable, failing[] }`.
`main.js` evaluates it once on crossing the gate height (500 ft AGL, or 1,000 ft when the
METAR ceiling/visibility is IMC-like) and: speaks/shows "UNSTABILIZED" with the failing
item(s) (HUD text and GPWS voice channel from ticket 0013), and records `stabilized: true/false`
on the landing result. The results card shows "Stabilized at 500 ft ✓/✗". Does not force a go-around.

## Acceptance criteria
- [x] `stabilizedGate` flags each criterion (speed < Vref or > Vref+20, sink > 1,000 fpm, gear/flaps not landing config, > 1 dot deviation) with a unit test per criterion
- [x] Gate height is 500 ft in VMC and 1,000 ft in IMC (ceiling < 1,000 ft or vis < 3 SM)
- [x] Autoland from the recommended mission passes the gate (e2e)
- [x] Results card shows the stabilized verdict; personal-best save data (`openaero_best` v1) is unchanged
- [x] Callout is evaluated once per approach, no per-frame allocations
- [x] Legible at 390x844 and 1280x720

## Test plan
Unit: table-driven `stabilizedGate` cases. E2E: recommended mission with autoland reports
`stabilized: true`; a mission started fast (IAS > Vref+30) at gate height reports false.

## Out of scope
Forcing an automatic go-around, go-around autopilot mode, IMC procedures.
