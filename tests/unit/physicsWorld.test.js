// Ticket 0043: the Rapier world and its tow tractor, flown headless in Node.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import * as R from '@dimforge/rapier3d/rapier.js'; // the package names only a `module` entry
import {
  initRapier, createPhysicsWorld, roadGeometry, laneOffsetM, SERVICE_ROAD, STEP_S, TUG_MPS, WAKE_M, STOP_S, TUG,
} from '../../src/world/physicsWorld.js';
import { ROAD_START, LOAD_M } from '../../src/world/serviceRoad.js';
import { createGround, decodeDem } from '../../src/terrain.js';
import { RUNWAYS_GEOM, RUNWAY_DATA } from '../../src/airports.js';
import { latLonToSimMeters } from '../../src/geo.js';

const require = createRequire(import.meta.url);
const wasmPath = require.resolve('@dimforge/rapier3d/rapier_wasm3d_bg.wasm');

// The game's own ground: the baked DEM with the runways flattened in (terrain.js).
const ground = createGround(RUNWAYS_GEOM);
{
  const bytes = gunzipSync(readFileSync('public/terrain/dfw-dem-v1.bin'));
  ground.setDem(decodeDem(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)));
}
const heightAt = (x, z) => ground.heightAt(x, z);

beforeAll(async () => { await initRapier(readFileSync(wasmPath)); });

// Steps `seconds` with the aircraft beside the road (awake), sampling every 0.25 s.
function run(w, seconds) {
  const trace = [];
  for (let t = 0; t < seconds; t += STEP_S) {
    w.step(STEP_S, w.road.x0, w.road.z0);
    if (w.state.steps % 15 === 0) trace.push(w.snapshot());
  }
  return trace;
}

// A lap and a bit: every sample on 4 wheels, its box clear of the road, never past walking pace; on the
// straights (12 s after a turn) on its lane at the walking pace, both ways; a hold of STOP_S after the lap.
function checkLoop(w) {
  const L = w.road.len;
  const lap = 2 * L / TUG_MPS + 2 * Math.PI * Math.abs(laneOffsetM(TUG)) / 0.8 + STOP_S;
  const trace = run(w, lap * 1.3);
  expect(w.state.laps).toBeGreaterThanOrEqual(1);
  expect(Math.max(...trace.map((p) => p.along))).toBeGreaterThan(L - 10); // reached the far end
  let sinceTurn = 0, held = 0, maxHeld = 0;
  const straights = [];
  for (const p of trace) {
    expect(p.contact).toBe(4);                                            // on the ground the whole way
    expect(p.y - TUG.halfM.y - w.roadY(p.along)).toBeGreaterThan(0.15);   // on its wheels, not its box
    expect(Math.abs(p.speed)).toBeLessThan(TUG_MPS * 1.05);               // walking pace, never more
    sinceTurn = p.phase.startsWith('turn') ? 0 : sinceTurn + 0.25;
    if ((p.phase === 'out' || p.phase === 'back') && sinceTurn > 12) straights.push(p);
    held = p.phase === 'hold' ? held + 0.25 : 0;
    maxHeld = Math.max(maxHeld, held);
  }
  expect(straights.some((p) => p.phase === 'back')).toBe(true);
  expect(straights.some((p) => p.phase === 'out')).toBe(true);
  for (const p of straights) {
    expect(Math.abs(p.laneErr)).toBeLessThan(0.5);
    expect(Math.abs(p.speed - TUG_MPS)).toBeLessThan(0.08); // the proportional hold sags ~4% up a 3% slope
  }
  expect(maxHeld).toBeGreaterThanOrEqual(STOP_S - 0.25);
  return trace;
}

