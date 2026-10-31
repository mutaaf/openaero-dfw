// The results card's runway strip (0088): a top-down picture of where the wheels touched.
// Imported by results.js only, so it rides in that lazy chunk. stripLayout and touchdownLabel
// are pure (tests/unit/touchdownStrip.test.js); drawStrip paints a 2D canvas.
// td: gradeLanding's `touchdown` = { pastThresholdM, crossM (+ = right), lengthM, widthM }.
const FT = 0.3048;
// AIM 2-3-3: the aiming point marking starts about 1,000 ft past the threshold, and the
// touchdown zone is the first 3,000 ft (the first third on a runway too short for that).
export const AIM_POINT_M = 1000 * FT;
const AIM_LEN_M = 150 * FT;
export const tdzLengthM = (lengthM) => Math.min(3000 * FT, lengthM / 3);

// Landing left to right: the threshold near the left edge (a little ground before it for an
// undershoot), the far end at the right. Across is stretched (a 45 m runway is a few pixels at
// the length's scale): the runway is half the strip's height, so left of centre is up.
export function stripLayout(td, w, h) {
  const r = 3.5;
  const thrX = w * 0.08;
  const endX = Math.max(thrX + 1, w - 2);
  const pxPerM = (endX - thrX) / Math.max(1, td.lengthM);
  const cy = h / 2;
  const pyPerM = (h * 0.5) / Math.max(1, td.widthM);
  const x = thrX + td.pastThresholdM * pxPerM;
  const y = cy + td.crossM * pyPerM;
  const dotX = Math.min(Math.max(x, r), Math.max(r, w - r));
  const dotY = Math.min(Math.max(y, r), Math.max(r, h - r));
  return {
    w, h, r, thrX, endX, pxPerM, cy, pyPerM,
    edgeTop: cy - (td.widthM / 2) * pyPerM, edgeBottom: cy + (td.widthM / 2) * pyPerM,
    aimX: thrX + AIM_POINT_M * pxPerM, aimLenPx: AIM_LEN_M * pxPerM,
    tdzX: thrX + tdzLengthM(td.lengthM) * pxPerM,
    dotX, dotY, clamped: dotX !== x || dotY !== y,
  };
}

export function touchdownLabel(td) {
  const along = Math.round(td.pastThresholdM);
  const parts = [along < 0 ? `${-along} m short of the threshold` : `${along} m past the threshold`];
  if (td.pastThresholdM > td.lengthM) parts.push("past the runway's end");
  const cross = Math.round(Math.abs(td.crossM));
  parts.push(cross < 1 ? 'on the centreline' : `${cross} m ${td.crossM > 0 ? 'right' : 'left'} of centre`);
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
  ctx.fillStyle = 'rgba(52, 211, 153, 0.3)'; // the touchdown zone (emerald)
  ctx.fillRect(L.thrX, top, L.tdzX - L.thrX, rh);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(L.thrX, top, 2, rh); // threshold bar
  // The aiming point: a solid block either side of the centreline.
  const bw = Math.max(2, L.aimLenPx), bh = rh * 0.22;
  ctx.fillRect(L.aimX, L.cy - rh * 0.36, bw, bh);
  ctx.fillRect(L.aimX, L.cy + rh * 0.36 - bh, bw, bh);
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.6)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(L.thrX + 4, L.cy);
  ctx.lineTo(L.endX, L.cy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(L.dotX, L.dotY, L.r, 0, Math.PI * 2);
  ctx.fillStyle = DOT[grade] || DOT.B;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#0f172a';
  ctx.stroke();
}
