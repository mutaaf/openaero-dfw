// Mission catalogue. Approaches and takeoffs are defined by a real runway end (airports.js);
// tours spawn a few km south of their landmark (landmarks.js), heading straight at it. The
// <select> and mission loader are built from this table.
import { DOWNTOWN_DALLAS, ATT_STADIUM } from './landmarks.js';
import { latLonToSimMeters } from './geo.js';

// Drills away from the airports start over Grapevine Lake (32°58'N 97°04'W, Wikipedia), north
// of DFW: a fixed point anyone can see from 4,500 ft.
const GRAPEVINE_LAKE = latLonToSimMeters(32.967, -97.067);
// The dead-stick challenge (0036) starts abeam the middle of Addison's runway, 2 NM east: a
// left downwind for 16 (heading 340), the runway off the left wing (tests/unit/deadStick.test.js
// checks it against the runway's surveyed ends).
const ADS_ABEAM = latLonToSimMeters(32.97991, -96.79924);
// The traffic pattern (0048, pattern.js) starts on a left downwind for Addison 16: 0.75 NM east
// of the centreline, 0.5 NM before abeam the (displaced) threshold, heading the reciprocal
// (tests/unit/pattern.test.js checks it against the runway's surveyed ends).
const ADS_DOWNWIND = latLonToSimMeters(32.97173, -96.82205);

