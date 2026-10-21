import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { AIRCRAFT_MODELS, modelUrl, gearNodes, showGear, parseModel, loadAircraftModel } from '../../src/aircraftModel.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';

const read = (file) => {
  const b = readFileSync(`public/${file}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const parse = (file) => parseModel(read(file), { GLTFLoader, MeshoptDecoder });

function box(obj, filter = () => true) {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3();
  obj.traverse((o) => { if (o.isMesh && filter(o)) b.expandByObject(o); });
  return b;
}

// Ticket 0045: the detailed models the chase view shows instead of the primitive stand-ins.
describe('aircraft models', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('only the twin-jet has a model so far, served from our own origin under the base path', () => {
    expect(Object.keys(AIRCRAFT_MODELS)).toEqual(['b738']);
    expect(modelUrl('b738', '/openaero/')).toBe('/openaero/models/twinjet-v1.glb');
    expect(modelUrl('c172', '/openaero/')).toBeNull();
    expect(modelUrl('f16', '/openaero/')).toBeNull();
  });

  for (const [key, m] of Object.entries(AIRCRAFT_MODELS)) {
    const spec = AIRCRAFT_DATABASE[key];

    it(`${m.name}: small on the wire, meshopt-compressed, no textures`, () => {
      expect(statSync(`public/${m.file}`).size).toBeLessThan(3 * 1024 * 1024);
      const b = new Uint8Array(read(m.file));
      const jsonLen = new DataView(b.buffer).getUint32(12, true);
      const json = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + jsonLen)));
      expect(json.extensionsUsed).toContain('EXT_meshopt_compression');
      expect(json.images ?? []).toEqual([]);
      expect(JSON.stringify(json)).not.toMatch(/https?:/);
    });

    it(`${m.name}: in the body frame: nose to -Z, the real length, wheels at -gearHeight`, async () => {
      const root = await parse(m.file);
      const b = box(root);
      expect(b.max.z - b.min.z).toBeCloseTo(39.5, 1); // 737-800 length (Boeing D6-58325-6)
      expect(b.min.y).toBeCloseTo(-spec.gearHeight, 2); // where flightModel.js puts the ground
      const nose = box(root, (o) => o.name.startsWith('gear_nose') && o.material.name === 'Tyre');
      const main = box(root, (o) => o.name.startsWith('gear_main') && o.material.name === 'Tyre');
      expect(nose.max.z).toBeLessThan(-10); // nose gear forward (-Z)...
      expect(main.min.z).toBeGreaterThan(0); // ...main gear just aft of the centre of gravity
      // Wheelbase (axle to axle) within 5% of the 737-800's 15.6 m (D6-58325-6 Fig. 2.2.1).
      const wheelbase = (main.min.z + main.max.z) / 2 - (nose.min.z + nose.max.z) / 2;
      expect(wheelbase).toBeGreaterThan(15.6 * 0.95);
      expect(wheelbase).toBeLessThan(15.6 * 1.05);
      // Symmetric about the centreline, wings along X.
      expect(b.min.x).toBeCloseTo(-b.max.x, 1);
      expect(b.max.x * 2).toBeGreaterThan(30);
    });

    it(`${m.name}: few draw calls and a phone-sized triangle count`, async () => {
      const root = await parse(m.file);
      let meshes = 0, tris = 0;
      root.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      });
      expect(meshes).toBeLessThan(20);
      expect(tris).toBeLessThan(100_000);
      expect(tris).toBeGreaterThan(1000);
    });

    it(`${m.name}: gear and doors are named nodes that hide with the gear up`, async () => {
      const root = await parse(m.file);
      const gear = gearNodes(root);
      expect(gear.map((o) => o.name).filter((n) => !/_\d+$/.test(n)).sort())
        .toEqual(['gear_main', 'gear_main_doors', 'gear_nose', 'gear_nose_door']);
      showGear(gear, false);
      expect(gear.every((o) => !o.visible)).toBe(true);
      // Gear up: nothing hangs more than a nacelle's depth below the fuselage.
      const up = new THREE.Box3();
      root.updateMatrixWorld(true);
      root.traverse((o) => { if (o.isMesh && gear.every((g) => g !== o && !g.children.includes(o))) up.expandByObject(o); });
      expect(up.min.y).toBeGreaterThan(-spec.gearHeight + 0.5);
      showGear(gear, true);
      expect(gear.every((o) => o.visible)).toBe(true);
    });
  }

  it('loads each model once per page and hands out copies', async () => {
    const fetch = vi.fn(async () => new Response(read('models/twinjet-v1.glb')));
    vi.stubGlobal('fetch', fetch);
    const [a, b] = await Promise.all([loadAircraftModel('b738', '/openaero/'), loadAircraftModel('b738', '/openaero/')]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/openaero/models/twinjet-v1.glb');
    expect(a).not.toBe(b);
    expect(a.name).toBe('aircraftModel');
    expect(await loadAircraftModel('c172', '/openaero/')).toBeNull();
  });

  it('a failed load rejects and can be retried', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    const { loadAircraftModel: load } = await import('../../src/aircraftModel.js?retry');
    await expect(load('b738', '/x/')).rejects.toThrow(/404/);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(read('models/twinjet-v1.glb'))));
    expect((await load('b738', '/x/')).name).toBe('aircraftModel');
  });
});
