// Ticket 0190: the aircraft's ground shadow, its geometry and when it shows (src/shadow.js).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { shadowOffset, shadowOpacity, cloudCover, drawSilhouette, SHADOW } from '../../src/shadow.js';

const FT = 0.3048;
const DEG = Math.PI / 180;

describe('shadowOffset: h / tan(el), away from the sun', () => {
  for (const el of [10, 45, 80]) {
    for (const hFt of [0, 50, 300]) {
      it(`sun ${el}° up, ${hFt} ft`, () => {
        const h = hFt * FT;
        const want = h / Math.tan(el * DEG);
        // Sun in the south (az 180): the shadow falls north, -Z in the sim frame.
        const s = shadowOffset(h, el, 180);
        expect(s.distM).toBeCloseTo(want, 6);
        expect(s.x).toBeCloseTo(0, 6);
        expect(s.z).toBeCloseTo(-want, 6);
        // Sun in the west (az 270): the shadow falls east, +X.
        const w = shadowOffset(h, el, 270);
        expect(w.x).toBeCloseTo(want, 6);
        expect(w.z).toBeCloseTo(0, 6);
      });
    }
  }
  it('matches the sim frame of sun.js sunDirection (+X east, -Z north): offset is minus the sun\'s horizontal bearing', () => {
    const s = shadowOffset(100, 30, 135); // sun south-east: shadow north-west
    expect(s.x).toBeLessThan(0);
    expect(s.z).toBeLessThan(0);
    expect(Math.hypot(s.x, s.z)).toBeCloseTo(100 / Math.tan(30 * DEG), 6);
  });
  it('has no shadow with the sun down', () => {
    expect(shadowOffset(10, 0, 180)).toBeNull();
    expect(shadowOffset(10, -5, 180)).toBeNull();
  });
});

describe('shadowOpacity', () => {
  it('is hidden with the sun below 3° and above 600 ft AGL', () => {
    expect(shadowOpacity(2.9, 50)).toBe(0);
    expect(shadowOpacity(-20, 50)).toBe(0);
    expect(shadowOpacity(45, 601)).toBe(0);
    expect(shadowOpacity(45, 2000)).toBe(0);
  });
  it('is full by day below 400 ft, fading to nothing at 600 ft', () => {
    for (const ft of [0, 50, 300, 400]) expect(shadowOpacity(45, ft)).toBeCloseTo(SHADOW.alpha, 6);
    const mid = shadowOpacity(45, 500);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(SHADOW.alpha);
    expect(shadowOpacity(45, 600)).toBe(0);
  });
  it('fades in with the sun between 3° and 10°', () => {
    const a = shadowOpacity(4, 50), b = shadowOpacity(7, 50), c = shadowOpacity(10, 50);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(c).toBeCloseTo(SHADOW.alpha, 6);
  });
  it('is weaker under cloud and gone under an overcast', () => {
    const clear = shadowOpacity(45, 50, 0);
    const sct = shadowOpacity(45, 50, cloudCover({ cloudLayers: [{ cover: 'FEW', coverage: 0.2 }, { cover: 'SCT', coverage: 0.45 }] }));
    expect(sct).toBeLessThan(clear);
    expect(sct).toBeGreaterThan(0);
    expect(shadowOpacity(45, 50, cloudCover({ cloudLayers: [{ cover: 'OVC', coverage: 1 }] }))).toBe(0);
    expect(cloudCover({})).toBe(0);
    expect(cloudCover(null)).toBe(0);
  });
});

describe('drawSilhouette', () => {
  it('draws the meshes seen from above, nose at the top, in a square sized to the airframe', () => {
    const root = new THREE.Group();
    const fus = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 8)); // 8 m long
    const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.2, 1.5));
    wing.position.set(0, 0.5, -1);
    root.add(fus, wing);
    root.position.set(500, 200, -300);
    root.rotation.y = 1; // the root's own frame, whatever its pose
    root.updateMatrixWorld(true);
    const ops = [];
    const ctx = {
      clearRect() {}, beginPath() { ops.push(['begin']); }, closePath() {}, fill() { ops.push(['fill']); },
      moveTo(x, y) { ops.push(['m', x, y]); }, lineTo(x, y) { ops.push(['l', x, y]); }, set fillStyle(v) {},
    };
    const size = drawSilhouette(root, ctx, 128);
    expect(size).toBeCloseTo(11 * 1.04, 6); // the wingspan sets the square
    const pts = ops.filter((o) => o[0] === 'm' || o[0] === 'l');
    expect(pts.length).toBeGreaterThan(0);
    const xs = pts.map((o) => o[1]), ys = pts.map((o) => o[2]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(128);
    // The fuselage's 8 m on 11.44 m of canvas, centred: rows 19..109 (nose at the top, -Z).
    expect(Math.min(...ys)).toBeCloseTo(64 - (4 / size) * 128, 3);
    expect(Math.max(...ys)).toBeCloseTo(64 + (4 / size) * 128, 3);
    expect(ops.filter((o) => o[0] === 'fill').length).toBe(2);
  });
  it('leaves out see-through meshes (a flame) and hidden ones', () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2)));
    const flame = new THREE.Mesh(new THREE.BoxGeometry(40, 1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4 }));
    const hidden = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 1));
    hidden.visible = false;
    root.add(flame, hidden);
    const ctx = { clearRect() {}, beginPath() {}, closePath() {}, fill() {}, moveTo() {}, lineTo() {}, set fillStyle(v) {} };
    expect(drawSilhouette(root, ctx, 128)).toBeCloseTo(1 * 2 * 1.04, 6); // ext ≥ 1 m
  });
});
