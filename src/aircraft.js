import { Vector3 } from 'three';

// Aerodynamic and handling parameters per airframe. Consumed by the 6-DOF integrator
// (main.js) and the pure aero helpers (aero.js).
export const AIRCRAFT_DATABASE = {
  b738: {
    name: 'Boeing 737-800 NG',
    massKg: 65000,
    wingAreaM2: 124.6,
    wingSpanM: 35.8,
    aspectRatio: 10.2,
    oswaldEfficiency: 0.82,
    cd0: 0.021,
    cl0: 0.28,
    clAlpha: 5.2,
    clMaxFlaps: 2.65,
    // The game's notches are flaps 0/10/30/40: 10 is a takeoff flap, 30 and 40 the real
    // landing flaps (finals spawn with 30, the airlines' usual one). Flaps 30/40 lift and
    // stall AoA fitted to Boeing (tests/flight/b738.test.js): Vref40 142 kt at MLW 66,361 kg
    // (ARC Rev A) and pitch +0.9° at Vref40+5 on a 3° path (VLA Table A6-1, winglets) give
    // ΔCL 0.856 and CLmax 2.42 (stall 14.1°); pitch +3.2° at Vref30 (same table), with the
    // same stall AoA (the slats are fully out at both), gives ΔCL 0.559: Vref30 150 kt at 65 t.
    // No public Vref30 exists: that shared stall AoA is an assumption, and it sets Vref30
    // (±1° of stall AoA moves it 6–12 kt).
    // Flaps 10 (the one takeoff notch, 0062): published crew speeds (VR ~145, V2 ~148 at 65 t,
    // flap not stated) ask for less lift, but Boeing's field length (optimum flap) allows
    // little: ΔCL 0.38 (Vs 125.5 kt, V2 142, +1.2 kt) with Vr 135 leaves 43 ft of its 5,100;
    // Vr 137 fails it. Most of 0062 is the Vr move; the rest waits for flaps 5 (0070).
    flapDetentsDeg: [0, 10, 30, 40],
    // Control-surface throws (°, surfaces.js; drawn on the stand-in only, the twin-jet model has
    // no separate surfaces yet): estimates, no public Boeing rigging
    // figures; the roll spoilers that help the 737's ailerons are not drawn.
    controlThrowsDeg: { aileronUp: 20, aileronDown: 15, elevatorUp: 20, elevatorDown: 15, rudder: 26 },
    flapCl: [0, 0.38, 0.559, 0.856],
    alphaStallDegByFlap: [14.8, 14.8, 14.12, 14.12],
    // Flaps 0/10/30/40 drag. Landing flaps on an airliner are draggy: with gear down at
    // Vref+5 the 737 flies at L/D ≈ 7.2 (flaps 30) / 6.7 (flaps 40) and needs ~25–30% thrust
    // (N1 ~55–60%) on a 3° path.
    flapCd: [0, 0.015, 0.077, 0.1],
    // Auto ground spoilers (ACAP §3.4.3 assumes them): on the ground with the thrust levers
    // at idle they deploy over ~1 s, dump most of the wing's lift onto the brakes and add
    // drag. An estimate (no public 737 spoiler data): 80% of the lift dumped (whatever the
    // flaps; never downforce), CL on the rollout ~0.15 at flaps 30.
    groundSpoilers: { liftDump: 0.8, dCd: 0.08 },
    // Systems (systems.js). Gear and flap travel times are estimates (no public Boeing
    // figures; crews quote ~7 s up, ~10 s down, and flaps 0 → 40 in about half a minute).
    // Flap load relief and the autobrake decelerations are Boeing's (737 NG FCOM 9.20 /
    // 14.10: flaps 40 → 30 above the 162 kt placard; autobrake 1/2/3/MAX = 4/5/7.2/14
    // ft/s²). Reverser effectiveness (a fraction of forward thrust at the same N1) and the
    // ~2 s sleeve travel are estimates for the CFM56-7 cascade reverser. Brakes on the
    // mains only (0082): μ 0.55 on their load keeps what 0.45 on every wheel gave, autobrake
    // MAX's 14 ft/s² with room to spare and full pedals a little harder (Boeing: maximum
    // manual braking can exceed MAX). Wet runway (0108, 14 CFR 25.109(c)): main tyres at
    // ~205 psi (H44.5x16.5-21, Boeing ACAP main-gear tyre pressure), fully modulating
    // anti-skid (efficiency 0.80).
    systems: {
      hydraulics: { psi: 3000 },
      gear: { extendS: 10, retractS: 7 },
      flaps: { degPerS: 1.5, loadRelief: { fromIndex: 3, toIndex: 2, aboveKts: 162 } },
      brakes: { tauS: 0.3, muMax: 0.55, tirePsi: 205, antiSkid: 0.8 },
      autobrake: { decelFtS2: [0, 4, 5, 7.2, 14] },
      reverser: { deployS: 2, effectiveness: 0.35 },
    },
    // Control authority (rad/s² at 120 kt). With the damping above: ~12°/s pitch, ~18°/s roll.
    pitchAuthority: 0.5,
    rollAuthority: 1.0,
    maxGroundPitchDeg: 11, // tailstrike
    // Kid's auto-flare sink profile (assists.js, 0101): 0.315 of the wheel height per second, not the
    // Cessna's 0.2. At ~150 kt the slow profile was a ~10 s flare the pitch hold lagged: a balloon,
    // then ~330-360 fpm 580-650 m in. Fitted headless (tests/flight/kidFinal.test.js: 220-350 m in,
    // 60-180 fpm, calm to 25 kt headwind) and in the game (default final: 273 m, 219 fpm; it was 576 m,
    // 328 fpm). A game assist, not the real technique: it starts at ~40 ft (assists.js FLARE_FROM_M)
    // and lands shorter than Boeing's FCTM (flare ~20-30 ft, touchdown 1,000-1,500 ft in). Steeper is
    // firmer (0.36: 371 fpm in the game); at 0.31 the calm flare balloons again (~560 m), and at 55 t
    // it still does (558 m): only 65 t is flown. A 10 kt tailwind still lands ~745 m in.
    kidFlarePerS: 0.315,
    alphaStallDeg: 14.8,
    maxThrustN: 240000, // 2x CFM56-7B (120 kN each)
    // Lapse fit: ~18% less thrust by Mach 0.23 at sea level (high-bypass takeoff curves),
    // σ^0.94 with altitude, fitted (0116) to CFM's max climb thrust at 35,000 ft, Mach 0.8, ISA:
    // 26.5 kN per installed engine, every -7B rating (Snecma CFM56-7B fact sheet, June 2006;
    // was σ^0.7, 35 kN). Full throttle up there is that max climb rating (a real lever's TO/CON
    // limit is a few % more), and the one exponent also absorbs installation losses against the
    // 120 kN bare-engine static rating. Mattingly's high-bypass lapse (Aircraft Engine Design,
    // 2nd ed., eq. 2.45a, δ0·(1 − 0.49√M)) is within ~1% of it at 10,000 ft, Mach 0.5, but 9%
    // under CFM at FL350 and ~11% under the fit at FL410: a sanity check, not a second source.
    // Idle ~4%; idle → 95% thrust in ~5 s (FAR 33.73: ≤ 5 s from flight idle to 95%).
    engine: { type: 'turbofan', staticThrustN: 240000, idleFraction: 0.04, machLapse: [0.9, 0.6], densityExp: 0.94, spoolTau: 1.2 },
    // Compressibility drag rise (aero.js waveDragCd, 0120; Mason's Korn + Lock). Sweep 25° at the
    // quarter chord and average t/c 12.89% are the 737's in Jenkinson, Simpkin & Rhodes, Civil Jet
    // Aircraft Design (1999), Aircraft Data File (its t/c row is the Original/Classic; the NG keeps the
    // 25° sweep and no NG figure is published there). κA 0.95 is Mason's supercritical-section value
    // (0.87 for NACA 6-series), not fitted: the NG's wing is Boeing's advanced (aft-loaded) section. Cross-check, not a
    // fit: MDD at a cruise CL of 0.5 is then 0.824, Boeing's practice puts MDD at MMO (Scholz &
    // Ciornei, DGLR-2005-122) and the 737-800's MMO is 0.82; κA 0.87 would put MDD at 0.736, below the
    // 0.785-0.79 the 737 really cruises at. A buffet boundary is not modelled.
    transonic: { kappaA: 0.95, tOverC: 0.1289, sweepDeg: 25 },
    vneKts: 340, // VMO (FAA TCDS A16WE, 737-800): the nose-down trim stop's hands-off speed (trim.js, 0094)
    vrefKts: 150, // 1.23 Vs at flaps 30 (the landing flap finals spawn with), 65 t
    vrefKtsByFlap: [null, null, 150, 141], // landing flaps 30 / 40 (aero.js vrefFor)
    // The model's Vr at flaps 10, 65 t, fitted to its own lift curve: the speed from which a
    // normal 2–3°/s rotation (FCTM; ~2.3°/s average as flown, ATSB) lifts off at the normal
    // 8–9° attitude (NTSB, operator's 737 manual, quoted for flaps 1/5): 8.3° at 135 kt, 3.5 s
    // later (FCTM: 3–4 s), with V2 (1.13 Vs) 6.8 kt above it (crews' data: 3–4 kt). Published
    // VR at 65 t is ~145 (AAIB 6/2019, ATSB AO-2014-162, flap not stated): with this flap's
    // lift the takeoff would then exceed Boeing's field length, so that gap waits for a
    // flaps 5 notch (0070). Called out on the takeoff roll (0035).
    vrKts: 135,
    twoCrew: true, // the pilot monitoring's takeoff callouts: eighty knots, V1 (0035)
    stallCleanKts: 114,
    gearHeight: 3.4,
    // Struts (gear.js): wheelbase 15.6 m and main track 5.72 m (Boeing 737-800 ACAP §2);
    // mains 1.47 m aft of the CG (the model's axles, aircraftModel.js), so the nose carries
    // ~9%. Static stroke and damping are estimates; ±7° pedal steering (737 FCOM).
    // Inertia: approximate, from JSBSim's 737 model (slug·ft² → kg·m²).
    gear: { noseZ: 14.13, mainZ: 1.47, trackM: 5.72, strokeM: 0.15, zeta: 0.6, steerDeg: 7 },
    inertia: { roll: 7.6e5, pitch: 1.76e6, yaw: 2.39e6 },
    eyeOffset: new Vector3(0, 4.2, -12.8),
    chaseDist: 48,
    chaseHeight: 12.5,
    pitchDamping: 2.4,
    // Elevator balance (flightModel.js, 0090): JSBSim's generic 737 (the Aeromatic model above,
    // not Boeing data): Cmα −0.6 against its low-Mach Cmδe −1.2 at ±0.3 rad of elevator.
    elevatorAlphaDeg: (1.2 / 0.6) * 0.3 * 180 / Math.PI,
    rollDamping: 3.2,
    yawDamping: 1.8,
    // Sideslip (0081), per radian: estimates from JSBSim's generic 737 (JSBSim-Team/jsbsim
    // aircraft/737/737.xml, an Aeromatic model by Dave Culp, not Boeing data; no public Boeing
    // derivatives exist): CYβ −1.0 on its 1171 ft² (108.8 m²), so −0.873 on our 124.6 m²;
    // Clβ −0.09 against its low-Mach Clδa 0.10 at ±0.35 rad of aileron (the ratio, so the
    // reference area cancels; Clδa falls to ~0.074 by M0.78, so cruise dihedral reads ~26%
    // weak: slips are flown on approach). That model has no rudder side force term.
    cyBeta: -1.0 * 108.8 / 124.6,
    clBeta: -0.09,
    clAileron: 0.1 * 0.35,
  },
  c172: {
    name: 'Cessna 172S Skyhawk',
    massKg: 1150,
    wingAreaM2: 16.2,
    wingSpanM: 11.0,
    aspectRatio: 7.45,
    oswaldEfficiency: 0.78,
    // Airframe CD0 0.018 + fixed gear 0.018 (aero.js) = 0.036: the drag at which 1680 N of
    // thrust (~82% prop efficiency on 134 kW) gives the POH's 126 KTAS at sea level.
    cd0: 0.018,
    fixedGear: true,
    cl0: 0.35,
    clAlpha: 4.8,
    clMaxFlaps: 1.95,
    // Flaps 0/10/20/30: ΔCL and stall AoA fitted to the POH stall speeds (2550 lb, power
    // off, most rearward CG): 53 / 50 / – / 48 KCAS; flaps 20 interpolated.
    flapDetentsDeg: [0, 10, 20, 30],
    // Control-surface throws (°): FAA TCDS 3A12, Model 172S (aileron up 20 / down 15,
    // elevator up 28 / down 23, rudder 16°10' each way measured parallel to the waterline; the
    // drawing turns it about the raked hinge, a degree or two short of the hinge-line angle).
    controlThrowsDeg: { aileronUp: 20, aileronDown: 15, elevatorUp: 28, elevatorDown: 23, rudder: 16.2 },
    flapCl: [0, 0.19, 0.30, 0.40],
    alphaStallDegByFlap: [14.1, 14.1, 13.7, 13.3],
    // Electric flaps, 0 → 30° in ~10 s (an estimate); toe brakes on the mains, no autobrake or
    // reverse. The small disc brakes are torque-limited below the tyres' grip: μ 0.39 at full
    // pedal is fitted to POH Fig. 5-11 (575 ft roll from a near-stall touchdown, 1335 ft from
    // 50 ft; tests/flight/c172.test.js), not a measured brake torque (ticket 0082). Wet
    // runway (0108): a Part 23 airplane, so 14 CFR 25.109(c) is borrowed, not required. Its
    // 6.00-6 main tyres run 38 psi (POH Section 8), below the rule's table: its 50 psi row (an
    // extrapolation on the conservative side). No anti-skid; 0.37 is an effective factor
    // fitted to the UK CAA's light-aircraft planning factor (Safety Sense Leaflet 7: a wet
    // paved runway adds 15% to the landing distance from 50 ft; tests/flight/wetRunway.test.js),
    // between (c)(2)'s on-off 0.30 and quasi-modulating 0.50.
    systems: { flaps: { degPerS: 3 }, brakes: { tauS: 0.3, muMax: 0.39, tirePsi: 38, antiSkid: 0.37 } },
    alphaStallDeg: 14.1,
    maxThrustN: 2100, // Lycoming IO-360-L2A, 180 hp, fixed-pitch prop (static)
    // Sea-level full-throttle thrust vs TAS (m/s). 0: 2070 N measured static thrust of a
    // C172 (211 kg, Atlantis Press static-thrust study); 38 m/s: what the POH's 730 fpm at
    // Vy needs on this drag polar; 65 m/s: what 126 KTAS max speed needs. Flat at first:
    // the fixed-pitch prop unloads and gains RPM (static ~2300 rpm) as it speeds up.
    // 124 m/s: the 65→80 slope carried on to zero (a diving fixed-pitch prop unloads).
    // windmillCd: the idle prop's drag, from the POH's ~9:1 glide at 68 KIAS.
    engine: { type: 'piston-prop', thrustTableN: [[0, 2070], [20, 2100], [38, 2105], [50, 1960], [65, 1680], [80, 1250], [124, 0]], windmillCd: 0.0188, spoolTau: 0.3 },
    vneKts: 163, // never exceed, KIAS (POH Section 2): the nose-down trim stop's hands-off speed (trim.js, 0094)
    vrefKts: 62,
    vrKts: 55,
    stallCleanKts: 48,
    vGlideKts: 68, // best glide, 2,550 lb (POH Section 3, engine failure; the dead-stick drill, 0036)
    gearHeight: 1.65,
    // Struts (gear.js): 65 in wheelbase (POH Fig. 1-1 note 2), 2.54 m main track (POH Section
    // 1). Nose wheel at arm -6.8 in and mains at 58.2 in (POH Section 6 equipment list, wheel
    // assemblies), the CG at 41.0 in, the forward limit at 2550 lb (POH Section 2): the mains
    // 17.2 in (0.437 m) aft, the nose 47.8 in (1.214 m) ahead, carrying ~26.5% (ticket 0082;
    // it was 0.3 m, a tip-back angle of ~10°, so a flare attitude sat the Cessna on its tail).
    // Tip-back is now atan(0.437 / 1.73) ≈ 14°; gearHeight (the CG 1.73 m above the axles) is
    // taller than a real Skyhawk's (~1.22 m, the thrust line: 11.25 in prop clearance + the
    // 38 in prop radius, as public/jsbsim puts it), kept because spawns, ground effect and the
    // takeoff cards are fitted to it. Spring-steel mains and a nose oleo, stroke and damping
    // estimates; ±10° pedal nose-wheel steering (POH Section 7). Inertia: JSBSim c172x (948 /
    // 1346 / 1967 slug·ft²).
    gear: { noseZ: 1.214, mainZ: 0.437, trackM: 2.54, strokeM: 0.08, zeta: 0.6, steerDeg: 10 },
    inertia: { roll: 1285, pitch: 1825, yaw: 2667 },
    eyeOffset: new Vector3(0, 1.85, -1.3),
    chaseDist: 18,
    chaseHeight: 4.5,
    // Pitch stiffness against damping (flightModel.js, 0102): the nose lags the flight path by
    // pitchDamping / stiffness seconds of pitch rate, and that lag takes lift out of the
    // phugoid's speed-height exchange. At 1.8 it was 1.35 s and the phugoid ran 1.9-2.2x
    // Lanchester's period; 7.2 makes it 0.34 s (Roskam's C172, Cmq·c̄/2V / Cmα, is 0.22 s at
    // 90 KIAS) and 1.3-1.4x. The trim α per stick is unchanged (elevatorAlphaDeg).
    pitchAuthority: 7.2,
    pitchDamping: 3.8,
    // Elevator balance (flightModel.js, 0090): Roskam's Cmα −0.89 against Cmδe −1.28 per
    // radian, as in our JSBSim C172 (public/jsbsim/), at the TCDS's 25.5° mean elevator throw.
    elevatorAlphaDeg: (1.28 / 0.89) * 25.5,
    rollDamping: 4.2,
    yawDamping: 2.5,
    // Sideslip (flightModel.js, 0081), per radian, Roskam's Cessna 172 as in our JSBSim C172
    // (public/jsbsim/): side force CYβ −0.31 and rudder CYδr 0.187 (at the TCDS throw above),
    // dihedral effect Clβ −0.089 against Clδa 0.178 at the 17.5° mean aileron throw.
    cyBeta: -0.31,
    cyRudder: 0.187,
    clBeta: -0.089,
    clAileron: 0.178 * 17.5 * Math.PI / 180,
  },
  f16: {
    name: 'F-16C Fighting Falcon',
    massKg: 12000,
    wingAreaM2: 27.87,
    wingSpanM: 10.0,
    aspectRatio: 3.2,
    oswaldEfficiency: 0.72,
    cd0: 0.018,
    cl0: 0.15,
    clAlpha: 3.6,
    clMaxFlaps: 1.8,
    // Control-surface limits (°): the F-16 model of NASA TP-1538 as flown in Stevens & Lewis,
    // Aircraft Control and Simulation: stabilator ±25, flaperons ±21.5, rudder ±30. The
    // flaperons are also its flaps (surfaces.js adds the two).
    controlThrowsDeg: { aileronUp: 21.5, aileronDown: 21.5, elevatorUp: 25, elevatorDown: 25, rudder: 30 },
    flaperons: true,
    alphaStallDeg: 28.0,
    maxThrustN: 130000, // F110-GE-129 afterburner
    engine: { type: 'turbofan', staticThrustN: 130000, idleFraction: 0.04, machLapse: [0.3, 0.3], densityExp: 0.8, spoolTau: 0.8 },
    vrefKts: 148,
    vrKts: 155,
    stallCleanKts: 120,
    gearHeight: 2.2,
    // Struts (gear.js): ~4.0 m wheelbase, 2.36 m track, the nose carrying ~13% (estimates
    // from published F-16 dimensions). Inertia: JSBSim f16 (9496 / 55814 / 63100 slug·ft²).
    gear: { noseZ: 3.48, mainZ: 0.52, trackM: 2.36, strokeM: 0.12, zeta: 0.6, steerDeg: 10 },
    inertia: { roll: 12875, pitch: 75674, yaw: 85551 },
    eyeOffset: new Vector3(0, 2.3, -2.5),
    chaseDist: 24,
    chaseHeight: 5.5,
    pitchDamping: 1.8,
    // Fly-by-wire pitch (flightModel.js, 0090): the F-16's relaxed-stability airframe is flown
    // by its flight control computer, which trims itself (a 1 g command); here a released stick holds the nose where it is, as before.
    pitchFbw: true,
    rollDamping: 5.2,
    yawDamping: 2.2,
    // Sideslip (0081): CYβ −1.146 per radian (NASA TP-1538 as in Stevens & Lewis, −0.02 per
    // degree; JSBSim f16.xml). No dihedral term: the F-16's stick commands a roll rate and
    // its flight control computer flies out the sideslip's rolling moment. Rudder side force
    // (f16.xml CYδr 0.086, in that file's units) is left out: it is a 7% term next to CYβ at
    // full rudder and the table's control units are uncertain (per radian there, per 30° in
    // Stevens & Lewis).
    cyBeta: -1.146,
  },
};
