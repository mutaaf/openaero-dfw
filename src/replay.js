// Landing replay (0019, a lazy chunk fetched after boot). main.js records the last 30 s of
// flight at 20 Hz of sim time into one preallocated ring buffer (no allocation after
// construction); REPLAY on the results card plays it back with the physics paused, cycling
// chase → wing → tower so the touchdown is always seen from beside the runway; any key or
// tap goes back to the card. Pure buffer and camera maths (tests/unit/replay.test.js) plus
// the small DOM player at the bottom.

export const REPLAY_S = 30;
export const REPLAY_HZ = 20;
export const REPLAY_CAMS = ['Chase', 'Wing', 'Tower'];
// t, pos xyz, quat xyzw, throttle, gearPos, flapDeg, aileron, elevator, rudder
const STRIDE = 14;

export function createReplayBuffer(seconds = REPLAY_S, hz = REPLAY_HZ) {
  const n = Math.round(seconds * hz);
  return { n, data: new Float64Array(n * STRIDE), head: 0, count: 0, dt: 1 / hz, nextT: -Infinity };
}

export function resetReplay(buf) {
  buf.head = 0;
  buf.count = 0;
  buf.nextT = -Infinity;
}

// One sample when a sample period of sim time has passed (called once a frame; sim time
// stands still while paused, so a pause records nothing). Sim time going back = a new flight.
export function recordReplay(buf, sim) {
  const t = sim.simTime;
  if (buf.count && t < buf.data[((buf.head - 1 + buf.n) % buf.n) * STRIDE]) resetReplay(buf);
  if (t < buf.nextT) return false;
  // On schedule, so frame jitter doesn't thin the rate; after a long gap, start again from now.
  buf.nextT = t - buf.nextT > buf.dt * 2 ? t + buf.dt : buf.nextT + buf.dt;
  const d = buf.data, o = buf.head * STRIDE, p = sim.pos, q = sim.quat;
  d[o] = t;
  d[o + 1] = p.x; d[o + 2] = p.y; d[o + 3] = p.z;
  d[o + 4] = q.x; d[o + 5] = q.y; d[o + 6] = q.z; d[o + 7] = q.w;
  d[o + 8] = sim.throttle;
  d[o + 9] = sim.gearPos ?? (sim.gearDown ? 1 : 0);
  d[o + 10] = sim.flapDeg ?? 0;
  d[o + 11] = sim.aileronInput; d[o + 12] = sim.elevInput; d[o + 13] = sim.rudderInput;
  buf.head = (buf.head + 1) % buf.n;
  if (buf.count < buf.n) buf.count++;
  return true;
}

// The i-th oldest sample's offset into buf.data.
const at = (buf, i) => ((buf.head - buf.count + i + buf.n) % buf.n) * STRIDE;
export const replayStart = (buf) => (buf.count ? buf.data[at(buf, 0)] : 0);
export const replayDuration = (buf) => (buf.count < 2 ? 0 : buf.data[at(buf, buf.count - 1)] - buf.data[at(buf, 0)]);

export function createPose(spec) {
  return {
    spec, groundY: 0, pos: { x: 0, y: 0, z: 0 }, quat: { x: 0, y: 0, z: 0, w: 1 },
    throttle: 0, gearPos: 0, flapDeg: 0, aileronInput: 0, elevInput: 0, rudderInput: 0,
  };
}

// The pose `s` seconds into the recording, interpolated between samples (quaternion nlerp
// on the short arc), written into `out` (createPose). Clamped to the recording's ends.
export function sampleReplay(buf, s, out) {
  if (!buf.count) return out;
  const d = buf.data;
  const t = replayStart(buf) + Math.max(0, s);
  let lo = 0, hi = buf.count - 1;
  if (t >= d[at(buf, hi)]) lo = hi;
  else {
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (d[at(buf, mid)] <= t) lo = mid; else hi = mid;
    }
  }
  const a = at(buf, lo), b = at(buf, Math.min(lo + 1, buf.count - 1));
  const span = d[b] - d[a];
  const f = span > 0 ? Math.min(1, Math.max(0, (t - d[a]) / span)) : 0;
  const mix = (k) => d[a + k] + (d[b + k] - d[a + k]) * f;
  out.pos.x = mix(1); out.pos.y = mix(2); out.pos.z = mix(3);
  const sgn = d[a + 4] * d[b + 4] + d[a + 5] * d[b + 5] + d[a + 6] * d[b + 6] + d[a + 7] * d[b + 7] < 0 ? -1 : 1;
  let qx = d[a + 4] + (sgn * d[b + 4] - d[a + 4]) * f, qy = d[a + 5] + (sgn * d[b + 5] - d[a + 5]) * f;
  let qz = d[a + 6] + (sgn * d[b + 6] - d[a + 6]) * f, qw = d[a + 7] + (sgn * d[b + 7] - d[a + 7]) * f;
  const len = Math.hypot(qx, qy, qz, qw) || 1;
  out.quat.x = qx / len; out.quat.y = qy / len; out.quat.z = qz / len; out.quat.w = qw / len;
  out.throttle = mix(8); out.gearPos = mix(9); out.flapDeg = mix(10);
  out.aileronInput = mix(11); out.elevInput = mix(12); out.rudderInput = mix(13);
  return out;
}

// Which camera with `remainingS` of the replay left: the tower for the last 7 s (the flare,
// the touchdown and the second on the wheels before the card), the wing before that, the
// chase for the approach.
export const replayCam = (remainingS) => (remainingS <= 7 ? 2 : remainingS <= 13 ? 1 : 0);

