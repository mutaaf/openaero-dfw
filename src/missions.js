// Mission catalogue. Approaches and takeoffs are defined by a real runway end (airports.js);
// tours spawn a few km south of their landmark (landmarks.js), heading straight at it. The
// <select> and mission loader are built from this table.
import { DOWNTOWN_DALLAS, ATT_STADIUM } from './landmarks.js';
import { latLonToSimMeters } from './geo.js';
import { TIME_MODES } from './sun.js';

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
// Joining the pattern (0187, pattern.js entryLeg): 4 NM out on the 45° line to the downwind's middle
// (abeam the runway's midpoint, 0.75 NM east), heading it (295°: a right turn onto the 340° downwind).
const ADS_ENTRY = latLonToSimMeters(32.94468, -96.75069);
// The power-off 180 (0189, power180.js): a left downwind for 16 half a mile east of the centreline, abeam the
// spot (the 1,000 ft aiming-point marking past the displaced threshold; tests/unit/power180.test.js checks it).
const ADS_ABEAM_SPOT = latLonToSimMeters(32.97555, -96.82898);

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
  // Night and dusk (0060): `sun` flies that When? preset for the mission's run only (missionSun).
  // Low-ceiling ILS (0092, lowIfr.js): a scripted LIFR report (400 ft broken, 2 SM), the Weather group.
  { key: 'kdfw_35c_low_ifr', label: 'KDFW 35C Low Ceiling ILS (5 NM)', blurb: 'A scripted foggy day: cloud down to 400 ft and 2 miles of mist. Fly the ILS bars down through the grey; at 200 ft, minimums: lights in sight, land; if not, go around.', kind: 'final', airport: 'KDFW', rwy: '35C', distNm: 5, lowIfr: true, group: 'weather' },
  { key: 'kdfw_35c_night', label: 'KDFW 35C Night ILS (4 NM)', blurb: 'Flown at night: follow the sequenced flashers of the approach lights and the PAPI down to the lit runway. Your When? comes back after.', kind: 'final', airport: 'KDFW', rwy: '35C', distNm: 4, sun: 'Night' },
  // Wake turbulence (0115, wake.js): the Cessna behind the traffic 737 (traffic.js) landing on the same runway;
  // flown at midday (the jet has no lights yet: none after dark). AIM 7-4-6's procedure is graded, no vortex is flown.
  { key: 'kdfw_35c_wake', label: 'KDFW 35C Wake Turbulence (Cessna)', blurb: 'A 737 lands ahead of you on 35C, and its wake sinks behind it: stay a little above its path, see where it touches down, and land past that. On Kid the plane does it for you. No real wake will push you: the card checks how you flew it. Flown at midday; your When? comes back after.', kind: 'final', airport: 'KDFW', rwy: '35C', distNm: 5, aircraft: 'c172', wake: true, sun: 'Noon' },
  { key: 'kdfw_17c_final', label: 'KDFW RWY 17C (South Flow 4 NM)', blurb: 'South flow: the centre runway flown from the north, the way DFW lands in a south wind.', kind: 'final', airport: 'KDFW', rwy: '17C', distNm: 4 },
  { key: 'kdfw_36l_final', label: 'KDFW RWY 36L (West Side 6 NM)', blurb: 'A longer 6 NM final from the south to the west-side runway.', kind: 'final', airport: 'KDFW', rwy: '36L', distNm: 6 },
  { key: 'kdfw_13r_final', label: 'KDFW RWY 13R (Diagonal 5 NM)', blurb: "One of DFW's two diagonal runways, on the west side: a course off the north-south grid.", kind: 'final', airport: 'KDFW', rwy: '13R', distNm: 5 },
  { key: 'kdal_31r_final', label: 'KDAL Love Field 31R Final', blurb: "Into Love Field from the south-east, over the Dallas neighbourhoods near the field.", kind: 'final', airport: 'KDAL', rwy: '31R', distNm: 4 },
  { key: 'kdal_31r_dusk', label: 'KDAL Love Field 31R at Dusk', blurb: 'Flown at dusk: into Love Field from the south-east as the sun gets low over Dallas, a warm sky and the low sun out to the west. Your When? comes back after.', kind: 'final', airport: 'KDAL', rwy: '31R', distNm: 4, sun: 'Dusk' },
  { key: 'kdal_13l_final', label: 'KDAL Love Field 13L (Over Downtown)', blurb: 'Into Love Field from the north-west with the downtown skyline ahead.', kind: 'final', airport: 'KDAL', rwy: '13L', distNm: 5 },
  { key: 'kads_16_final', label: 'KADS Addison 16 (Short Field)', blurb: "A 3 NM final into Addison's strip, hemmed in by North Dallas office towers.", kind: 'final', airport: 'KADS', rwy: '16', distNm: 3 },
  // Dead-stick challenge (0036, deadStick.js): the Cessna's engine has quit, 3,500 ft up.
  { key: 'deadstick_kads_16', label: 'KADS Dead-Stick Challenge (Cessna)', blurb: 'Your engine stops over North Dallas, 2 NM from Addison: glide at 68 knots, turn back to the runway when the coach says, and land it.', kind: 'drill', airport: 'KADS', rwy: '16', aircraft: 'c172', pos: [ADS_ABEAM.x, ADS_ABEAM.z], aglFt: 3500, kias: 75, hdg: 340, deadStick: true },
  // Traffic pattern (0048, pattern.js): downwind, base and final, coached; the landing graded as usual.
  { key: 'pattern_kads_16', label: 'KADS Traffic Pattern (Cessna)', blurb: 'Fly around the airport like a pilot: downwind 1,000 ft above the field, base, final, land.', kind: 'drill', airport: 'KADS', rwy: '16', aircraft: 'c172', pos: [ADS_DOWNWIND.x, ADS_DOWNWIND.z], aglFt: 1000, kias: 85, hdg: 340, pattern: true },
  // Joining the pattern (0187, pattern.js entryLeg): the 45° entry to that downwind, then the circuit; the join is graded on the card.
  { key: 'pattern_entry_kads', label: 'KADS Join the Pattern (Cessna)', blurb: 'Arrive the way pilots do: 4 NM out, level at 1,000 ft above the field. Fly the 45° to meet the downwind abeam the middle of Addison\'s runway, turn right onto it, then fly the pattern and land. The card checks you joined level at 1,000 ft, on the 45°, at 70-100 knots; skip the downwind and the best is C.', kind: 'drill', airport: 'KADS', rwy: '16', aircraft: 'c172', pos: [ADS_ENTRY.x, ADS_ENTRY.z], aglFt: 1000, kias: 90, hdg: 295, pattern: true, entry: true },
  // Power-off 180 (0189, power180.js, the dead-stick's machinery): the engine quits abeam the spot, 1,000 ft up; land on it.
  { key: 'pad_180_kads_16', label: 'KADS Power-Off 180 (Cessna)', blurb: 'The engine quits on downwind, 1,000 ft up, abeam the white blocks on 16. Glide at 68 knots, pick your turn, land on the blocks or up to 200 ft past, never short.', kind: 'drill', airport: 'KADS', rwy: '16', aircraft: 'c172', pos: [ADS_ABEAM_SPOT.x, ADS_ABEAM_SPOT.z], aglFt: 1000, kias: 85, hdg: 340, deadStick: true, power180: true, group: 'drills' },
  // Engine failure after takeoff (0104, engineOut.js): the Cessna's engine quits in the climb out of 16.
  // POH normal takeoff (flaps 0°) from the start of the pavement (16's displaced 979 ft is usable for it).
  // Short-field landing (0181, shortField.js): the POH's technique to Addison 16's numbers, graded against Fig. 5-11's roll.
  { key: 'kads_16_short_field', label: 'KADS Short-Field Landing (Cessna)', blurb: 'Addison 16 the Cessna handbook\'s way: 3 NM out at 70 knots, flaps up. Full flaps, 61 knots on the PAPI, idle at the runway\'s edge, touch down before the big white blocks (1,000 ft) and brake at once. Your roll is graded against the handbook\'s.', kind: 'final', airport: 'KADS', rwy: '16', distNm: 3, aircraft: 'c172', kias: 70, flaps: 0, shortField: true, group: 'drills' },
  // No-flap landing (0210, noFlap.js): the flap lever stuck at 0°; POH Section 4's flaps-up 65-75 KIAS, a flatter, faster final and a longer float.
  { key: 'kads_16_no_flap', label: 'KADS No-Flap Landing (Cessna)', blurb: 'Addison 16 with the flaps stuck up: the lever won\'t move. 4 NM out: 70 knots on the PAPI (the handbook\'s 65-75 with the flaps up; on Kid the plane flies the speed). The nose sits higher and it floats further: hold it off, don\'t force it down, then brake. Your roll is shown beside an estimate for a flaps-30 landing.', kind: 'final', airport: 'KADS', rwy: '16', distNm: 4, aircraft: 'c172', kias: 70, flaps: 0, noFlap: true, group: 'drills' },
  // Wing-low crosswind landing (0188, wingLow.js): AFH ch. 9 (pp. 9-15 to 9-17), the upwind wheel first; Addison's METAR when it blows across, else a scenario wind.
  { key: 'kads_crosswind_wing_low', label: 'KADS Crosswind Landing, Wing-Low (Cessna)', blurb: 'Addison 16 with the wind blowing across it: Addison\'s live wind when it blows 5-15 knots across 16 without a tailwind, else 12 knots from the right. The handbook\'s wing-low way: rudder to point the nose down the runway, lower the wing into the wind just enough to stop the drift, keep it down through the flare and touch down on the upwind wheel first. On a touch screen (Learner and Pilot) the RUD buttons under your left thumb are the pedals.', kind: 'final', airport: 'KADS', rwy: '16', distNm: 2, aircraft: 'c172', kias: 70, flaps: 1, wingLow: true, group: 'drills' },
  // Soft-field takeoff (0182, softField.js): flaps 10, the stick back through the roll on a soft surface's drag (a game surface).
  { key: 'kads_16_soft_field', label: 'KADS Soft-Field Takeoff (Cessna)', blurb: 'Addison 16 made soft for the lesson (the drag of soft turf: a game surface, the real runway is paved). Flaps 10, nose up from the start and full power: keep the nose wheel light, ease off as the nose comes up and hold about 11°, let it fly off slow, stay just above the runway until 74 knots, then climb. You start stopped; on a real soft field you keep rolling.', kind: 'takeoff', airport: 'KADS', rwy: '16', aircraft: 'c172', flaps: 1, fullLength: true, softField: true, group: 'drills' },
  { key: 'efato_kads_16_300', label: 'KADS Engine Failure at 300 ft (Cessna)', blurb: 'Take off from Addison 16 (full power, pull back at 55 knots): the engine quits at 300 ft. Too low to turn back: pitch for 68 knots and land ahead.', kind: 'takeoff', airport: 'KADS', rwy: '16', aircraft: 'c172', flaps: 0, fullLength: true, engineOutFt: 300 },
  { key: 'efato_kads_16_700', label: 'KADS Engine Failure at 700 ft (Cessna)', blurb: 'Take off from Addison 16 (full power, pull back at 55 knots): the engine quits at 700 ft. Climb at 74 knots and a quick 45° turn back can make it; the coach says if today\'s wind and your climb allow it.', kind: 'takeoff', airport: 'KADS', rwy: '16', aircraft: 'c172', flaps: 0, fullLength: true, engineOutFt: 700 },
  { key: 'kafw_34l_final', label: 'KAFW Alliance 34L', blurb: 'Alliance, north of Fort Worth: long, wide and busy with cargo jets.', kind: 'final', airport: 'KAFW', rwy: '34L', distNm: 5 },
  { key: 'kftw_16_final', label: 'KFTW Meacham 16', blurb: "Meacham, Fort Worth's historic field, just north of downtown Fort Worth.", kind: 'final', airport: 'KFTW', rwy: '16', distNm: 4 },
  { key: 'kgky_34_final', label: 'KGKY Arlington 34', blurb: 'Arlington Municipal: a short 3 NM final, south of the stadiums.', kind: 'final', airport: 'KGKY', rwy: '34', distNm: 3 },
  // Stall recovery drill (0087, stallDrill.js): the Cessna, clean, at 90 KIAS and cruise power.
  { key: 'c172_stall_recovery', label: 'Cessna Stall Recovery Drill', blurb: 'High over Grapevine Lake in the Cessna: power idle, hold the nose up until it stalls, then nose down, wings level, full power, climb away.', kind: 'drill', aircraft: 'c172', pos: [GRAPEVINE_LAKE.x, GRAPEVINE_LAKE.z], aglFt: 4500, kias: 90, hdg: 0, stallDrill: true },
  // Power-on (departure) stall (0191, powerOnStall.js): flaps 10 at lift-off speed (AFH pp. 5-17/5-18), then full power and the nose up.
  { key: 'c172_power_on_stall', label: 'Cessna Power-On Stall Drill', blurb: 'The stall that catches pilots after takeoff. High over Grapevine Lake, flaps 10, slow: full power, raise the nose to 20° and hold it, heading steady, until it stalls. Then nose down, wings level, keep the power in, flaps up and climb away.', kind: 'drill', aircraft: 'c172', pos: [GRAPEVINE_LAKE.x, GRAPEVINE_LAKE.z], aglFt: 4500, kias: 60, flaps: 1, hdg: 0, stallDrill: true, powerOn: true },
  // Steep turns (0161, steepTurns.js): the Cessna, clean, at 95 KIAS (under its 105 KIAS VA), level.
  { key: 'steep_turns', label: 'Cessna Steep Turns', blurb: 'Over Grapevine Lake: roll into a 45° bank, all the way round and back the other way, holding your height (±100 ft) and speed. The pilot test\'s standard.', kind: 'drill', aircraft: 'c172', pos: [GRAPEVINE_LAKE.x, GRAPEVINE_LAKE.z], aglFt: 3000, kias: 95, hdg: 0, steepTurns: true },
  // Slow flight (0164, slowFlight.js): the Cessna, clean, at 95 KIAS, slows to just above its stall warning.
  { key: 'c172_slow_flight', label: 'Cessna Slow Flight', blurb: 'Over Grapevine Lake: throttle back and raise the nose until you fly just above the stall warning, then add power to hold your height (±100 ft) and heading (±10°) for 45 seconds without the horn. The pilot test\'s standard.', kind: 'drill', aircraft: 'c172', pos: [GRAPEVINE_LAKE.x, GRAPEVINE_LAKE.z], aglFt: 4500, kias: 95, hdg: 0, slowFlight: true },
  // Emergency descent (0209, emergencyDescent.js): smoke in the cockpit; idle, a 30-45° bank and VA (105 KIAS) down 3,000 ft.
  { key: 'c172_emergency_descent', label: 'Cessna Emergency Descent', blurb: 'Smoke in the cockpit over Grapevine Lake: get down 3,000 ft fast. Power idle, bank 30-45°, nose down to 95-105 knots, never past 163 knots (the never-exceed speed), then level off at the height the coach gives you (±100 ft). The pilot test\'s standard.', kind: 'drill', aircraft: 'c172', pos: [GRAPEVINE_LAKE.x, GRAPEVINE_LAKE.z], aglFt: 5000, kias: 100, hdg: 0, emergencyDescent: true },
  // Unusual attitudes (0174, upset.js): level at 100 KIAS, then the instructor hands it over nose-high or nose-low.
  { key: 'upset_nose_high', label: 'Cessna Unusual Attitude: Nose High', blurb: 'A moment after you start, your instructor pitches the Cessna up steeply, slowing, and hands it over: full power, nose down to the horizon, wings level.', kind: 'drill', aircraft: 'c172', pos: [GRAPEVINE_LAKE.x, GRAPEVINE_LAKE.z], aglFt: 5000, kias: 100, hdg: 0, upset: 'high' },
  { key: 'upset_nose_low', label: 'Cessna Unusual Attitude: Nose Low', blurb: 'A moment after you start, your instructor rolls the Cessna into a steep diving turn and hands it over: throttle to idle, wings level, then nose up. Don\'t pull while banked.', kind: 'drill', aircraft: 'c172', pos: [GRAPEVINE_LAKE.x, GRAPEVINE_LAKE.z], aglFt: 5000, kias: 100, hdg: 0, upset: 'low' },
  { key: 'downtown_skyline', label: 'Downtown Dallas Skyline Tour', blurb: 'Fly past Bank of America Plaza and Reunion Tower over downtown Dallas.', kind: 'tour', pos: [DOWNTOWN_DALLAS.x, 520, DOWNTOWN_DALLAS.z + 3200], speedMps: 108, hdg: 0, throttle: 0.65 },
  { key: 'att_stadium', label: 'Arlington AT&T Stadium', blurb: 'Low over Arlington to AT&T Stadium and the ballpark next door.', kind: 'tour', pos: [ATT_STADIUM.x, 480, ATT_STADIUM.z + 2900], speedMps: 100, hdg: 0, throttle: 0.62 },
];

