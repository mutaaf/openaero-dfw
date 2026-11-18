---
id: 0202
title: C172 flightModel.js has no α-rate pitch damping: add Roskam's Cmα̇ (−5.2) and re-centre the power-off 180 coach it moves
status: shipped
priority: P1
size: M
lens: authenticity
created: 2026-11-18
pr: 283
---

## Why
Found by 0170. Full back stick held from Vr, flightModel.js overshoots the ~19° angle of attack the
post-stall break settles at: 20.4 / 20.1° (flaps 0 / 10), where JSBSim's C172 peaks at 18.9 / 19.1°.
JSBSim flies Roskam's Cmα̇ −5.2 (public/jsbsim/aircraft/c172/c172.xml `aero/coefficient/Cmadot`);
flightModel.js has no α-rate term. At Vr its pitch damping, `pitchDamping · V/120`, is ~0.93/s, against
~3.1/s for Roskam's Mq + Mα̇ (Cmq −12.4, Cmα̇ −5.2, c̄ 1.47 m, Iyy 1,825 kg·m², 57 KIAS). So past the
stall the short period is lightly damped (ζ ~0.3) and it rings 2-3° of pitch at lift-off.

## What
Add Cmα̇ in real units to the pitch rate (src/flightModel.js), C172 only (`spec.cmAlphaDot: -5.2` in
src/aircraft.js). 0170 measured this patch:

```js
let adotQ = 0;
if (spec.cmAlphaDot && airspeed > 10 && body.aoaPrevRad != null) {
  // α̇ from the step-to-step α, smoothed over 0.08 s (short of the ~0.15 s the downwash takes to
  // reach the tail at Vr): unsmoothed, the tail-strike sub-step card's 1/60 s peak ran 1.5x 1/180 s's.
  body.aoaRateF = (body.aoaRateF ?? 0) + (MathUtils.clamp((aoaRad - body.aoaPrevRad) / dt, -2, 2) - (body.aoaRateF ?? 0)) * Math.min(1, dt / 0.08);
  const cbar = spec.wingAreaM2 / spec.wingSpanM;
  adotQ = qDyn * spec.wingAreaM2 * cbar * spec.cmAlphaDot * (cbar / (2 * airspeed)) * body.aoaRateF / spec.inertia.pitch;
}
body.aoaPrevRad = aoaRad;
// …
body.angVel.x += (qRate + adotQ) * dt;
```

