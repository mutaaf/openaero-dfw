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

// Normalised stick position (-1..1 on each axis) from a point inside a rect.
export function stickFromPoint(clientX, clientY, rect) {
  const c = (v) => Math.max(-1, Math.min(1, v));
  return {
    x: c(((clientX - rect.left) / rect.width) * 2 - 1),
    y: c(((clientY - rect.top) / rect.height) * 2 - 1),
  };
}
