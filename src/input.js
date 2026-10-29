// Keyboard state → pilot control targets. Pure mapping, unit-tested.
export const keys = {};

export function pilotTargets(k) {
  let pitch = 0, roll = 0, yaw = 0;
  if (k.KeyW || k.ArrowDown) pitch += 1.0;
  if (k.KeyS || k.ArrowUp) pitch -= 1.0;
  if (k.KeyA || k.ArrowLeft) roll -= 1.0;
  if (k.KeyD || k.ArrowRight) roll += 1.0;
  if (k.KeyQ) yaw -= 1.0;
  if (k.KeyE) yaw += 1.0;
  return { pitch, roll, yaw };
}

// Pitch trim keys (ticket 0094): + = nose up. [ and ] sit in W/S order (nose down, nose up);
// Numpad 7 / 1 are the common desktop-sim keys.
export function trimDirection(k) {
  return (k.BracketRight || k.Numpad1 ? 1 : 0) - (k.BracketLeft || k.Numpad7 ? 1 : 0);
}

// Normalised stick position (-1..1 on each axis) from a point inside a rect.
export function stickFromPoint(clientX, clientY, rect) {
  const c = (v) => Math.max(-1, Math.min(1, v));
  return {
    x: c(((clientX - rect.left) / rect.width) * 2 - 1),
    y: c(((clientY - rect.top) / rect.height) * 2 - 1),
  };
}

// Merge the input sources into one set of control targets. Priority: a held on-screen
// stick (touch or mouse drag) > a deflected gamepad > keyboard. Rudder (yaw) comes from
// the stick-less sources so keyboard Q/E or gamepad shoulders still work while the
// touch stick is held. Returns the source name for the HUD and tests.
export function combineTargets(kb, stick, pad) {
  if (stick && stick.active) {
    const yaw = pad && pad.active && pad.yaw ? pad.yaw : kb.yaw;
    return { pitch: stick.y, roll: stick.x, yaw, source: 'stick' };
  }
  if (pad && pad.active) {
    return { pitch: pad.pitch, roll: pad.roll, yaw: pad.yaw || kb.yaw, source: 'gamepad' };
  }
  return { pitch: kb.pitch, roll: kb.roll, yaw: kb.yaw, source: 'keyboard' };
}

// Throttle (0..1) from a point on a vertical track: top = full power, bottom = idle.
export function throttleFromPoint(clientY, rect) {
  const t = 1 - (clientY - rect.top) / rect.height;
  return Math.max(0, Math.min(1, t));
}

// Touch has no pedals (0110): Pilot taxiing steers the nose wheel with the stick's sideways push, a
// tiller (main.js, below 40 kt; Kid and Learner hold the centreline themselves). Past a quarter of the
// pad (a resting thumb is not a steer), and scaled so full stick turns the airplane at most
// TILLER_MAX_DEG_S at any groundspeed (gsMps): full nose wheel at taxi speeds, a touch of it on the
// roll. wheelbaseM and steerDeg are the airframe's (gear.js). Returns the rudder (-1..1, + = right).
export const TILLER_DEAD = 0.25;
export const TILLER_MAX_DEG_S = 8;
export function tillerRudder(x, gsMps, wheelbaseM, steerDeg) {
  const s = Math.sign(x) * Math.max(0, Math.abs(x) - TILLER_DEAD) / (1 - TILLER_DEAD);
  const full = (TILLER_MAX_DEG_S * Math.PI / 180) * wheelbaseM / (Math.max(0.5, gsMps) * Math.tan(steerDeg * Math.PI / 180));
  return Math.max(-1, Math.min(1, s * Math.min(1, full)));
}