// `extra`: missions that exist only some days (today's crosswind challenge).
export const missionByKey = (key, extra = []) =>
  extra.find((m) => m.key === key) || MISSIONS.find((m) => m.key === key) || MISSIONS[0];

// Night and dusk missions (0060): a mission with `sun` flies under that When? preset (an index
// into TIME_MODES) for its run only. `before` is the player's own choice it replaced, kept through
// FLY AGAIN and other sun missions and given back by the next mission without one; a choice the
// player makes in between is theirs (main.js drops `before`). Pure.
export function missionSun(mission, mode, before) {
  const i = mission.sun ? TIME_MODES.indexOf(mission.sun) : -1;
  if (i >= 0) return { mode: i, before: before ?? mode };
  return before == null ? { mode, before: null } : { mode: before, before: null };
}

export const CROSSWIND_KEY = 'crosswind_today';

// The start screen's mission picker (ticket 0029) is generated from MISSIONS: the recommended
// first flight on top, then one group per airport in this order (an airport not listed here
// gets its own group after them), then the weather missions (`group: 'weather'`, 0092), then the drills flown away from an
// airport (and `group: 'drills'`, 0181's short-field, 0182's soft-field and 0210's no-flap lessons), then the tours. Every key appears once; empty groups drop.
export const RECOMMENDED_KEY = 'kdfw_35c_final';
const AIRPORT_ORDER = ['KDFW', 'KDAL', 'KADS', 'KAFW', 'KFTW', 'KGKY'];

export function groupMissions(missions) {
  const groups = [{ id: 'recommended', missions: [] }, ...AIRPORT_ORDER.map((id) => ({ id, missions: [] }))];
  const weather = { id: 'weather', missions: [] };
  const drills = { id: 'drills', missions: [] };
  const tours = { id: 'tours', missions: [] };
  const byId = new Map(groups.map((g) => [g.id, g]));
  for (const m of missions) {
    if (m.key === RECOMMENDED_KEY) { byId.get('recommended').missions.push(m); continue; }
    if (m.group === 'weather') { weather.missions.push(m); continue; }
    if (m.group === 'drills' || (m.kind === 'drill' && !m.airport)) { drills.missions.push(m); continue; }
    if (m.kind === 'tour' || !m.airport) { tours.missions.push(m); continue; }
    let g = byId.get(m.airport);
    if (!g) { g = { id: m.airport, missions: [] }; byId.set(m.airport, g); groups.push(g); }
    g.missions.push(m);
  }
  return [...groups, weather, drills, tours].filter((g) => g.missions.length);
}
