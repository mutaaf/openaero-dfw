// Canvas HUD geometry that depends on the screen (pure, tested).

// The speed and altitude tapes span cy - 90 … cy + 90; the heading box is 24 px tall.
export const TAPE_TOP = -90;
export const HEADING_BOX_H = 24;
// Just under the phone's top bar (☰ Menu + telemetry, and the coach or an alert in
// landscape, which can wrap to three lines on a narrow phone and end ~66 px down).
export const BELOW_TOP_BAR = 72;

// Top of the TRK heading box: cy - 145 where there is room; on a phone held sideways it
// drops under the top bar. The box is 104 px wide, centred between the tapes (which sit
// at cx - 175 … cx - 131 and cx + 130 … cx + 186), so it may share their rows.
export function headingBoxTop(cy) {
  return Math.max(cy - 145, BELOW_TOP_BAR);
}

// One decimal for a HUD readout that sits near zero (the AoA badge): a tiny negative value
// would print "-0.0", flicker against "0.0" and shift the line it is in.
export function fixed1(v) {
  const s = v.toFixed(1);
  return s === '-0.0' ? '0.0' : s;
}

// The speed limit on the speed tape (0127, 2 px per kt over the tape's ±90 px): `tick` when
// the limit is on the tape's span (y), and an amber band from it up to the tape's top (top,
// bot clamped to the span; `show` false when the limit is above it). Writes into `out`.
export function speedLimitBand(cy, limitKts, iasKts, out) {
  const y = cy - (limitKts - iasKts) * 2;
  out.y = y;
  out.tick = y >= cy + TAPE_TOP && y <= cy - TAPE_TOP;
  out.top = cy + TAPE_TOP;
  out.bot = Math.min(y, cy - TAPE_TOP);
  out.show = out.bot > out.top;
  return out;
}

// The low-speed band on the speed tape (0128, 2 px per kt over ±90 px): red from the tape's
// bottom up to the 1 g stall speed (aero.js stallSpeedKts for where the flaps are), amber from it
// up to STALL_CAUTION × Vs. Each part is clamped to the span and hidden (`red` / `amber` false)
// when it is below it (flying fast). Writes into `out`.
export const STALL_CAUTION = 1.1;
export function stallBand(cy, stallKts, iasKts, out) {
  const top = cy + TAPE_TOP, bot = cy - TAPE_TOP;
  const yVs = cy - (stallKts - iasKts) * 2;
  const yCaution = cy - (stallKts * STALL_CAUTION - iasKts) * 2;
  out.redTop = Math.max(top, yVs);
  out.redBot = bot;
  out.red = out.redTop < bot;
  out.amberTop = Math.max(top, yCaution);
  out.amberBot = Math.min(bot, out.redTop);
  out.amber = out.amberTop < out.amberBot;
  return out;
}

// The ILS fly-to bars (0123) read in dots (aero.js ilsDots, the gate's scale): ILS_PX_PER_DOT per
// dot, a tick at each, clamped at full scale (2 dots: 2.5° of localizer, 0.7° of glideslope, FAA
// AIM 1-1-9), inside the crosshair box's ±ILS_BOX_HALF px. A NaN draws centred.
export const ILS_PX_PER_DOT = 30;
export const ILS_MAX_DOTS = 2;
export const ILS_BOX_HALF = 70;
export function ilsBarOffsetPx(dots, pxPerDot = ILS_PX_PER_DOT, maxDots = ILS_MAX_DOTS) {
  if (!(dots === dots)) return 0;
  return Math.max(-maxDots, Math.min(maxDots, dots)) * pxPerDot;
}

// The takeoff callout's word box (0035): 26 px tall, 232 px wide (24 characters of bold
// 15 px monospace), centred, just under the heading box. On the roll the horizon is at cy
// and rotating moves it down, so the word stays in the sky; it fits between the tapes.
export const TAKEOFF_CALL_H = 26;
export const TAKEOFF_CALL_W = 232;
export function takeoffCallTop(cy) {
  return headingBoxTop(cy) + HEADING_BOX_H + 4;
}

// Camera field of view (ticket 0044). Landscape screens keep the classic 62° vertical. In
// portrait a fixed 62° vertical leaves a keyhole across (31° on a 390x844 phone), so a crab
// or a turn takes the runway off the side: there the vertical opens until the view is
// MIN_HFOV_DEG across, up to MAX_FOV_DEG (an iPad gets the full 60° across, a phone ~42°).
export const BASE_FOV_DEG = 62;
export const MIN_HFOV_DEG = 60;
export const MAX_FOV_DEG = 80;

export function cameraFovDeg(w, h) {
  if (!(w > 0 && h > 0)) return BASE_FOV_DEG;
  const v = 2 * Math.atan(Math.tan((MIN_HFOV_DEG * Math.PI) / 360) / (w / h)) * (180 / Math.PI);
  return Math.min(MAX_FOV_DEG, Math.max(BASE_FOV_DEG, v));
}

// Wind readout (0075): a small box over the altitude tape with the wind's source, an arrow
// for where it blows relative to the nose, its speed and, low on a runway, the cross and
// head/tail components. It ends above the tapes and above the horizon band (35% of the
// height) the layout keeps clear; where that leaves no room under the top bar (a phone
// held sideways) it moves to the right of the altitude tape, level with its top.
export const WIND_BOX_W = 68;
export const WIND_BOX_H = 50;
export const WIND_SHOW_COMPONENTS_FT = 1500;

