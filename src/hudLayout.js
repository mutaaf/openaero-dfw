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