describe('physicsWorld (0043): one Rapier world, one tug on a KDFW ramp lane', () => {
  it('the lane is a short straight stretch on KDFW ground, nearly flat, ≥ 300 m from every runway centreline', () => {
    const g = roadGeometry(SERVICE_ROAD, heightAt);
    expect(g.len).toBeGreaterThan(150);
    expect(g.len).toBeLessThan(250);
    expect(Math.abs(g.slope)).toBeLessThan(0.03);
    for (const rw of RUNWAY_DATA.filter((r) => r.airport === 'KDFW')) {
      const a = latLonToSimMeters(rw.le.lat, rw.le.lon), b = latLonToSimMeters(rw.he.lat, rw.he.lon);
      const dx = b.x - a.x, dz = b.z - a.z, n = Math.hypot(dx, dz);
      for (const along of [0, g.len / 2, g.len]) {
        for (const c of [0, laneOffsetM(TUG)]) {
          const px = g.x0 + g.ux * along - g.uz * c - a.x, pz = g.z0 + g.uz * along + g.ux * c - a.z;
          expect(Math.abs(px * -dz / n + pz * dx / n)).toBeGreaterThan(300);
        }
      }
    }
    expect(Math.hypot(g.x0 - ROAD_START.x, g.z0 - ROAD_START.z)).toBeLessThan(1);
    expect(LOAD_M).toBeGreaterThan(WAKE_M); // fetched before it would wake
  });

  it('the tug settles on its four sprung wheels, its box clear of the road', () => {
    const w = createPhysicsWorld(R, { heightAt });
    run(w, 4);
    const s = w.snapshot();
    expect(s.contact).toBe(4);
    // The box's underside above the road: on bottomed springs (Rapier's default 6 kN a wheel) it sat on it.
    expect(s.y - TUG.halfM.y - w.roadY(s.along)).toBeGreaterThan(0.15);
    // The springs carry the tug's weight.
    let f = 0;
    for (let i = 0; i < 4; i++) f += w.car.wheelSuspensionForce(i);
    expect(Math.abs(f / (TUG.massKg * 9.81) - 1)).toBeLessThan(0.08);
    w.dispose();
  });

  it('drives the loop on the KDFW lane: out, U-turn, back on the return lane, U-turn, a hold', () => {
    const w = createPhysicsWorld(R, { heightAt });
    checkLoop(w);
    w.dispose();
  }, 30000);

  it('drives the loop on a sloped diagonal road (the steering keeps it on its lanes)', () => {
    const road = { from: { lat: 32.88, lon: -97.06 }, to: { lat: 32.8812, lon: -97.0586 }, widthM: 12 };
    const sloped = (x, z) => 0.03 * (x - z) / Math.SQRT2; // ~3% up the road (north-east: +x, -z)
    const w = createPhysicsWorld(R, { heightAt: sloped, road });
    expect(Math.abs(w.road.ux)).toBeGreaterThan(0.5);
    expect(Math.abs(w.road.uz)).toBeGreaterThan(0.5);
    expect(w.road.slope).toBeGreaterThan(0.02);
    checkLoop(w);
    w.dispose();
  }, 30000);

  it('starts 1.5 m off its lane with the nose 8° off, and the steering brings it back', () => {
    for (const [crossM, yawDeg] of [[1.5, 8], [-1.5, -8], [1.5, -8]]) {
      const w = createPhysicsWorld(R, { heightAt, start: { crossM, yawDeg } });
      const trace = run(w, 25);
      const end = trace.at(-1);
      expect(end.phase).toBe('out');
      expect(Math.abs(end.laneErr)).toBeLessThan(0.2);
      expect(Math.abs(end.heading)).toBeLessThan(0.05);
      expect(Math.max(...trace.map((p) => Math.abs(p.laneErr)))).toBeLessThan(2.5); // no overshoot off the road
      w.dispose();
    }
  }, 30000);

  it('600 steps replay to the same snapshot (determinism)', () => {
    const snap = () => {
      const w = createPhysicsWorld(R, { heightAt });
      for (let i = 0; i < 600; i++) w.stepOnce();
      const s = w.snapshot();
      w.dispose();
      return s;
    };
    const a = snap(), b = snap();
    expect(b).toEqual(a);
    expect(a.along).toBeGreaterThan(10); // it moved
  });

  it('sleeps while the aircraft is far away, wakes beside it, never runs more than 15 steps a frame', () => {
    const w = createPhysicsWorld(R, { heightAt });
    for (let i = 0; i < 180; i++) w.step(STEP_S, w.road.x0 + WAKE_M + 500, w.road.z0);
    expect(w.state.steps).toBe(0);
    expect(w.state.asleep).toBe(true);
    expect(w.step(STEP_S, w.road.x0, w.road.z0)).toBe(1);
    expect(w.step(0.25, w.road.x0, w.road.z0)).toBe(15);
    expect(w.step(10, w.road.x0, w.road.z0)).toBe(15);
    expect(w.step(NaN, w.road.x0, w.road.z0)).toBe(0);
    w.dispose();
  });
});
