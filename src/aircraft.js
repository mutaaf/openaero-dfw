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
    // Flaps 25 ≈ +0.84 CL: approach AoA ~5° and pitch ~2° on a 3° path at Vref+5, like the real 737.
    flapClPerNotch: 0.42,
    // Flaps 0/10/25/40 drag. Landing flaps on an airliner are draggy: with gear down at
    // Vref+5 the 737 flies at L/D ≈ 7.5 and needs ~25% thrust (N1 ~55–60%) on a 3° path.
    flapCd: [0, 0.015, 0.077, 0.1],
    // Control authority (rad/s² at 120 kt). With the damping above: ~12°/s pitch, ~18°/s roll.
    pitchAuthority: 0.5,
    rollAuthority: 1.0,
    maxGroundPitchDeg: 11, // tailstrike
    alphaStallDeg: 14.8,
    maxThrustN: 240000, // 2x CFM56-7B (120 kN each)
    // Lapse fit: ~18% less thrust by Mach 0.23 at sea level (high-bypass takeoff curves),
    // σ^0.7 with altitude; idle ~4%; idle → 95% thrust in ~5 s (FAR 33.73: ≤ 5 s
    // from flight idle to 95%).
    engine: { type: 'turbofan', staticThrustN: 240000, idleFraction: 0.04, machLapse: [0.9, 0.6], densityExp: 0.7, spoolTau: 1.2 },
    vrefKts: 136,
    vrKts: 142,
    stallCleanKts: 114,
    gearHeight: 3.4,
    eyeOffset: new Vector3(0, 4.2, -12.8),
    chaseDist: 48,
    chaseHeight: 12.5,
    pitchDamping: 2.4,
    rollDamping: 3.2,
    yawDamping: 1.8,
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
    cl0: 0.35,
    clAlpha: 4.8,
    clMaxFlaps: 1.95,
    // Flaps 0/10/20/30: ΔCL and stall AoA fitted to the POH stall speeds (2550 lb, power
    // off, most rearward CG): 53 / 50 / – / 48 KCAS; flaps 20 interpolated.
    flapCl: [0, 0.19, 0.30, 0.40],
    alphaStallDegByFlap: [14.1, 14.1, 13.7, 13.3],
    alphaStallDeg: 14.1,
    maxThrustN: 2100, // Lycoming IO-360-L2A, 180 hp, fixed-pitch prop (static)
    // Sea-level full-throttle thrust vs TAS (m/s). 0: 2070 N measured static thrust of a
    // C172 (211 kg, Atlantis Press static-thrust study); 38 m/s: what the POH's 730 fpm at
    // Vy needs on this drag polar; 65 m/s: what 126 KTAS max speed needs. Flat at first:
    // the fixed-pitch prop unloads and gains RPM (static ~2300 rpm) as it speeds up.
    // windmillCd: the idle prop's drag, from the POH's ~9:1 glide at 68 KIAS.
    engine: { type: 'piston-prop', thrustTableN: [[0, 2070], [20, 2100], [38, 2105], [50, 1960], [65, 1680], [80, 1250]], windmillCd: 0.0188, spoolTau: 0.3 },
    vrefKts: 62,
    vrKts: 55,
    stallCleanKts: 48,
    gearHeight: 1.65,
    eyeOffset: new Vector3(0, 1.85, -1.3),
    chaseDist: 18,
    chaseHeight: 4.5,
    pitchDamping: 3.8,
    rollDamping: 4.2,
    yawDamping: 2.5,
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
    alphaStallDeg: 28.0,
    maxThrustN: 130000, // F110-GE-129 afterburner
    engine: { type: 'turbofan', staticThrustN: 130000, idleFraction: 0.04, machLapse: [0.3, 0.3], densityExp: 0.8, spoolTau: 0.8 },
    vrefKts: 148,
    vrKts: 155,
    stallCleanKts: 120,
    gearHeight: 2.2,
    eyeOffset: new Vector3(0, 2.3, -2.5),
    chaseDist: 24,
    chaseHeight: 5.5,
    pitchDamping: 1.8,
    rollDamping: 5.2,
    yawDamping: 2.2,
  },
};
