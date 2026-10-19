---
id: 0041
title: Spike JSBSim (WASM) behind the flight-model seam, judged by the flight cards
status: proposed
priority: P1
size: L
lens: authenticity
created: 2026-10-18
pr:
---

## Why
JSBSim is the most validated open-source flight dynamics model (FlightGear, NASA and
academic use): table-driven aero, real engines and propellers, multi-point gear, ISA.
Packaging it beats re-deriving it ticket by ticket. As of 2026-10-18: upstream v1.3.3
(LGPL-2.1) merged Emscripten portability (JSBSim-Team/jsbsim#1504); the official WASM +
TypeScript package is an open PR (#1507); `@0x62/jsbsim-wasm` 1.2.4-beta.4 works today
(482 kB gz WASM + 32 kB glue, single-threaded so no COOP/COEP, runs in Node).

**Needs the operator before `ready`:** licensing. The engine is LGPL-2.1 (fine as a
separate, replaceable `.wasm` with notice and source link); the stock aircraft XML
(c172x, 737, f16) declares GPL. Options: ship GPL XML as separate data files with notices,
or author our own XML from the same public data. Decide in a `proposal/` PR.

## What
Behind `?fdm=jsbsim` only: lazy-load the WASM after the player starts flying, map
`sim` controls/state to JSBSim properties in a `src/fdm/jsbsim.js` adapter that has the
same contract as `stepFlightModel`, keep terrain contact owned by our `ground.heightAt`
(JSBSim's ground callback reads it). Run `tests/flight/` against both models via a
harness adapter in Node; publish a comparison table in the PR.

## Acceptance criteria
- [ ] Default build unchanged; boot JS budget unchanged (WASM lazy)
- [ ] `?fdm=jsbsim` flies the C172 on the KDFW 35C final on desktop and iPhone-size touch
- [ ] Flight cards run against both models; comparison table in the PR
- [ ] License notices shipped in `public/CREDITS.md`; no GPL file shipped without the operator's decision
- [ ] No frame-time regression at 4x CPU throttle (device probe, 0044)

## Test plan
`tests/flight/` parametrised over models; an e2e that loads `?fdm=jsbsim` and asserts
the aircraft holds altitude for 10 s with zero console errors.

## Out of scope
Replacing the default model (a follow-up, if the cards say so).
