import { DEG_TO_RAD, DFW_ORIGIN_LAT, DFW_ORIGIN_LON } from './constants.js';

// Slippy-map Web Mercator conversions (OSM/Esri tile scheme).
export function latLonToTile(lat, lon, zoom) {
  const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
  const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
  return { x, y };
}

// Returns the lat/lon of the tile's north-west corner.
export function tileToLatLon(x, y, zoom) {
  const n = Math.PI - 2 * Math.PI * y / Math.pow(2, zoom);
  const lon = x / Math.pow(2, zoom) * 360 - 180;
  const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lon };
}

// Metres from the DFW origin, equirectangular approximation (fine at metroplex scale).
// North is -Z in the Three.js world frame.
export function latLonToSimMeters(lat, lon) {
  const R = 6378137; // WGS84 equatorial radius
  const dLat = (lat - DFW_ORIGIN_LAT) * DEG_TO_RAD;
  const dLon = (lon - DFW_ORIGIN_LON) * DEG_TO_RAD;
  const x = dLon * Math.cos(DFW_ORIGIN_LAT * DEG_TO_RAD) * R;
  const z = -dLat * R;
  return { x, z };
}

export const TILE_HOST = 'https://server.arcgisonline.com';

// Esri World Imagery tile URL. Note the {z}/{y}/{x} order.
export function esriTileUrl(zoom, tileX, tileY) {
  return `${TILE_HOST}/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${tileY}/${tileX}`;
}

// Placement (centre + size in sim metres) of one tile in the world.
export function tilePlacement(tileX, tileY, zoom) {
  const nwLL = tileToLatLon(tileX, tileY, zoom);
  const seLL = tileToLatLon(tileX + 1, tileY + 1, zoom);
  const nw = latLonToSimMeters(nwLL.lat, nwLL.lon);
  const se = latLonToSimMeters(seLL.lat, seLL.lon);
  return {
    widthM: Math.abs(se.x - nw.x),
    lengthM: Math.abs(se.z - nw.z),
    posX: (nw.x + se.x) / 2,
    posZ: (nw.z + se.z) / 2,
  };
}
