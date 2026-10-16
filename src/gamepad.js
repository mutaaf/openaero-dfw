// Gamepad support (standard mapping). Pure helpers are unit-tested; pollGamepad() is the
// thin browser wrapper called once per frame from main.js.
//
// Mapping: left stick = roll/pitch (stick back = nose up), LB/RB = rudder,
// RT/LT = throttle up/down, A = flaps, B = gear, X = brakes, Y = camera,
// Start = pause, D-pad up = ILS autoland.

export const DEADZONE = 0.12;
export const EXPO = 0.35;

// Deadzone + expo: zero near centre, gentle around it, full scale at the edges.
export function shapeAxis(v, deadzone = DEADZONE, expo = EXPO) {
  const a = Math.abs(v);
  if (a <= deadzone) return 0;
  const n = Math.min(1, (a - deadzone) / (1 - deadzone));
  return Math.sign(v) * ((1 - expo) * n + expo * n * n * n);
}

const val = (b) => (b ? (typeof b.value === 'number' ? b.value : b.pressed ? 1 : 0) : 0);
const down = (b) => !!(b && b.pressed);

export function gamepadTargets(axes, buttons) {
  const roll = shapeAxis(axes[0] || 0);
  const pitch = -shapeAxis(axes[1] || 0);
  const yaw = (down(buttons[5]) ? 1 : 0) - (down(buttons[4]) ? 1 : 0);
  const throttleRate = val(buttons[7]) - val(buttons[6]);
  const active = roll !== 0 || pitch !== 0 || yaw !== 0 || Math.abs(throttleRate) > 0.05;
  return { roll, pitch: pitch === 0 ? 0 : pitch, yaw, throttleRate: Math.abs(throttleRate) > 0.05 ? throttleRate : 0, active };
}

// Indices of buttons that went from released to pressed since `prev` (array of booleans).
export function buttonEdges(prev, buttons) {
  const edges = [];
  for (let i = 0; i < buttons.length; i++) {
    if (down(buttons[i]) && !prev[i]) edges.push(i);
  }
  return edges;
}

export const BUTTON = { A: 0, B: 1, X: 2, Y: 3, START: 9, DPAD_UP: 12 };

// Browser wrapper: returns { targets, edges, id } for the first connected pad, or null.
let prevPressed = [];
export function pollGamepad() {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  const pads = navigator.getGamepads();
  for (const p of pads) {
    if (!p || !p.connected) continue;
    const targets = gamepadTargets(p.axes, p.buttons);
    const edges = buttonEdges(prevPressed, p.buttons);
    prevPressed = Array.from(p.buttons, down);
    return { targets, edges, id: p.id };
  }
  prevPressed = [];
  return null;
}
