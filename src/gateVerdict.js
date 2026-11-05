// The stabilized gate's verdict on the HUD (0020; a lazy chunk main.js fetches after boot, 0137):
// STABILIZED / UNSTABILIZED and the failing items, three a line, for a few seconds after the gate.
// Also the altitude tape's caption and its plain words for Kid and Learner (0140), off the boot JS.

// Where (pure, tested): 24 px + 16 a line of failing items (two at most), cy + 76 down, 240 px across,
// under the boresight between the tapes. On a screen held upright too short for that over the touch
// deck (its controls start TOUCH_DECK_H over the bottom; 40 px more allows an Android gesture bar or a
// home indicator's inset) it was under the deck, and right under the boresight it covers the green
// ring and the horizon at any nose-up attitude: there (`sky`) it takes the callout caption's slot under
// the heading box (styles.css #calloutCaption, as narrow), in the sky above the horizon, and gives way
// while a caption shows, as the takeoff call does (0137). 132: hudLayout.js GATE_VERDICT_BOTTOM, the
// two-line box's foot, which the coach card's slot clears. Writes into `out`.
export const TOUCH_DECK_H = 207;
export function gateVerdictRect(w, h, lines, out) {
  const cy = h / 2, sky = out.sky = h > w && cy + 132 > h - TOUCH_DECK_H - 40;
  const half = sky ? Math.min(120, w / 2 - 74) : 120;
  out.x = w / 2 - half;
  out.y = sky ? Math.max(cy - 117, 100) : cy + 76;
  out.w = 2 * half;
  out.h = 24 + lines * 16;
  return out;
}

const _box = {};
// sim.gate and sim.gateLines are main.js's, built once at the gate; nothing is allocated per frame.
export function drawGateVerdict(ctx, sim, w, h, captionOn) {
  const g = sim.gate;
  const lines = Math.ceil(g.failing.length / 3);
  const r = gateVerdictRect(w, h, lines, _box), cx = w / 2, y = r.y + 16;
  if (r.sky && captionOn) return;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = g.stable ? '#6ee7b7' : '#fcd34d';
  ctx.fillText(g.stable ? 'STABILIZED' : 'UNSTABILIZED', cx, y + 1);
  // At most 3 items a line (≤ 26 characters, ~205 px): the box holds them, squeezed on a 320 px phone.
  for (let i = 0; i < lines; i++) ctx.fillText(sim.gateLines[i], cx, y + 18 + i * 16, r.w - 8);
}

// The altitude words (0140): Pilot reads MSL under the tape's readout and AGL on the phone's top bar
// (0132); Kid and Learner read plain words for the same numbers, "SEA LVL" and "GROUND". The tab
// (hudLayout.js altCaptionRect, 26 px for MSL) is 51 px for the plain word: seven 11 px monospace
// glyphs (~46 px) and a margin, still inside the readout box's column. The top bar's word is index.html's
// (.assist-pilot shows AGL, else GROUND), so the boot JS carries none of them. Pure, tested.
const PILOT_WORDS = { alt: 'MSL', altW: 26, agl: 'AGL' };
const PLAIN_WORDS = { alt: 'SEA LVL', altW: 51, agl: 'GROUND' };
export function altLabels(level) {
  return level === 'pilot' ? PILOT_WORDS : PLAIN_WORDS;
}

// Draws the tab main.js placed (`r`, from altCaptionRect) with the level's word, and writes its width
// and text into `r` (the ?debug snapshot reads them). On a phone under ~390 px across the readout box
// itself runs past the screen's edge: the tab stops at it (screenW) and the word drops to 9 px (seven
// glyphs ~38 px: whole at 375 px, ~5% squeezed by maxWidth at 360 px; at 320 px the box and both
// tabs are cut by the edge, as MSL was before).
// An opaque-enough tab keeps 4.5:1 over bright imagery.
// The same call draws the wind box's plain words (0142) when main.js passes sim and the wind box
// (one call from the boot chunk for both: its budget has no room for a second).
export function drawAltCaption(ctx, r, level, screenW, s, windBox) {
  if (s) drawWind(ctx, windBox, s, level);
  const words = altLabels(level);
  r.w = level === 'pilot' ? words.altW : Math.min(words.altW, Math.floor(screenW - r.x)); // Pilot's tab is 0132's
  r.text = words.alt;
  ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = '#e0f2fe';
  ctx.font = r.w < words.altW ? 'bold 9px monospace' : 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(words.alt, r.x + r.w / 2, r.y + r.h - 2.5, r.w - 2);
  ctx.textAlign = 'left';
}

