// The results card's runway strip (0088): a top-down picture of where the wheels touched.
// Imported by results.js only, so it rides in that lazy chunk. stripLayout and touchdownLabel
// are pure (tests/unit/touchdownStrip.test.js); drawStrip paints a 2D canvas.
// td: gradeLanding's `touchdown` = { pastThresholdM, crossM (+ = right), lengthM, widthM }, plus
// the runway end's displacedM (results.js).
import { ZONE_FULL_M } from './landing.js';
import { AIM_POINT_M } from './airports.js';
// The aiming-point blocks where the 3D runway paints them (main.js: AIM_POINT_M, the 3° path's
// aim, ~1,000 ft, AIM 2-3-3), 150 ft long; the green band is where the grade's "Touchdown zone"
// scores full marks (landing.js ZONE_FULL_M), so the picture and the score agree.
const AIM_LEN_M = 150 * 0.3048;

// Landing left to right: the pavement starts near the left edge (a displaced threshold's
// pavement first, td.displacedM), the far end near the right, with a little ground beyond each
// (an undershoot, an overrun). Across is stretched (a 45 m runway is a few pixels at the
// length's scale): the runway is half the strip's height, so left of centre is up.
export function stripLayout(td, w, h) {
  const r = 3.5;
  const disp = td.displacedM || 0;
  const padX = w * 0.08;
  const endX = Math.max(padX + 1, w * 0.94);
  const pxPerM = (endX - padX) / Math.max(1, td.lengthM + disp);
  const thrX = padX + disp * pxPerM;
  const cy = h / 2;
  const pyPerM = (h * 0.5) / Math.max(1, td.widthM);
  const x = thrX + td.pastThresholdM * pxPerM;
  const y = cy + td.crossM * pyPerM;
  const dotX = Math.min(Math.max(x, r), Math.max(r, w - r));
  const dotY = Math.min(Math.max(y, r), Math.max(r, h - r));
  return {
    w, h, r, padX, thrX, endX, pxPerM, cy, pyPerM,
    edgeTop: cy - (td.widthM / 2) * pyPerM, edgeBottom: cy + (td.widthM / 2) * pyPerM,
    aimX: thrX + AIM_POINT_M * pxPerM, aimLenPx: AIM_LEN_M * pxPerM,
    zoneX0: thrX + ZONE_FULL_M[0] * pxPerM, zoneX1: thrX + ZONE_FULL_M[1] * pxPerM,
    dotX, dotY, clamped: dotX !== x || dotY !== y,
  };
}

export function touchdownLabel(td) {
  const along = Math.abs(Math.round(td.pastThresholdM));
  const short = td.pastThresholdM < 0;
  const parts = [!short ? `${along} metres past the threshold`
    : -td.pastThresholdM <= (td.displacedM || 0) ? `${along} metres before the threshold, on the displaced pavement`
      : `${along} metres short of the threshold`];
  if (td.pastThresholdM > td.lengthM) parts.push("past the runway's end");
  const cross = Math.round(Math.abs(td.crossM));
  parts.push(cross < 1 ? 'on the centreline' : `${cross} metres ${td.crossM > 0 ? 'right' : 'left'} of centre`);
  if (Math.abs(td.crossM) > td.widthM / 2) parts.push('off the runway');
  return `Touched down ${parts.join(', ')}.`;
}

// Hex for the dot, by grade (the card's Tailwind GRADE_COLOURS, which a canvas can't read).
const DOT = { S: '#f0abfc', A: '#6ee7b7', B: '#7dd3fc', C: '#fcd34d', D: '#fb923c', CRASH: '#f87171' };

export function drawStrip(canvas, td, grade) {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1)); // crisp even on a <1x test screen
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const L = stripLayout(td, w, h);
  const top = L.edgeTop, rh = L.edgeBottom - L.edgeTop;
  ctx.fillStyle = '#475569'; // the runway (slate-600)
  ctx.fillRect(L.thrX, top, L.endX - L.thrX, rh);
  if (L.thrX > L.padX) { // a displaced threshold's pavement: darker (takeoff and rollout, not for landing)
    ctx.fillStyle = '#334155';
    ctx.fillRect(L.padX, top, L.thrX - L.padX, rh);
  }
  ctx.fillStyle = 'rgba(52, 211, 153, 0.45)'; // the zone's full marks (emerald)
  ctx.fillRect(L.zoneX0, top, L.zoneX1 - L.zoneX0, rh);
  ctx.fillStyle = '#f8fafc';
  // Threshold piano keys, and an arrow in the ground before them: the way you were landing.
  for (let i = 0; i < 4; i++) ctx.fillRect(L.thrX + 1, top + rh * (0.06 + i * 0.25), 4, rh * 0.13);
  const ax = L.padX * 0.5;
  ctx.beginPath();
  ctx.moveTo(ax - 3, L.cy - 4);
  ctx.lineTo(ax + 3, L.cy);
  ctx.lineTo(ax - 3, L.cy + 4);
  ctx.fill();
  // The aiming point: a solid block either side of the centreline.
  const bw = Math.max(2, L.aimLenPx), bh = rh * 0.22;
  ctx.fillRect(L.aimX, L.cy - rh * 0.36, bw, bh);
  ctx.fillRect(L.aimX, L.cy + rh * 0.36 - bh, bw, bh);
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.6)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(L.thrX + 8, L.cy);
  ctx.lineTo(L.endX, L.cy);
  ctx.stroke();
  ctx.setLineDash([]);
  // The dot: a dark ring in a white halo, so every grade's colour stands out on the runway and
  // the zone. Off the picture (pinned to its edge) it is hollow: past here, not here.
  ctx.beginPath();
  ctx.arc(L.dotX, L.dotY, L.r, 0, Math.PI * 2);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#f8fafc';
  ctx.stroke();
  ctx.fillStyle = L.clamped ? '#0f172a' : DOT[grade] || DOT.B;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = L.clamped ? DOT[grade] || DOT.B : '#0f172a';
  ctx.stroke();
}
