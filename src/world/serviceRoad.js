// Where the Rapier world's tow tractor drives (ticket 0043), in its own tiny module so runwayLights.js can
// decide when to fetch the world (LOAD_M) without pulling Rapier into its chunk.
//
// A straight ~200 m lane on Terminal C's east ramp at KDFW, north-south along the edge of the gate apron
// just outside the parked jets' tails (lon -97.0344, ~420 m west of 17R/35L's centreline, airports.js),
// read off the Esri imagery by the validation panel: approximate, not a surveyed service road. The
// return lane is beside it, to its west (physicsWorld.js laneOffsetM).
import { latLonToSimMeters } from '../geo.js';

export const SERVICE_ROAD = { from: { lat: 32.8955, lon: -97.0344 }, to: { lat: 32.8973, lon: -97.0344 }, widthM: 12 };
// The world (its chunk and ~1.2 MB gz of wasm) is fetched on a KDFW flight, or once the aircraft is this close to the road's start.
export const LOAD_M = 5000;
export const ROAD_START = latLonToSimMeters(SERVICE_ROAD.from.lat, SERVICE_ROAD.from.lon);
