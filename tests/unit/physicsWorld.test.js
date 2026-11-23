// Ticket 0043: the Rapier world and its tow tractor, flown headless in Node.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import * as R from '@dimforge/rapier3d/rapier.js'; // the package names only a `module` entry
import {
  initRapier, createPhysicsWorld, roadGeometry, SERVICE_ROAD, STEP_S, TUG_MPS, WAKE_M, STOP_S, TUG,
} from '../../src/world/physicsWorld.js';
import { createGround, decodeDem } from '../../src/terrain.js';
import { RUNWAYS_GEOM } from '../../src/airports.js';

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

function run(w, seconds, near = true) {
  const g = w.road;
  const ax = near ? g.x0 : g.x0 + WAKE_M + 500;
  const trace = [];
  for (let t = 0; t < seconds; t += STEP_S) {
    w.step(STEP_S, ax, g.z0);
    if (w.state.steps % 30 === 0) trace.push(w.snapshot());
  }
  return trace;
}

describe('physicsWorld (0043): one Rapier world, one tug on a KDFW service road', () => {
  it('the road is a short straight stretch on KDFW ground, nearly flat', () => {
    const g = roadGeometry(SERVICE_ROAD, heightAt);
    expect(g.len).toBeGreaterThan(150);
    expect(g.len).toBeLessThan(250);
    expect(Math.abs(g.slope)).toBeLessThan(0.03);
  });

  it('the tug settles on its four sprung wheels, its box clear of the road', () => {
    const w = createPhysicsWorld(R, { heightAt });
    run(w, 4);
    const s = w.snapshot();
    expect(s.contact).toBe(4);
    // The box's underside above the road: on bottomed springs (Rapier's default 6 kN a wheel) it sat on it.
    const clearance = s.y - TUG.halfM.y - w.roadY(s.along);
    expect(clearance).toBeGreaterThan(0.15);
    // The springs carry the tug's weight.
    let f = 0;
    for (let i = 0; i < 4; i++) f += w.car.wheelSuspensionForce(i);
    expect(Math.abs(f / (TUG.massKg * 9.81) - 1)).toBeLessThan(0.08);
    w.dispose();
  });

  it('drives out at walking pace, stops, reverses back: one loop', () => {
    const w = createPhysicsWorld(R, { heightAt });
    const L = w.road.len;
    const trace = run(w, 2 * L / TUG_MPS + 4 * STOP_S + 30);
    const s = w.snapshot();
    expect(s.laps).toBeGreaterThanOrEqual(1);
    expect(Math.max(...trace.map((p) => p.along))).toBeGreaterThan(L - 10); // reached the far end
    for (const p of trace) {
      expect(p.contact).toBe(4);                                  // on the ground the whole way
      expect(Math.abs(p.y - TUG.halfM.y - w.roadY(p.along))).toBeGreaterThan(0.15); // on its wheels
      expect(Math.abs(p.cross)).toBeLessThan(0.5);                // on the road's centreline (12 m road)
      expect(Math.abs(p.speed)).toBeLessThan(TUG_MPS * 1.15);     // walking pace, never more
    }
    // It cruises at the walking pace both ways.
    const cruise = trace.filter((p) => p.along > 30 && p.along < L - 30 && (p.phase === 'out' || p.phase === 'back'));
    expect(cruise.length).toBeGreaterThan(20);
    for (const p of cruise) expect(Math.abs(Math.abs(p.speed) - TUG_MPS)).toBeLessThan(0.1);
    expect(cruise.some((p) => p.speed < 0)).toBe(true);
    w.dispose();
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

  it('sleeps while the aircraft is far away', () => {
    const w = createPhysicsWorld(R, { heightAt });
    run(w, 3, false);
    expect(w.state.steps).toBe(0);
    expect(w.state.asleep).toBe(true);
    expect(w.step(STEP_S, w.road.x0, w.road.z0)).toBe(1);
    w.dispose();
  });
});
