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
