// Deep links: launcher/share URLs that pick the flight before Start flight, e.g.
// /openaero/?airport=KDAL, ?mission=kdfw_takeoff, ?view=terrain. Pure parsing (unit-tested).
// Nothing here skips the Start flight tap: the billable Google session still starts only there.
import { MISSIONS } from './missions.js';
import { AIRPORT_NAMES } from './airports.js';

export const DEEP_PARAMS = Object.freeze(['airport', 'mission']);

/** The mission key a link asks for (null = the default). `?mission` wins over `?airport`. */
export function missionFromLink(search) {
  let p;
  try { p = new URLSearchParams(search); } catch (e) { return null; }
  const key = (p.get('mission') || '').trim().toLowerCase();
  if (key && MISSIONS.some((m) => m.key === key)) return key;
  const icao = (p.get('airport') || '').trim().toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(AIRPORT_NAMES, icao)) return null;
  // "Fly from" an airport: its takeoff if it has one (not a drill's: the engine-failure takeoffs,
  // 0104, the rejected takeoff, 0107), else its first approach.
  const here = MISSIONS.filter((m) => m.airport === icao);
  const pick = here.find((m) => m.kind === 'takeoff' && !m.engineOutFt && !m.rto) || here[0];
  return pick ? pick.key : null;
}

/** `?view=terrain` asks for the free terrain map: no Google session this visit. */
export const terrainOnly = (search) => new URLSearchParams(search).get('view') === 'terrain';

/** `?fdm=jsbsim` flies the Cessna on JSBSim (src/fdm/) instead of flightModel.js. */
export const fdmFromLink = (search) => (new URLSearchParams(search).get('fdm') === 'jsbsim' ? 'jsbsim' : 'builtin');

/** The search string without the one-shot params (a refresh starts at the default mission). */
export function stripDeepLink(search) {
  const p = new URLSearchParams(search);
  DEEP_PARAMS.forEach((k) => p.delete(k));
  const qs = p.toString().replace(/=(&|$)/g, '$1');
  return qs ? `?${qs}` : '';
}
