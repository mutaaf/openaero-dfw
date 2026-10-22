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
export const WIND_BOX_W = 64;
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

// The arrow's screen angle (deg clockwise from straight up = the nose): where the wind blows
// TO, given where it blows FROM (true) and the aircraft's true heading. Null when there is
// no direction to show (calm or variable).
export function windArrowDeg(fromDeg, kts, hdgDeg) {
  if (fromDeg === null || fromDeg === undefined || !(kts >= 2)) return null;
  return (((fromDeg - hdgDeg + 180) % 360) + 360) % 360;
}

// The readout's text (pure; main.js refreshes it once a second, so the HUD allocates
// nothing per frame). wx is the weather module's record ({ windDirDeg, windKts, gustKts,
// live }); comps is runwayWindComponents for the active runway, or null when there is none
// or the aircraft is above WIND_SHOW_COMPONENTS_FT.
export function windReadout(wx, comps, out = {}) {
  const kts = Math.round(wx.windKts || 0);
  out.source = wx.live ? 'METAR WIND' : 'SCENARIO';
  out.calm = kts < 2;
  out.speed = out.calm ? 'CALM'
    : `${wx.windDirDeg === null || wx.windDirDeg === undefined ? 'VRB ' : ''}${kts}${wx.gustKts > wx.windKts ? `G${Math.round(wx.gustKts)}` : ' KT'}`;
  out.xwKts = null;
  out.hwKts = null;
  out.xw = '';
  out.hw = '';
  if (comps && !out.calm && wx.windDirDeg !== null && wx.windDirDeg !== undefined) {
    const xw = Math.round(comps.crosswindKts), hw = Math.round(comps.headwindKts);
    out.xwKts = xw;
    out.hwKts = hw;
    out.xw = `XW ${Math.abs(xw)}${xw > 0 ? 'R' : xw < 0 ? 'L' : ''}`;
    out.hw = `${hw >= 0 ? 'HW' : 'TW'} ${Math.abs(hw)}`;
  }
  return out;
}
