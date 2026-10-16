// Runways in sim metres (see constants.js for the frame). headingDeg is the landing
// direction; thrX/thrZ is the landing threshold.
export const RUNWAYS = [
  { id: 'KDFW_35C', name: 'KDFW 35C', cx: 0, cz: 0, length: 4085, width: 60, headingDeg: 360, thrX: 0, thrZ: 1850, elevM: 184.7 },
  { id: 'KDFW_17C', name: 'KDFW 17C', cx: 0, cz: 0, length: 4085, width: 60, headingDeg: 180, thrX: 0, thrZ: -1850, elevM: 184.7 },
  { id: 'KDFW_35L', name: 'KDFW 35L', cx: -380, cz: 0, length: 4085, width: 60, headingDeg: 360, thrX: -380, thrZ: 1850, elevM: 184.7 },
  { id: 'KDAL_31R', name: 'KDAL 31R', cx: 13200, cz: 4200, length: 2363, width: 46, headingDeg: 316, thrX: 13910, thrZ: 4910, elevM: 148.4 },
];

// Downtown Dallas landmark cluster origin (sim metres).
export const DOWNTOWN_DALLAS = { x: 17600, z: 9800 };