// v rotated by the unit quaternion q, into out.
export function rotate(q, x, y, z, out) {
  const tx = 2 * (q.y * z - q.z * y), ty = 2 * (q.z * x - q.x * z), tz = 2 * (q.x * y - q.y * x);
  out.x = x + q.w * tx + (q.y * tz - q.z * ty);
  out.y = y + q.w * ty + (q.z * tx - q.x * tz);
  out.z = z + q.w * tz + (q.x * ty - q.y * tx);
  return out;
}

// A spot beside the end of the recording, as a tower or a spotter would stand: 150 m back
// along the heading and 120 m to its left, 20 m above the ground there, or level with the
// aircraft less 10 m when it ended in the air (a drill's card at 4,500 ft). The heading is the
// last pose's nose direction, levelled (world frame: +X east, +Y up, -Z north; nose = body -Z).
export function towerSpot(buf, heightAt, spec, out = { x: 0, y: 0, z: 0 }) {
  const end = sampleReplay(buf, replayDuration(buf), createPose(spec));
  const f = rotate(end.quat, 0, 0, -1, { x: 0, y: 0, z: 0 });
  const h = Math.hypot(f.x, f.z) || 1, fx = f.x / h, fz = f.z / h; // left of the track: (fz, -fx)
  out.x = end.pos.x - fx * 150 + fz * 120;
  out.z = end.pos.z - fz * 150 - fx * 120;
  out.y = Math.max(heightAt(out.x, out.z) + 20, end.pos.y - 10);
  return out;
}

// The camera for `cam` (REPLAY_CAMS index) looking at pose `p`: eye, look-at point and up,
// into out = { eye, look, up } of {x, y, z}. Chase sits behind on the levelled heading (it
// doesn't roll with the wings); the wing view is the in-flight left wing-tip camera.
export function replayCamera(cam, p, tower, out) {
  const { eye, look, up } = out;
  if (cam === 1) {
    rotate(p.quat, -p.spec.wingSpanM * 0.48, 1.2, 2.5, eye);
    eye.x += p.pos.x; eye.y += p.pos.y; eye.z += p.pos.z;
    rotate(p.quat, -0.2, 0.4, -20, look);
    look.x += p.pos.x; look.y += p.pos.y; look.z += p.pos.z;
    rotate(p.quat, 0, 1, 0, up);
    return out;
  }
  up.x = 0; up.y = 1; up.z = 0;
  look.x = p.pos.x; look.y = p.pos.y; look.z = p.pos.z;
  if (cam === 2) {
    eye.x = tower.x; eye.y = tower.y; eye.z = tower.z;
    return out;
  }
  const f = rotate(p.quat, 0, 0, -1, eye);
  const h = Math.hypot(f.x, f.z) || 1, back = 12 + p.spec.wingSpanM * 1.2;
  eye.x = p.pos.x - f.x / h * back;
  eye.z = p.pos.z - f.z / h * back;
  eye.y = p.pos.y + 3 + back * 0.12;
  return out;
}

// The player: hides the results card, shows the REPLAY bar, poses the aircraft (o.pose) and
// the camera each frame until the recording ends or any key or tap, then o.done() and the
// card again. step(dt) is called by main.js renderLoop in place of updateCamera.
export function startReplay(o) {
  const { buf, camera, heightAt, spec } = o;
  const byId = (id) => document.getElementById(id);
  const card = byId('resultsCard'), bar = byId('replayBar'), label = byId('txtReplayCam');
  const pose = createPose(spec), view = { eye: { x: 0, y: 0, z: 0 }, look: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 0, z: 0 } };
  const tower = towerSpot(buf, heightAt, spec);
  const total = replayDuration(buf);
  let s = 0, cam = -1, open = true;
  const onKey = (e) => { e.preventDefault(); e.stopImmediatePropagation(); stop(); };
  const onTap = (e) => { e.preventDefault(); e.stopPropagation(); stop(); };
  function stop() {
    if (!open) return;
    open = false;
    removeEventListener('keydown', onKey, true);
    bar.removeEventListener('pointerdown', onTap);
    bar.classList.add('hidden');
    document.body.classList.remove('replaying');
    card.classList.remove('hidden');
    byId('btnReplay').focus({ preventScroll: true });
    o.done();
  }
  function step(dt) {
    if (!open) return;
    s = Math.min(total, s + dt);
    sampleReplay(buf, s, pose);
    pose.groundY = heightAt(pose.pos.x, pose.pos.z);
    o.pose(pose);
    const c = replayCam(total - s);
    if (c !== cam) { cam = c; label.textContent = REPLAY_CAMS[c]; }
    replayCamera(c, pose, tower, view);
    const floor = heightAt(view.eye.x, view.eye.z) + 1.5; // never under the ground
    camera.position.set(view.eye.x, Math.max(view.eye.y, floor), view.eye.z);
    camera.up.set(view.up.x, view.up.y, view.up.z);
    camera.lookAt(view.look.x, view.look.y, view.look.z);
    if (s >= total) stop();
  }
  card.classList.add('hidden');
  bar.classList.remove('hidden');
  document.body.classList.add('replaying');
  addEventListener('keydown', onKey, true);
  bar.addEventListener('pointerdown', onTap);
  bar.focus({ preventScroll: true });
  const player = { step, stop, pose, get elapsed() { return s; }, total, get cam() { return REPLAY_CAMS[cam]; }, get open() { return open; } };
  if (/[?&]debug\b/.test(location.search)) window.openaeroReplay = player; // e2e
  step(0);
  return player;
}