Also weigh (0170's physics panel):
- The shortfall is pitch damping in general. Roskam's Mq alone is ~2.1/s at Vr against the model's 0.93/s total, so a speed-scaled pitchDamping is an alternative to Cmα̇, or a companion to it.
- Use JSBSim's c̄, 4.9 ft = 1.494 m (c172.xml), not S/b = 1.473 m.
- The 0.08 s α̇ smoothing sits on top of a term that already stands for the downwash lag, and it was picked against the tail-strike card. Justify it or drop it.

Before it ships (0170's device panel):
- Guard `dt > 0`: a zero step gives NaN, `MathUtils.clamp` keeps NaN, and `angVel` stays NaN for good (systems.js:106 guards the same way).
- Reset `aoaPrevRad` and `aoaRateF` on every teleport: loadScenario, the power-off 180 hold, upset.js, deadStick, an FDM switch. Otherwise the clamped ±2 rad/s spike kicks the pitch by up to ~3 rad/s².
- Initialise both in makeBody / the sim's body, not lazily.
- Stability is fine: gain × dt ≈ 0.04 at a 1/60 s sub-step.

What it does:
- Peak α 18.9 / 18.7° (JSBSim 18.9 / 19.1°). The two `KNOWN GAP (0202)` α cards in
  tests/flight/c172.test.js pass.
- Peak pitch under 5 ft 23.3 / 24.4° (was 24.7 / 25.0°).
- The rotation is 32.6°/s (JSBSim 40.7, card ±30%).
- The tail strike is 9.3 / 11.0 kN at 1/180 / 1/60 s.
- Va: 2,200 lb 3.52 g.
- The hands-off phugoid and pattern cards hardly move.

What it breaks (the reason it did not ship in 0170):
- **tests/flight/power180.test.js.** The coached glide lands ~170 ft shorter in calm air (−89 ft, was
  +83) and with the wind behind on final (340°/5: −115 ft). The headwind cases barely move.
  - The cause: the test pilot's round-out arrives at ~270 fpm and, on main, nearly touches at 0.6 ft,
    balloons and floats ~170 ft more. With Cmα̇ the nose comes up a little later, and it touches there.
    The coach's FLOAT_M / TURN_FT were fitted to that hop.
  - Swept TURN_FT 150-180, FLOAT_M 45-100 and FLAPS_FT 5-15. 340°/5 always lands 210-230 ft short of
    the calm case, so no setting puts calm in 0-200 ft and every 5-10 kt case in 0-250 ft. Some
    examples (calm, 160/5, 340/5, 250/5, 070/5, 160/10, 340/10, 250/10, 070/10):
    - TURN 160 / FLOAT 80: 192 215 −23 199 200 101 11 184 200
    - TURN 158 / FLOAT 85: 190 205 −30 194 193 69 −19 182 191
    - TURN 180 / FLOAT 65: −32 188 −12 −57 −27 226 212 −76 −39
  - A firmer, earlier test-pilot round-out (not a hop) may be the real fix. Read the 0189 lesson first.
- **tests/flight/kidFinal.test.js:** Kid's Cessna, 15 kt from 070°, grades A 94 against calm's S 95.

## Acceptance criteria
- [ ] Both `KNOWN GAP (0202)` α cards in tests/flight/c172.test.js pass (within 0.75° of JSBSim) and become plain cards
- [ ] The power-off 180 cards green, with the coach re-centred on a round-out that does not hop (the main wheels' radio altitude never rises again after first dropping below 1 ft), and tests/e2e/power180.spec.js (Kid) re-run
- [ ] tests/flight/kidFinal.test.js: Kid's 15 kt / 070° Cessna final still grades the same as calm (S 95)
- [ ] Every other card in `npm test` unchanged or better; tests/flight/c172.test.js 0144 tail-strike cards green at both sub-steps

## Test plan
`npx vitest run tests/flight` (c172, power180, kidFinal, pattern), tests/e2e/power180.spec.js and takeoff.spec.js.

## Shipped (2026-11-18)
Roskam's Cmα̇ −5.2 in flightModel.js (C172 only, `spec.cmAlphaDot`), α̇ from step to step smoothed over 0.08 s,
each sample held to ±2 rad/s; `dt > 0` guarded; `aoaPrevRad`/`aoaRateF` initialised on every body (main.js,
traffic.js, harness.js) and cleared on every teleport (loadScenario, setAircraft, each JSBSim step, upset.js,
power180.js's hold, deadStick.js debugFinal). Peak α at Vr full aft 18.9 / 18.7° (JSBSim 18.9 / 19.1°): both α
cards are plain `it`s; the pitch cards stay KNOWN GAP (0203), 23.3 / 24.4° against 20.0 / 21.7°.
- c̄ is the spec's own S/b (1.473 m), not JSBSim's 4.9 ft (1.494 m, 2.8% more moment). The tail-strike sub-step
  card is the contact spring sampled at a random phase: with 1.494 m flaps 10 read 7.4 / 12.5 kN at 1/180 / 1/60 s
  (over its 1.3x), with 1.473 m 7.8 / 6.5; c̄ 1.40-1.55 flip it either way with the same pitch-down rates. The
  0.08 s smoothing: 0.04-0.25 s all move the α cards < 0.2°.
- The power-off 180 test pilot's round-out starts at 20 ft (AFH's 10-20 ft; from a ~1,000 fpm flaps 30 glide), not
  15: from 15 ft main's hit at 0.6 ft and hopped 1.2 ft; with Cmα̇ it never held off (63 KIAS). New card check: no
  hop. Coach re-centred: FLOAT_M 95 → 101, TURN_FT 170 → 160, Kid's turn TURN_FT − 65 (95 ft, as before). Calm +152,
  5 kt +152 to +172, 10 kt +28 to +228 ft. Kid e2e 87-168 ft over 5 runs (main 113-173).
- Kid's Cessna flare profile 0.2 → 0.18 (`kidFlarePerS`): the default touched 4-9 fpm firmer with Cmα̇ (15 kt from
  070° A 94); 0.18 lands calm at −186 fpm (main −185) and every crosswind case S 95.