export const MISSIONS = [
  { key: 'kdfw_35c_final', label: 'KDFW RWY 35C (4 NM ILS Final)', blurb: '4 NM out, lined up on 35C. Follow the green velocity vector and the 4-light PAPI down.', kind: 'final', airport: 'KDFW', rwy: '35C', distNm: 4 },
  { key: 'kdfw_35c_flare', label: 'KDFW 35C Flare Challenge (1 NM)', blurb: 'One mile out, 300 ft up: all about the flare. Grease it.', kind: 'final', airport: 'KDFW', rwy: '35C', distNm: 1 },
  { key: 'kdfw_takeoff', label: 'KDFW RWY 35C (Takeoff Roll)', blurb: 'Hold the brakes, set takeoff power, release and rotate at Vr: the callouts say when.', kind: 'takeoff', airport: 'KDFW', rwy: '35C' },
  // Go-around drill (0047): spawned 20 kt fast and one glideslope dot high on purpose.
  { key: 'go_around_drill', label: 'KDFW 35C Go-Around Drill', blurb: 'Fast and high on purpose: go around when the 500 ft gate calls it (or sooner). Full power, climb, flaps and gear up. Fix it instead and you land.', kind: 'final', airport: 'KDFW', rwy: '35C', distNm: 4, fastKts: 20, highDots: 1, goAround: true },
  // Rejected takeoff drill (0107, rto.js): the 737's engine fire warning comes below V1 on the roll.
  { key: 'kdfw_35c_rto', label: 'KDFW 35C Rejected Takeoff (737)', blurb: 'Full power down 35C: an engine fire warning comes before V1. Reject: thrust idle, full brakes, reverse, and stop on the runway.', kind: 'takeoff', airport: 'KDFW', rwy: '35C', aircraft: 'b738', rto: true },
  // Microburst windshear drill (0112, windshear.js): the 737 meets a microburst at 600 ft on a 3 NM final.
  { key: 'kdfw_35c_windshear', label: 'KDFW 35C Windshear Escape (737)', blurb: 'A microburst waits on short final: when WINDSHEAR sounds, full power and 15° nose up, and hold it. Don\'t dive for the lost speed.', kind: 'final', airport: 'KDFW', rwy: '35C', distNm: 3, aircraft: 'b738', windshear: true },
  { key: 'kdfw_17c_final', label: 'KDFW RWY 17C (South Flow 4 NM)', blurb: 'South flow: the centre runway flown from the north, the way DFW lands in a south wind.', kind: 'final', airport: 'KDFW', rwy: '17C', distNm: 4 },
  { key: 'kdfw_36l_final', label: 'KDFW RWY 36L (West Side 6 NM)', blurb: 'A longer 6 NM final from the south to the west-side runway.', kind: 'final', airport: 'KDFW', rwy: '36L', distNm: 6 },
  { key: 'kdfw_13r_final', label: 'KDFW RWY 13R (Diagonal 5 NM)', blurb: "One of DFW's two diagonal runways, on the west side: a course off the north-south grid.", kind: 'final', airport: 'KDFW', rwy: '13R', distNm: 5 },
  { key: 'kdal_31r_final', label: 'KDAL Love Field 31R Final', blurb: "Into Love Field from the south-east, over the Dallas neighbourhoods near the field.", kind: 'final', airport: 'KDAL', rwy: '31R', distNm: 4 },
  { key: 'kdal_13l_final', label: 'KDAL Love Field 13L (Over Downtown)', blurb: 'Into Love Field from the north-west with the downtown skyline ahead.', kind: 'final', airport: 'KDAL', rwy: '13L', distNm: 5 },
  { key: 'kads_16_final', label: 'KADS Addison 16 (Short Field)', blurb: "A 3 NM final into Addison's strip, hemmed in by North Dallas office towers.", kind: 'final', airport: 'KADS', rwy: '16', distNm: 3 },
  // Dead-stick challenge (0036, deadStick.js): the Cessna's engine has quit, 3,500 ft up.
  { key: 'deadstick_kads_16', label: 'KADS Dead-Stick Challenge (Cessna)', blurb: 'Your engine stops over North Dallas, 2 NM from Addison: glide at 68 knots, turn back to the runway when the coach says, and land it.', kind: 'drill', airport: 'KADS', rwy: '16', aircraft: 'c172', pos: [ADS_ABEAM.x, ADS_ABEAM.z], aglFt: 3500, kias: 75, hdg: 340, deadStick: true },
  // Traffic pattern (0048, pattern.js): downwind, base and final, coached; the landing graded as usual.
  { key: 'pattern_kads_16', label: 'KADS Traffic Pattern (Cessna)', blurb: 'Fly around the airport like a pilot: downwind 1,000 ft above the field, base, final, land.', kind: 'drill', airport: 'KADS', rwy: '16', aircraft: 'c172', pos: [ADS_DOWNWIND.x, ADS_DOWNWIND.z], aglFt: 1000, kias: 85, hdg: 340, pattern: true },
  // Engine failure after takeoff (0104, engineOut.js): the Cessna's engine quits in the climb out of 16.
  // POH normal takeoff (flaps 0°) from the start of the pavement (16's displaced 979 ft is usable for it).
  { key: 'efato_kads_16_300', label: 'KADS Engine Failure at 300 ft (Cessna)', blurb: 'Take off from Addison 16 (full power, pull back at 55 knots): the engine quits at 300 ft. Too low to turn back: pitch for 68 knots and land ahead.', kind: 'takeoff', airport: 'KADS', rwy: '16', aircraft: 'c172', flaps: 0, fullLength: true, engineOutFt: 300 },
  { key: 'efato_kads_16_700', label: 'KADS Engine Failure at 700 ft (Cessna)', blurb: 'Take off from Addison 16 (full power, pull back at 55 knots): the engine quits at 700 ft. Climb at 74 knots and a quick 45° turn back can make it; the coach says if today\'s wind and your climb allow it.', kind: 'takeoff', airport: 'KADS', rwy: '16', aircraft: 'c172', flaps: 0, fullLength: true, engineOutFt: 700 },
  { key: 'kafw_34l_final', label: 'KAFW Alliance 34L', blurb: 'Alliance, north of Fort Worth: long, wide and busy with cargo jets.', kind: 'final', airport: 'KAFW', rwy: '34L', distNm: 5 },
  { key: 'kftw_16_final', label: 'KFTW Meacham 16', blurb: "Meacham, Fort Worth's historic field, just north of downtown Fort Worth.", kind: 'final', airport: 'KFTW', rwy: '16', distNm: 4 },
  { key: 'kgky_34_final', label: 'KGKY Arlington 34', blurb: 'Arlington Municipal: a short 3 NM final, south of the stadiums.', kind: 'final', airport: 'KGKY', rwy: '34', distNm: 3 },
  // Stall recovery drill (0087, stallDrill.js): the Cessna, clean, at 90 KIAS and cruise power.
  { key: 'c172_stall_recovery', label: 'Cessna Stall Recovery Drill', blurb: 'High over Grapevine Lake in the Cessna: power idle, hold the nose up until it stalls, then nose down, wings level, full power, climb away.', kind: 'drill', aircraft: 'c172', pos: [GRAPEVINE_LAKE.x, GRAPEVINE_LAKE.z], aglFt: 4500, kias: 90, hdg: 0, stallDrill: true },
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
// gets its own group after them), then the drills flown away from an airport, then the tours. Every key appears once; empty groups drop.
export const RECOMMENDED_KEY = 'kdfw_35c_final';
const AIRPORT_ORDER = ['KDFW', 'KDAL', 'KADS', 'KAFW', 'KFTW', 'KGKY'];

export function groupMissions(missions) {
  const groups = [{ id: 'recommended', missions: [] }, ...AIRPORT_ORDER.map((id) => ({ id, missions: [] }))];
  const drills = { id: 'drills', missions: [] };
  const tours = { id: 'tours', missions: [] };
  const byId = new Map(groups.map((g) => [g.id, g]));
  for (const m of missions) {
    if (m.key === RECOMMENDED_KEY) { byId.get('recommended').missions.push(m); continue; }
    if (m.kind === 'drill' && !m.airport) { drills.missions.push(m); continue; }
    if (m.kind === 'tour' || !m.airport) { tours.missions.push(m); continue; }
    let g = byId.get(m.airport);
    if (!g) { g = { id: m.airport, missions: [] }; byId.set(m.airport, g); groups.push(g); }
    g.missions.push(m);
  }
  return [...groups, drills, tours].filter((g) => g.missions.length);
}
