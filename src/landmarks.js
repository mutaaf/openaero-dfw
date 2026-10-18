// Dallas-Fort Worth landmarks at their true coordinates (ticket 0010). Positions come from
// the cited public source (Wikipedia infobox coordinates) and go through geo.js like
// every runway, so the stand-in models sit on the buildings in the satellite imagery.
// heightM is the real roof height above the ground; the meshes in main.js are built to it.
import { latLonToSimMeters } from './geo.js';

const WIKI = 'https://en.wikipedia.org/wiki/';

export const LANDMARKS = {
  bankOfAmericaPlaza: { name: 'Bank of America Plaza', lat: 32.7799, lon: -96.8038, heightM: 279, source: `${WIKI}Bank_of_America_Plaza_(Dallas)` },
  reunionTower: { name: 'Reunion Tower', lat: 32.7753, lon: -96.8089, heightM: 171, source: `${WIKI}Reunion_Tower` },
  renaissanceTower: { name: 'Renaissance Tower', lat: 32.7812, lon: -96.8020, heightM: 220, source: `${WIKI}Renaissance_Tower_(Dallas)` },
  comericaBankTower: { name: 'Comerica Bank Tower', lat: 32.78157, lon: -96.7966, heightM: 240, source: `${WIKI}Comerica_Bank_Tower` },
  jpmorganChaseTower: { name: 'JPMorgan Chase Tower', lat: 32.7878, lon: -96.7966, heightM: 225, source: `${WIKI}JPMorgan_Chase_Tower_(Dallas)` },
  // The deck runs from Spur 366 (downtown, NE) to Singleton Blvd (West Dallas, SW).
  margaretHuntHillBridge: { name: 'Margaret Hunt Hill Bridge', lat: 32.7800, lon: -96.8221, heightM: 122, spanBearingDeg: 60, source: `${WIKI}Margaret_Hunt_Hill_Bridge` },
  // heightM: the arches over the roof, "nearly 300 ft".
  attStadium: { name: 'AT&T Stadium', lat: 32.74778, lon: -97.09278, heightM: 91, source: `${WIKI}AT%26T_Stadium` },
};

// Sim position (metres, +X east, -Z north) of a landmark.
export function landmarkPos(key) {
  const l = LANDMARKS[key];
  return latLonToSimMeters(l.lat, l.lon);
}

// The downtown cluster is anchored on its tallest tower; the moving map's DALLAS dot and
// the skyline tour use it.
export const DOWNTOWN_DALLAS = landmarkPos('bankOfAmericaPlaza');
export const ATT_STADIUM = landmarkPos('attStadium');
