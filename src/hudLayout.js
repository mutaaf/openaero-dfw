// Canvas HUD geometry that depends on the screen (pure, tested).

// The speed and altitude tapes span cy - 90 … cy + 90; the heading box is 24 px tall.
export const TAPE_TOP = -90;
export const HEADING_BOX_H = 24;
// Just under the phone's top bar (☰ Menu + telemetry, and the coach or an alert in
// landscape, which can wrap to three lines on a narrow phone and end ~66 px down).
export const BELOW_TOP_BAR = 72;

// Top of the TRK heading box: cy - 145 where there is room; on a phone held sideways it
// drops under the top bar. The box is 104 px wide, centred between the tapes (which sit
// at cx - 175 … cx - 131 and cx + 130 … cx + 186, closer in under 390 px: speedTapeX / altTapeX),
// so it may share their rows.
// On a tablet the HUD is drawn larger (0218, hudScale): main.js renderHud draws in a virtual w/s x h/s
// space, whose short side is then at least HUD_SCALE_FROM (600) px, so cy - 145 is always under the
// top bar there and these DOM-bound floors (BELOW_TOP_BAR, the touch deck) only bind on phones (s = 1).
export function headingBoxTop(cy) {
  return Math.max(cy - 145, BELOW_TOP_BAR);
}

