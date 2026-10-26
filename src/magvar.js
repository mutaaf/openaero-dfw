// Magnetic variation over DFW (0078). Runway numbers, ATC and compasses are magnetic; the
// sim's geometry (airports.js hdgT) is true. Converted at display only: physics stays true.
// NOAA NCEI World Magnetic Model WMM-2025 (public domain) at KDFW, 2026-10-26: 2.68° E,
// drifting −0.08°/yr; 2.55° (KADS) to 2.87° (KFTW) across the six fields. FAA charts
// can lag: the KDFW diagram and ILS 35C plate print 356° on a 2015 variation (today 357.6°).
// https://www.ncei.noaa.gov/products/world-magnetic-model
export const MAG_VAR_DEG = 2.7; // east positive

export const trueToMag = (deg) => ((deg - MAG_VAR_DEG) % 360 + 360) % 360;
export const magToTrue = (deg) => ((deg + MAG_VAR_DEG) % 360 + 360) % 360;

// A compass reading: three digits, north is 360.
export const magHeadingText = (trueDeg) => String(Math.round(trueToMag(trueDeg)) % 360 || 360).padStart(3, '0');