export function windBoxRect(w, h, out = { x: 0, y: 0, w: WIND_BOX_W, h: WIND_BOX_H }) {
  const cx = w / 2, cy = h / 2;
  const bottom = Math.min(cy + TAPE_TOP - 2, h * 0.35);
  if (bottom - WIND_BOX_H >= BELOW_TOP_BAR) {
    out.x = Math.min(cx + 126, w - WIND_BOX_W - 2);
    out.y = bottom - WIND_BOX_H;
  } else {
    out.x = Math.min(cx + 192, w - WIND_BOX_W - 2);
    out.y = Math.max(cy + TAPE_TOP, BELOW_TOP_BAR);
  }
  out.w = WIND_BOX_W;
  out.h = WIND_BOX_H;
  return out;
}

// Cross and head/tail components belong to the runway you are about to use: under
// WIND_SHOW_COMPONENTS_FT, within ~11 NM of its threshold (or on it) and within 1.5 km of
// its centreline. The active runway is kept after you leave it, so this asks where you are.
// approach is approachGeometry's { distM, crossM } for that end.
export function nearRunwayForWind(approach, runwayLengthM, aglFt) {
  return aglFt < WIND_SHOW_COMPONENTS_FT && approach.distM < 20000
    && approach.distM > -((runwayLengthM || 4000) + 300) && Math.abs(approach.crossM) < 1500;
}

// The arrow's screen angle (deg clockwise from straight up = the nose): where the wind blows
// TO, given where it blows FROM (true) and the aircraft's true heading. Null when there is
// no direction to show (calm or variable).
export function windArrowDeg(fromDeg, kts, hdgDeg) {
  if (fromDeg === null || fromDeg === undefined || !(Math.round(kts) >= 2)) return null;
  return (((fromDeg - hdgDeg + 180) % 360) + 360) % 360;
}

// The readout's text (pure; main.js refreshes it once a second, so the HUD allocates
// nothing per frame). wx is the weather module's record ({ windDirDeg, windKts, gustKts,
// live, wetRunway }); comps is runwayWindComponents for the active runway, or null when there is none
// or the aircraft is above WIND_SHOW_COMPONENTS_FT.
export function windReadout(wx, comps, out = {}) {
  const kts = Math.round(wx.windKts || 0);
  const vrb = wx.windDirDeg === null || wx.windDirDeg === undefined;
  out.live = !!wx.live;
  // A wet runway (0108) only ever comes from the METAR's rain, so it takes the source line.
  out.wet = !!wx.wetRunway;
  out.source = out.wet ? 'WET RWY' : out.live ? 'METAR WIND' : 'SCENARIO';
  out.calm = kts < 2;
  // The arrow reads these, so it always agrees with the text it sits beside.
  out.dirDeg = vrb ? null : wx.windDirDeg;
  out.kts = kts;
  // As the METAR reads it (true direction / speed, G gust), so a pilot can check it.
  out.speed = out.calm ? 'CALM'
    : `${vrb ? 'VRB' : String(Math.round(wx.windDirDeg) % 360).padStart(3, '0')}/${kts}${wx.gustKts > wx.windKts ? `G${Math.round(wx.gustKts)}` : ''}`;
  out.xwKts = null;
  out.hwKts = null;
  out.xw = '';
  out.hw = '';
  if (comps && !out.calm && !vrb) {
    const xw = Math.round(comps.crosswindKts), hw = Math.round(comps.headwindKts);
    out.xwKts = xw;
    out.hwKts = hw;
    out.xw = `XW ${Math.abs(xw)}${xw > 0 ? 'R' : xw < 0 ? 'L' : ''}`;
    out.hw = `${hw >= 0 ? 'HW' : 'TW'} ${Math.abs(hw)}`;
  }
  return out;
}

// The coach card (0130). Its CSS slot sits just over the touch deck; on a short screen held
// upright (Safari with its bars, ~390x664; an iPhone SE, 375x548) that is over the speed tape's
// low end, the SPD target label (baseline cy + 106), the stabilized-gate verdict (main.js
// drawGateVerdict: cy + 76 to cy + 132 with two lines) and the ground just under the horizon, where
// the runway and the PAPI are on a final (12% of the height is ~11° under the level horizon, cy, at
// the portrait FOV cap). coachClearBottom is where that ends; coachOverHud says a card spanning
// top..bottom crosses that band (from the tapes' top down); main.js then moves it to
// COACH_TOP_SLOT, the sky under the top bar (its 44 px row starts 8 px down, or under the status
// bar's inset when installed: styles.css adds env(safe-area-inset-top), this is the inset-0 case).
export const COACH_TOP_SLOT = 58;
export const GATE_VERDICT_BOTTOM = 132;
export function coachClearBottom(h) {
  const cy = h / 2;
  return Math.max(cy + GATE_VERDICT_BOTTOM, cy + h * 0.12);
}
export function coachOverHud(h, top, bottom) {
  return bottom > h / 2 + TAPE_TOP && top < coachClearBottom(h);
}
