// The stabilized gate's verdict on the HUD (0020; a lazy chunk main.js fetches after boot, 0137):
// STABILIZED / UNSTABILIZED and the failing items, three a line, for a few seconds after the gate.

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
