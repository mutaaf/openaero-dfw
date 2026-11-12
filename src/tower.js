// The tower's landing clearance (ticket 0145; a lazy chunk, loaded on Start flight like atis.js). One call per final,
// spoken at once (audio.js takeoffCall: it cuts off stale queued coach lines, which the coach says again) and captioned, sound on or off. Phraseology, FAA Order JO 7110.65
// (faa.gov/air_traffic/publications/atpubs/atc_html/): para 3-10-5, "first state the runway number followed by the
// landing clearance": RUNWAY (number) CLEARED TO LAND; para 3-10-1 lists the surface wind in the landing information;
// para 2-4-17 says the wind ("wind", the direction's separate digits to the nearest 10°, "at", the knots' separate
// digits, any gusts) and the runway ("runway", the separate digits, "left"/"right"/"center"); para 2-4-21 names the
// type (group form: "Seven Thirty-seven", "Cessna Four-Oh-One"; a military designator, "F-Sixteen"). No registration
// or airline call sign exists in the game, so the type is the call sign. The tower's wind is magnetic (like the
// ATIS's, atis.js); the METAR's is true. Never the real tower: the caption says "scenario wind" when the weather is not
// a live METAR. No facility name: a tower's radio name needs a chart supplement we have not read.
import { spokenDigits, ATIS_MAG_VAR_DEG } from './atis.js';

const SIDE = { L: 'left', C: 'center', R: 'right' };
export const TOWER_CALLSIGN = { c172: 'Cessna one seventy-two', b738: 'Boeing seven thirty-seven', f16: 'F-sixteen' };

// When: once per runway end, in the air on a steady final to it: descending, inside 5 NM, lined up (within 5° of
// the centreline as seen from the threshold, tracking within ~35° of the runway), at 800 ft above the threshold
// or 2 NM, whichever comes first, and not under 600 ft: the call takes ~5 s and the GPWS "five hundred" (which
// cancels the speech queue, audio.js) and the gate own 500 ft, so it starts at least ~8 s above them. A
// go-around keeps the end cleared: a new final is a different end, or a new mission (main.js loadScenario clears
// sim.towerFor). Never in a drill whose own coach speaks, nor with the engine out.
export const CLEAR_FT = 800;
export const CLEAR_NM = 2;
export const FLOOR_FT = 600;
const NM = 1852, FT = 0.3048;
const QUIET = ['goAround', 'deadStick', 'engineOutFt', 'rto', 'windshear', 'stallDrill', 'pattern', 'steepTurns', 'slowFlight'];

const CONE = Math.tan(5 * Math.PI / 180);
// A plain loop: it runs every frame until the call (no closure per frame, AGENTS.md invariant 4).
export function quietMission(m) {
  if (!m) return false;
  for (let i = 0; i < QUIET.length; i++) if (m[QUIET[i]]) return true;
  return false;
}

export function towerClearance(end, wx, aircraftKey) {
  const [, num, side] = /^(\d+)([LCR]?)$/.exec(end.ident) ?? [, end.ident, ''];
  const rwySay = `runway ${spokenDigits(num)}${side ? ` ${SIDE[side]}` : ''}`;
  const kts = Math.round(wx?.windKts || 0);
  let windSay = 'wind calm', windText = 'Wind calm';
  if (kts) {
    const dir = wx.windDirDeg == null ? null
      : Math.round((((wx.windDirDeg - ATIS_MAG_VAR_DEG) % 360) + 360) % 360 / 10) * 10 || 360;
    const d = dir === null ? ['variable', 'variable'] : [String(dir).padStart(3, '0'), spokenDigits(String(dir).padStart(3, '0'))];
    const gust = wx.gustKts > kts ? Math.round(wx.gustKts) : 0;
    windSay = `wind ${d[1]} at ${spokenDigits(kts)}${gust ? ` gusts ${spokenDigits(gust)}` : ''}`;
    windText = `Wind ${d[0]} at ${kts}${gust ? ` gusts ${gust}` : ''}`;
  }
  const call = TOWER_CALLSIGN[aircraftKey];
  const speech = `${call ? `${call}, ` : ''}${windSay}, ${rwySay}, cleared to land.`;
  // Two parts (main.js keeps each on one line): the first short enough to keep its " ·" on its line at 375 px,
  // the second at most 26 characters, so the caption is two lines at most: "Cleared to land 35C · Wind 350 at 23G32". Whose wind: "scenario" off a live METAR, and a live METAR from
  // another field (main.js currentWeather's DFW fallback) is named, "KDFW wind ...".
  const station = wx?.live && wx.icao && wx.icao !== end.airport ? `${wx.icao} wind` : wx?.live ? 'Wind' : 'Scenario wind';
  const windShort = kts ? windText.replace(/^Wind /, '').replace(' gusts ', 'G') : 'calm';
  const text = `Cleared to land ${end.ident} · ${station} ${windShort}`;
  // On the line while it is said: ~3 words a second at audio.js's voice (rate 1.35), and a second to read the end.
  return { speech, text, holdS: Math.max(4, speech.split(' ').length / 3 + 1) };
}

// Per frame (scalars only until the one call): returns the clearance to say, once, or null.
export function towerStep(sim) {
  const end = sim.activeEnd, ap = sim.approach;
  if (!end || !ap || sim.onGround || sim.towerFor === end.id || sim.engineFailed || quietMission(sim.loadedMission)) return null;
  const aaeFt = (sim.pos.y - (end.thrY ?? 0)) / FT;
  if (sim.vel.y >= 0 || ap.distM <= 0 || ap.distM > 5 * NM || aaeFt < FLOOR_FT) return null;
  if (aaeFt > CLEAR_FT && ap.distM > CLEAR_NM * NM) return null;
  if (Math.abs(ap.crossM) > ap.distM * CONE) return null;
  const r = end.hdgT * Math.PI / 180, vh = Math.hypot(sim.vel.x, sim.vel.z);
  if (sim.vel.x * Math.sin(r) - sim.vel.z * Math.cos(r) < 0.8 * vh) return null;
  sim.towerFor = end.id;
  return towerClearance(end, sim.wx, sim.aircraftKey);
}
