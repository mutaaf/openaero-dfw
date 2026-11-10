// Reading a METAR (ticket 0092 moved these out of weather.js and missions.js): the Worker's
// report as the sim's weather object, its cloud layers, and today's crosswind challenge. A lazy
// chunk: main.js fetches it with the first report (nothing at boot reads a METAR), and the
// low-ceiling mission's scripted report (lowIfr.js) goes through the same parser.
// Pure module (no THREE, no DOM); tested in tests/unit/weather.test.js.
import { runwayWindComponents } from './weather.js';
import { CROSSWIND_KEY } from './missions.js';

const HPA_TO_INHG = 0.0295299830714;

function parseVisibility(v) {
  if (v === null || v === undefined) return 10;
  if (typeof v === 'number') return v;
  const s = String(v).replace('+', '').trim();
  // "1 1/2", "1/4", "10"
  return s.split(/\s+/).reduce((sum, part) => {
    if (part.includes('/')) { const [a, b] = part.split('/').map(Number); return sum + (b ? a / b : 0); }
    return sum + (Number(part) || 0);
  }, 0);
}

// A wet runway (ticket 0108): rain or drizzle falling at the field. Read from the raw report
// (the Worker keeps rawOb), its present-weather groups between the time and RMK: intensity,
// a descriptor (SH, TS, FZ, ...), then two-letter phenomena, any of them RA or DZ. Vicinity
// (VC) groups, a thunderstorm with no precipitation, the remarks' begin/end times and an
// international report's trend (TEMPO/BECMG: forecast, not falling) do not count, and nothing
// else ever says "wet".
const WX_GROUP = /^[+-]?(?:MI|PR|BC|DR|BL|SH|TS|FZ)?((?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)+)$/;
export function metarWetRunway(raw) {
  const body = String(raw ?? '').split(/ (?:RMK|TEMPO|BECMG|NOSIG)\b/)[0].split(/\s+/);
  const t = body.findIndex((g) => /^\d{6}Z$/.test(g));
  for (let i = t + 1; i < body.length; i++) {
    const m = t >= 0 && WX_GROUP.exec(body[i]);
    if (m && /^(?:..)*?(?:RA|DZ)/.test(m[1])) return true;
  }
  return false;
}

export function parseMetar(m) {
  const variable = m.wdir === 'VRB' || typeof m.wdir !== 'number';
  const windKts = Number(m.wspd) || 0;
  const gustKts = typeof m.wgst === 'number' && m.wgst > windKts ? m.wgst : windKts;
  const ceilingLayer = (m.clouds || [])
    .filter((c) => ['BKN', 'OVC', 'OVX'].includes(c.cover) && typeof c.base === 'number')
    .sort((a, b) => a.base - b.base)[0];
  return {
    icao: m.icaoId,
    raw: m.rawOb,
    obsTime: m.obsTime,
    windDirDeg: variable || windKts === 0 ? (windKts === 0 ? 0 : null) : m.wdir,
    windKts,
    gustKts,
    visibilitySm: parseVisibility(m.visib),
    ceilingFt: ceilingLayer ? ceilingLayer.base : null,
    ceilingCover: ceilingLayer ? ceilingLayer.cover : null,
    cloudLayers: cloudLayers(m.clouds),
    altimInHg: typeof m.altim === 'number' ? m.altim * HPA_TO_INHG : 29.92,
    tempC: m.temp,
    fltCat: m.fltCat || null,
    wetRunway: metarWetRunway(m.rawOb),
    live: true,
  };
}

// How much of the sky each METAR cover code hides (oktas / 8, mid-range: FEW 1–2, SCT 3–4,
// BKN 5–7, OVC 8).
const COVERAGE = { FEW: 0.2, SCT: 0.45, BKN: 0.75, OVC: 1, OVX: 1 };

// Every reported layer up to FL200, lowest first, at most three: what the sky dome draws.
export function cloudLayers(clouds) {
  return (clouds || [])
    .filter((c) => COVERAGE[c.cover] && typeof c.base === 'number' && c.base <= 20000)
    .sort((a, b) => a.base - b.base)
    .slice(0, 3)
    .map((c) => ({ cover: c.cover, baseFt: c.base, coverage: COVERAGE[c.cover] }));
}

// Today's crosswind challenge (ticket 0018): of every runway end whose field has a live
// METAR, the one with the strongest crosswind and no tailwind (headwind ≥ 0). Crosswinds are
// compared to the whole knot, ties go to the longer runway. Null when nothing qualifies
// (no live weather, calm or variable wind, or under 1 kt of crosswind anywhere). With nowS,
// observations older than 90 minutes are not "today's" wind and are skipped.
export function pickCrosswindRunway(metarsByIcao, ends, nowS = null) {
  let best = null;
  for (const end of ends) {
    const wx = metarsByIcao[end.airport];
    if (!wx || !wx.live || wx.windDirDeg === null || wx.windDirDeg === undefined || !wx.windKts) continue;
    if (nowS !== null && wx.obsTime && nowS - wx.obsTime > 90 * 60) continue;
    const c = runwayWindComponents(wx.windDirDeg, wx.windKts, end.hdgT);
    if (c.headwindKts < 0) continue;
    const xw = Math.round(Math.abs(c.crosswindKts));
    if (xw < 1) continue;
    if (!best || xw > best.xw || (xw === best.xw && (end.lengthM || 0) > (best.end.lengthM || 0))) {
      best = { end, xw, crosswindKts: c.crosswindKts, headwindKts: c.headwindKts };
    }
  }
  return best && { end: best.end, crosswindKts: best.crosswindKts, headwindKts: best.headwindKts };
}

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
