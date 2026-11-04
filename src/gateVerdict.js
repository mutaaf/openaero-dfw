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
// and text into `r` (the ?debug snapshot reads them). On a 375 px phone the readout box itself runs
// past the screen's edge: the tab stops at it (screenW) and the word is squeezed to fit (~10%).
// An opaque-enough tab keeps 4.5:1 over bright imagery.
export function drawAltCaption(ctx, r, level, screenW) {
  const words = altLabels(level);
  r.w = Math.min(words.altW, Math.floor(screenW - r.x));
  r.text = words.alt;
  ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = '#e0f2fe';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(words.alt, r.x + r.w / 2, r.y + r.h - 2.5, r.w - 2);
  ctx.textAlign = 'left';
}