// The tapes' inner edges (main.js drawTape) and the altitude readout box, x offset from the
// tape's inner edge, size. The speed tape's scale runs left of cx + SPEED_TAPE_X.
export const SPEED_TAPE_X = -131;
export const ALT_TAPE_X = 130;
export const ALT_BOX = { dx: 8, w: 56, h: 22 };
// On a phone under 390 px across (a 360 px Android, a 375 px iPhone SE / mini) those offsets put the
// speed tape's scale (60 px left of its edge) and the altitude readout (ALT_BOX, 64 px right of its edge)
// off the screen (0217): there both edges move toward the centre so each tape's outer edge stays
// HUD_EDGE px inside it. From 390 px up they are SPEED_TAPE_X / ALT_TAPE_X, unchanged. Even at 320 px the
// inner edges stay ~92 px from the centre, outside the TRK box (±40), the boresight and the pitch
// ladder's numbers (~±52). Pure numbers: main.js calls these every frame.
export const NARROW_HUD_W = 390;
export const TAPE_SCALE_W = 60;
export const HUD_EDGE = 4;
export function speedTapeX(w) {
  return w >= NARROW_HUD_W ? SPEED_TAPE_X : Math.max(SPEED_TAPE_X, HUD_EDGE + TAPE_SCALE_W - w / 2);
}
export function altTapeX(w) {
  return w >= NARROW_HUD_W ? ALT_TAPE_X : Math.min(ALT_TAPE_X, w / 2 - HUD_EDGE - ALT_BOX.dx - ALT_BOX.w);
}
// The altitude tape reads above sea level (0132): "MSL" in a small tab just under its readout box,
// right of the major ticks (9 px), where drawTape leaves out the scale's numbers. The top bar's
// AGL is the main wheels' radio altitude (0122). altX: the tape's edge (altTapeX). Whole pixels, so the tab's edges stay sharp
// when cy is a half pixel (an odd height). Writes into `out`.
export const ALT_CAPTION = 'MSL';
export const ALT_CAPTION_W = 26;
export const ALT_CAPTION_H = 13;
export function altCaptionRect(cx, cy, out, altX = ALT_TAPE_X) {
  out.x = Math.round(cx + altX + 12);
  out.y = Math.round(cy + ALT_BOX.h / 2 + 2);
  out.w = ALT_CAPTION_W;
  out.h = ALT_CAPTION_H;
  return out;
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

// The canvas HUD's size on a tablet (0218). Every offset above is in CSS px tuned for a phone; on a
// 10.9" iPad (820x1180) that drew the tapes and their 12 px text at about half the angular size of
// an iPhone's, at arm's length. main.js renderHud draws under setTransform(s): s keeps the HUD the
// share of the screen's short side it has at HUD_SCALE_FROM px, 1 on every phone (short side
// under 600 px, both ways up: their geometry is unchanged to the pixel) and on a fine pointer
// (desktop and laptop layouts were tuned at 1280x720 and are not tablets), capped at HUD_SCALE_MAX:
// iPad mini 744 -> 1.24, iPad Air 820 -> 1.37, from 900 (iPad Pro 12.9, 1024) 1.5.
export const HUD_SCALE_FROM = 600;
export const HUD_SCALE_MAX = 1.5;
export function hudScale(w, h, touch = true) {
  if (!touch || !(w > 0 && h > 0)) return 1;
  return Math.min(HUD_SCALE_MAX, Math.max(1, Math.min(w, h) / HUD_SCALE_FROM));
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
// held sideways) it moves to the right of the altitude tape, level with its top. Left-handed (0221)
// the throttle and trim (or pedals) column stands there, so it goes left of the speed tape's scale,
// just over the stick (styles.css: clamp(56, cx - 195 - 12, 128) px from the deck's 12 px padding, plus
// a 21 px home-indicator inset): under the ATIS card's top-left slot, which reaches ~154 px at 568x320.
export const WIND_BOX_W = 68;
export const WIND_BOX_H = 50;
export const WIND_SHOW_COMPONENTS_FT = 1500;

export function windBoxRect(w, h, out = { x: 0, y: 0, w: WIND_BOX_W, h: WIND_BOX_H }, left = false) {
  const cx = w / 2, cy = h / 2;
  const bottom = Math.min(cy + TAPE_TOP - 2, h * 0.35);
  if (bottom - WIND_BOX_H >= BELOW_TOP_BAR) {
    out.x = Math.min(cx + 126, w - WIND_BOX_W - 2);
    out.y = bottom - WIND_BOX_H;
  } else {
    out.x = Math.min(cx + 192, w - WIND_BOX_W - 2);
    out.y = Math.max(cy + TAPE_TOP, BELOW_TOP_BAR);
    if (left) {
      out.x = w - out.x - WIND_BOX_W;
      const stick = Math.min(128, Math.max(56, cx - 207));
      out.y = Math.max(BELOW_TOP_BAR, h - 33 - stick - 4 - WIND_BOX_H);
    }
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
// bumpy (0195): the METAR's turbulence is moderate or more (turbulence.js isBumpy): 'BUMPY METAR' / 'BUMPY SCN' in amber
// and an amber edge (the edge stays when a wet runway or an IFR report takes the line). storm (0196): 'T-STORM' over all, amber.
export function windReadout(wx, comps, out = {}, bumpy = false, storm = false) {
  const kts = Math.round(wx.windKts || 0);
  const vrb = wx.windDirDeg === null || wx.windDirDeg === undefined;
  out.live = !!wx.live;
  // A wet runway (0108) only ever comes from the METAR's rain, so it takes the source line.
  out.wet = !!wx.wetRunway;
  // An IFR or low-IFR report (AIM 7-1-7, the Worker's fltCat or lowIfr.js's) says so (0092): the
  // ceiling is why the runway is not in sight. 'LIFR METAR' / 'LIFR SCN' fit the box.
  const cat = /IFR/.test(wx.fltCat) && wx.fltCat; // IFR, LIFR (not MVFR)
  out.bumpy = !!bumpy; // the box's edge turns amber (main.js drawWindBox); the line says BUMPY unless WET RWY / IFR has it
  out.storm = !!storm; // 0196: a thunderstorm on the flown field's own live report (main.js sim.precip)
  out.source = out.storm ? 'T-STORM' : out.wet ? 'WET RWY' : cat ? `${cat} ${out.live ? 'METAR' : 'SCN'}` : out.bumpy ? `BUMPY ${out.live ? 'METAR' : 'SCN'}` : out.live ? 'METAR WIND' : 'SCENARIO';
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

// Screen px; s: the HUD's scale (hudScale, 0218), which moves the tapes' top and the verdict's foot.
export function coachClearBottom(h, s = 1) {
  const cy = h / 2;
  return Math.max(cy + GATE_VERDICT_BOTTOM * s, cy + h * 0.12);
}
export function coachOverHud(h, top, bottom, s = 1) {
  return bottom > h / 2 + TAPE_TOP * s && top < coachClearBottom(h, s);
}
