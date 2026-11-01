import { describe, it, expect } from 'vitest';
import {
  createReplayBuffer, recordReplay, resetReplay, replayDuration, replayStart, sampleReplay, createPose,
  replayCam, rotate, towerSpot, replayCamera, REPLAY_S, REPLAY_HZ,
} from '../../src/replay.js';

// A body like main.js's sim, flown along -Z (north) at 70 m/s, its position and inputs a
// known function of sim time.
function body() {
  return {
    simTime: 0, pos: { x: 0, y: 100, z: 0 }, quat: { x: 0, y: 0, z: 0, w: 1 },
    throttle: 0.5, gearPos: 1, flapDeg: 30, aileronInput: 0, elevInput: 0, rudderInput: 0,
  };
}
function fly(buf, b, seconds, frameS = 1 / 60) {
  const frames = Math.round(seconds / frameS);
  for (let i = 0; i < frames; i++) {
    b.simTime += frameS;
    b.pos.z = -70 * b.simTime;
    b.throttle = (b.simTime % 10) / 10;
    recordReplay(buf, b);
  }
}
const SPEC = { wingSpanM: 11 };

describe('replay ring buffer (ticket 0019)', () => {
  it('keeps exactly the last 30 s at 20 Hz: 600 samples, oldest first', () => {
    const buf = createReplayBuffer();
    expect(buf.n).toBe(REPLAY_S * REPLAY_HZ);
    const b = body();
    fly(buf, b, 75);
    expect(buf.count).toBe(600);
    expect(replayDuration(buf)).toBeCloseTo(29.95, 1);
    expect(replayStart(buf)).toBeGreaterThan(75 - 30.1);
    // The newest sample is the latest moment, the oldest ~30 s before it, all in order.
    const p = createPose(SPEC);
    sampleReplay(buf, replayDuration(buf), p);
    expect(p.pos.z).toBeCloseTo(-70 * 75, -1);
    sampleReplay(buf, 0, p);
    expect(p.pos.z).toBeCloseTo(-70 * replayStart(buf), 3);
  });

  it('records at 20 Hz of sim time whatever the frame rate, and nothing while sim time stands still', () => {
    for (const fps of [24, 60, 144]) {
      const buf = createReplayBuffer(), b = body();
      fly(buf, b, 10, 1 / fps);
      expect(Math.abs(buf.count - 200)).toBeLessThanOrEqual(1);
      const before = buf.count;
      for (let i = 0; i < 100; i++) recordReplay(buf, b); // paused
      expect(buf.count).toBe(before);
    }
  });

  it('never allocates after construction: the same storage, whatever is recorded', () => {
    const buf = createReplayBuffer(), data = buf.data, keys = Object.keys(buf).join();
    fly(buf, body(), 120);
    expect(buf.data).toBe(data);
    expect(Object.keys(buf).join()).toBe(keys);
    // sampleReplay writes into the pose it is given and returns it.
    const p = createPose(SPEC), pos = p.pos, quat = p.quat;
    expect(sampleReplay(buf, 3.21, p)).toBe(p);
    expect(p.pos).toBe(pos);
    expect(p.quat).toBe(quat);
  });

  it('starts over on a new flight (sim time going back) and on reset', () => {
    const buf = createReplayBuffer(), b = body();
    fly(buf, b, 20);
    b.simTime = 0;
    fly(buf, b, 5);
    expect(replayDuration(buf)).toBeLessThan(5.01);
    resetReplay(buf);
    expect(buf.count).toBe(0);
    expect(replayDuration(buf)).toBe(0);
  });

  it('interpolates between samples: position linearly, the quaternion on the short arc and unit length', () => {
    const buf = createReplayBuffer(), b = body();
    b.simTime = 1; recordReplay(buf, b);
    b.simTime = 1.05; b.pos.x = 10; b.throttle = 1;
    // 90° yaw, written as the negated quaternion (the same rotation, the long way round).
    const s = Math.SQRT1_2;
    b.quat = { x: 0, y: -s, z: 0, w: -s };
    recordReplay(buf, b);
    const p = sampleReplay(buf, 0.025, createPose(SPEC));
    expect(p.pos.x).toBeCloseTo(5, 6);
    expect(p.throttle).toBeCloseTo(0.75, 6);
    expect(Math.hypot(p.quat.x, p.quat.y, p.quat.z, p.quat.w)).toBeCloseTo(1, 9);
    // Halfway from identity to a 90° yaw is 45°, not a spin the long way.
    expect(2 * Math.acos(Math.abs(p.quat.w)) * 180 / Math.PI).toBeCloseTo(45, 4);
    // Clamped at both ends.
    expect(sampleReplay(buf, -3, createPose(SPEC)).pos.x).toBe(0);
    expect(sampleReplay(buf, 99, createPose(SPEC)).pos.x).toBe(10);
  });
});

describe('replay cameras', () => {
  it('chase on the approach, the wing on short final, the side view for the last 7 s (the touchdown)', () => {
    expect(replayCam(25)).toBe(0);
    expect(replayCam(10)).toBe(1);
    expect(replayCam(7)).toBe(2);
    expect(replayCam(0)).toBe(2);
  });

  it('rotate matches a known rotation: 90° yaw left turns the nose (-Z) to the west (-X)', () => {
    const s = Math.SQRT1_2, r = rotate({ x: 0, y: s, z: 0, w: s }, 0, 0, -1, {});
    expect(r.x).toBeCloseTo(-1, 9);
    expect(r.z).toBeCloseTo(0, 9);
  });

  it('the side view stands behind and left of where the replay ends, 20 m over the ground', () => {
    const buf = createReplayBuffer(), b = body();
    fly(buf, b, 10); // northbound: left is west (-X), behind is south (+Z)
    const t = towerSpot(buf, () => 95, SPEC); // on the wheels: the aircraft 5 m over the ground
    expect(t.x).toBeCloseTo(-120, 3);
    expect(t.z).toBeCloseTo(-70 * 10 + 150, -1);
    expect(t.y).toBe(115);
    // Ended in the air (a drill's card at altitude): level with the aircraft, not 20 m off the ground.
    const high = createReplayBuffer(), hb = body();
    hb.pos.y = 1300;
    fly(high, hb, 10);
    expect(towerSpot(high, () => 7, SPEC).y).toBeCloseTo(1290, 6);
  });

  it('chase sits behind the aircraft and above it, looking at it; wing sits off the left tip', () => {
    const p = createPose(SPEC);
    p.pos = { x: 0, y: 100, z: 0 };
    const out = { eye: {}, look: {}, up: {} };
    replayCamera(0, p, null, out);
    expect(out.eye.z).toBeGreaterThan(10);   // south of a northbound aircraft
    expect(out.eye.y).toBeGreaterThan(100);
    expect(out.look).toEqual({ x: 0, y: 100, z: 0 });
    replayCamera(1, p, null, out);
    expect(out.eye.x).toBeCloseTo(-11 * 0.48, 6);
    expect(out.look.z).toBeLessThan(-10);    // looking ahead along the nose
    replayCamera(2, p, { x: 5, y: 6, z: 7 }, out);
    expect(out.eye).toEqual({ x: 5, y: 6, z: 7 });
  });
});
