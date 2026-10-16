// Mathematical & aviation units, and the world anchor. Pure values, no imports.
export const M_TO_FT = 3.28084;
export const FT_TO_M = 1 / M_TO_FT;
export const KTS_TO_MPS = 0.514444;
export const MPS_TO_KTS = 1 / KTS_TO_MPS;
export const NM_TO_M = 1852.0;
export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;
export const GRAVITY = 9.80665;
export const RHO_SEA_LEVEL = 1.225; // kg/m^3
export const SPEED_OF_SOUND_KTS = 661.47; // ISA sea level

// Geographic anchor: KDFW airport center (32.8998° N, -97.0403° W).
// Sim world frame: +X east, +Y up, -Z north, metres from this point.
export const DFW_ORIGIN_LAT = 32.8998;
export const DFW_ORIGIN_LON = -97.0403;

// KDFW field elevation, used to turn AGL into MSL (ft).
export const FIELD_ELEV_FT = 606;
