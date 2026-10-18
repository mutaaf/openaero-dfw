// Canvas HUD geometry that depends on the screen (pure, tested).

// The speed and altitude tapes span cy - 90 … cy + 90; the heading box is 24 px tall.
export const TAPE_TOP = -90;
export const HEADING_BOX_H = 24;
// Just under the phone's top bar (☰ Menu + telemetry, and the coach in landscape).
const BELOW_TOP_BAR = 64;

// Top of the TRK heading box: cy - 145 where there is room; on a phone held sideways it
// drops under the top bar, but never into the tapes.
export function headingBoxTop(cy) {
  return Math.max(cy - 145, Math.min(BELOW_TOP_BAR, cy + TAPE_TOP - HEADING_BOX_H));
}
