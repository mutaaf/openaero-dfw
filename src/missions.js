// Mission catalogue. Approaches and takeoffs are defined by a real runway end (airports.js);
// tours spawn a few km south of their landmark (landmarks.js), heading straight at it. The
// <select> and mission loader are built from this table.
import { DOWNTOWN_DALLAS, ATT_STADIUM } from './landmarks.js';

export const MISSIONS = [
  { key: 'kdfw_35c_final', label: 'KDFW RWY 35C (4 NM ILS Final)', blurb: '4 NM out, lined up on 35C. Follow the green velocity vector and the 4-light PAPI down.', kind: 'final', airport: 'KDFW', rwy: '35C', distNm: 4 },
  { key: 'kdfw_35c_flare', label: 'KDFW 35C Flare Challenge (1 NM)', blurb: 'One mile out, 300 ft up: all about the flare. Grease it.', kind: 'final', airport: 'KDFW', rwy: '35C', distNm: 1 },
  { key: 'kdfw_takeoff', label: 'KDFW RWY 35C (Takeoff Roll)', blurb: 'Hold the brakes, set takeoff power, release and rotate at Vr.', kind: 'takeoff', airport: 'KDFW', rwy: '35C' },
  { key: 'kdfw_17c_final', label: 'KDFW RWY 17C (South Flow 4 NM)', blurb: 'South flow: the centre runway flown from the north, the way DFW lands in a south wind.', kind: 'final', airport: 'KDFW', rwy: '17C', distNm: 4 },
  { key: 'kdfw_36l_final', label: 'KDFW RWY 36L (West Side 6 NM)', blurb: 'A longer 6 NM final from the south to the west-side runway.', kind: 'final', airport: 'KDFW', rwy: '36L', distNm: 6 },
  { key: 'kdfw_13r_final', label: 'KDFW RWY 13R (Diagonal 5 NM)', blurb: "The diagonal runway: line up on a course the other six don't fly.", kind: 'final', airport: 'KDFW', rwy: '13R', distNm: 5 },
  { key: 'kdal_31r_final', label: 'KDAL Love Field 31R Final', blurb: "Into Love Field from the south-east, over the Dallas neighbourhoods near the field.", kind: 'final', airport: 'KDAL', rwy: '31R', distNm: 4 },
  { key: 'kdal_13l_final', label: 'KDAL Love Field 13L (Over Downtown)', blurb: 'Into Love Field from the north-west with the downtown skyline ahead.', kind: 'final', airport: 'KDAL', rwy: '13L', distNm: 5 },
  { key: 'kads_16_final', label: 'KADS Addison 16 (Short Field)', blurb: "Addison's 7,200 ft strip between office towers: short final, tight margins.", kind: 'final', airport: 'KADS', rwy: '16', distNm: 3 },
  { key: 'kafw_34l_final', label: 'KAFW Alliance 34L', blurb: 'Alliance, the industrial airport north of Fort Worth: long, wide, and quiet.', kind: 'final', airport: 'KAFW', rwy: '34L', distNm: 5 },
  { key: 'kftw_16_final', label: 'KFTW Meacham 16', blurb: "Meacham, Fort Worth's historic field, just north of downtown Fort Worth.", kind: 'final', airport: 'KFTW', rwy: '16', distNm: 4 },
  { key: 'kgky_34_final', label: 'KGKY Arlington 34', blurb: 'Arlington Municipal: a short 3 NM final, south of the stadiums.', kind: 'final', airport: 'KGKY', rwy: '34', distNm: 3 },
  { key: 'downtown_skyline', label: 'Downtown Dallas Skyline Tour', blurb: 'Fly past Bank of America Plaza and Reunion Tower over downtown Dallas.', kind: 'tour', pos: [DOWNTOWN_DALLAS.x, 520, DOWNTOWN_DALLAS.z + 3200], speedMps: 108, hdg: 0, throttle: 0.65 },
  { key: 'att_stadium', label: 'Arlington AT&T Stadium', blurb: 'Low over Arlington to AT&T Stadium and the ballpark next door.', kind: 'tour', pos: [ATT_STADIUM.x, 480, ATT_STADIUM.z + 2900], speedMps: 100, hdg: 0, throttle: 0.62 },
];

// `extra`: missions that exist only some days (today's crosswind challenge).
export const missionByKey = (key, extra = []) =>
  extra.find((m) => m.key === key) || MISSIONS.find((m) => m.key === key) || MISSIONS[0];

export const CROSSWIND_KEY = 'crosswind_today';

// Today's crosswind challenge (ticket 0018) from pickCrosswindRunway(): a 4 NM final on that
// end, labelled with the live crosswind. Null when there is no pick (no live weather).
export function crosswindMission(pick) {
  if (!pick) return null;
  const kts = Math.round(Math.abs(pick.crosswindKts));
  return {
    key: CROSSWIND_KEY, kind: 'final', airport: pick.end.airport, rwy: pick.end.ident, distNm: 4,
    label: `Today's crosswind: ${pick.end.airport} ${pick.end.ident}, ${kts} kt from the ${pick.crosswindKts > 0 ? 'right' : 'left'}`,
  };
}

// The start screen's mission picker (ticket 0029) is generated from MISSIONS: the recommended
// first flight on top, then one group per airport in this order (an airport not listed here
// gets its own group after them), then the tours. Every key appears once; empty groups drop.
export const RECOMMENDED_KEY = 'kdfw_35c_final';
const AIRPORT_ORDER = ['KDFW', 'KDAL', 'KADS', 'KAFW', 'KFTW', 'KGKY'];

export function groupMissions(missions) {
  const groups = [{ id: 'recommended', missions: [] }, ...AIRPORT_ORDER.map((id) => ({ id, missions: [] }))];
  const tours = { id: 'tours', missions: [] };
  const byId = new Map(groups.map((g) => [g.id, g]));
  for (const m of missions) {
    if (m.key === RECOMMENDED_KEY) { byId.get('recommended').missions.push(m); continue; }
    if (m.kind === 'tour' || !m.airport) { tours.missions.push(m); continue; }
    let g = byId.get(m.airport);
    if (!g) { g = { id: m.airport, missions: [] }; byId.set(m.airport, g); groups.push(g); }
    g.missions.push(m);
  }
  return [...groups, tours].filter((g) => g.missions.length);
}