// The wind box's plain words (0142): Kid and Learner read which side the wind is on and what it means,
// on a final, where the box shows its XW/HW numbers (hudLayout.js windReadout). The FAA's Airplane
// Flying Handbook (FAA-H-8083-3C, ch. 9, crosswind approach and landing) holds the nose into the wind
// (a crab or a wing low) to stay on the centreline: Learner reads AIM INTO IT, the angle you hold, not a
// turn to keep making. Kid's final guide flies that itself and stops while the stick is held
// (assists.js handsOff), so Kid reads HANDS OFF, as its coach says. A crosswind of 3 kt or more takes the
// words unless a stronger tailwind does; with the wind behind, the airplane floats further and rolls
// longer (amber, as the box's TW); a headwind lowers the groundspeed, so the roll is shorter (ch. 9). Under
// 3 kt either way there are no words. Pure, tested; the lines are constants (nothing allocated per
// frame). xwKts > 0 is a wind from the right.
const WIND_WORDS = {
  right: ['RIGHT WIND', 'AIM INTO IT'], left: ['LEFT WIND', 'AIM INTO IT'],
  kidRight: ['RIGHT WIND', 'HANDS OFF'], kidLeft: ['LEFT WIND', 'HANDS OFF'],
  tail: ['TAILWIND', 'FLOATS LONG'], head: ['HEADWIND', 'SHORT ROLL'],
};
export function windPlainWords(xwKts, hwKts, kid = false) {
  if (xwKts === null || hwKts === null) return null;
  const x = Math.abs(xwKts);
  if (x >= 3 && x >= -hwKts) return WIND_WORDS[(kid ? 'kid' : '') + (xwKts > 0 ? (kid ? 'Right' : 'right') : (kid ? 'Left' : 'left'))];
  if (hwKts <= -3) return WIND_WORDS.tail;
  return hwKts >= 3 ? WIND_WORDS.head : null;
}

// Their strip: as wide as the wind box (`box`, hudLayout.js windBoxRect), 24 px, two 9 px lines (11
// glyphs, ~60 px, fit its 68). Over the box where that stays under the top bar (72 px, hudLayout.js
// BELOW_TOP_BAR): the box's foot is the line it keeps off the tapes and horizon. Else (a phone held
// sideways under a short top margin, where the box sits right of the altitude tape) under it. On a short
// screen held upright the coach card takes the top slot (main.js placeCoach, .coach-top) and would cover the
// strip: drawWind leaves it out while the card is there (the device panel). Writes `out`.
export const WIND_PLAIN_H = 24;
export function windPlainRect(box, out) {
  out.x = box.x;
  out.w = box.w;
  out.h = WIND_PLAIN_H;
  out.y = box.y - WIND_PLAIN_H - 2 >= 72 ? box.y - WIND_PLAIN_H - 2 : box.y + box.h + 2;
  return out;
}

// drawAltCaption calls this every frame with sim, the wind box (hudLayout.js windBoxRect, main.js _windBox)
// and the level; it writes the words and the strip into sim.hudWind (the ?debug snapshot reads
// plain/plainBox), null for Pilot. Not on the ground or under 30 ft of radio altitude: in the flare the
// assists de-crab and on the runway the airplane weathervanes into the wind, so the final's words no
// longer fit (the physics panel). The box is the one drawWindBox placed last frame (same screen).
const _plain = {};
let coachEl = null;
export function drawWind(ctx, box, s, level) {
  const hw = s.hudWind;
  coachEl ||= globalThis.document?.getElementById('coach');
  const coachTop = coachEl && coachEl.classList.contains('coach-top') && !coachEl.classList.contains('hidden');
  const words = level === 'pilot' || s.onGround || s.raFt < 30 || coachTop ? null : windPlainWords(hw.xwKts, hw.hwKts, level === 'kid');
  hw.plain = words;
  hw.plainBox = words && windPlainRect(box, _plain);
  if (!words) return;
  const r = _plain;
  ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = words === WIND_WORDS.tail ? '#fcd34d' : '#e0f2fe';
  ctx.fillText(words[0], r.x + 3, r.y + 10, r.w - 6);
  ctx.fillText(words[1], r.x + 3, r.y + 21, r.w - 6);
}
