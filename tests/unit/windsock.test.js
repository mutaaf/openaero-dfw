import { describe, it, expect } from 'vitest';
import {
  windsockPose, hangDeg, stepWindsock, createWindsockState, windsockSites, createWindsocks, FULL_KTS,
} from '../../src/windsock.js';
import { RUNWAYS_GEOM, RUNWAY_ENDS, runwayEndById, runwayEnd, courseVector } from '../../src/airports.js';
import { gustFactor, surfaceWindFactor } from '../../src/weather.js';

const FT = 0.3048;
const angleDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

describe('windsock pose (ticket 0027)', () => {
  it('points downwind: a METAR wind from 350° streams the sock to 170°', () => {
    for (const from of [0, 90, 180, 270, 350]) {
      const p = windsockPose(from, 12, 0, 1.7);
      expect(angleDiff(p.yawDeg, (from + 180) % 360)).toBeLessThanOrEqual(3); // flutter ≤ 3°
    }
  });

  it('extends monotonically with the wind: limp when calm, straight out at 15 kt (AC 150/5345-27)', () => {
    let last = -1;
    for (let kts = 0; kts <= 30; kts += 0.5) {
      const e = windsockPose(200, kts, 0, 0).extensionDeg;
      expect(e).toBeGreaterThanOrEqual(last);
      last = e;
    }
    expect(hangDeg(0)).toBe(0);
    expect(hangDeg(2)).toBeLessThan(8);            // under 3 kt: barely off the mast
    expect(hangDeg(3)).toBeGreaterThan(8);         // responds at 3 kt
    expect(hangDeg(6)).toBeGreaterThan(30);        // near the "3 kt a band" reading, not saturated early
    expect(hangDeg(10)).toBeLessThan(80);
    expect(hangDeg(FULL_KTS)).toBeCloseTo(90, 6);  // straight out at 15 kt
    expect(hangDeg(25)).toBeCloseTo(90, 6);
  });

  it('does not flutter with reduced motion', () => {
    for (const t of [0, 0.7, 3.1]) expect(windsockPose(250, 12, 0, t, null, undefined, true).yawDeg).toBe(70);
  });

  it('has no bearing in a calm or variable wind (it keeps the way it hangs)', () => {
    expect(windsockPose(null, 4, 0, 0).yawDeg).toBeNull();
    expect(windsockPose(270, 0, 0, 0).yawDeg).toBeNull();
  });

  it('lifts in the gusts on the same curve the aircraft flies (weather.js gustFactor)', () => {
    const ext = [];
    for (let t = 0; t < 60; t += 0.25) ext.push(windsockPose(180, 6, 16, t, gustFactor).extensionDeg);
    expect(Math.min(...ext)).toBeCloseTo(hangDeg(6), 0);
    expect(Math.max(...ext)).toBeGreaterThan(hangDeg(12));
  });
});

describe('windsock dynamics', () => {
  it('swings to a new wind as a damped pendulum, the short way round, and settles', () => {
    const st = createWindsockState(1);
    st.yaw[0] = 350; st.ext[0] = 0;
    const pose = { yawDeg: 20, extensionDeg: 80 };
    let crossedZero = false, overshoot = 0;
    for (let i = 0; i < 30 * 20; i++) {
      stepWindsock(st, 0, pose, 1 / 30);
      if (st.yaw[0] < 180) crossedZero = true;
      expect(st.yaw[0] > 300 || st.yaw[0] < 60).toBe(true); // never the long way through 180
      overshoot = Math.max(overshoot, st.ext[0] - 80);
    }
    expect(crossedZero).toBe(true);
    expect(overshoot).toBeGreaterThan(0.5);       // under-damped: a gust swings it past
    expect(angleDiff(st.yaw[0], 20)).toBeLessThan(0.2);
    expect(Math.abs(st.ext[0] - 80)).toBeLessThan(0.2);
  });

  it('keeps its bearing and drops limp when the wind dies', () => {
    const st = createWindsockState(1);
    st.yaw[0] = 123; st.ext[0] = 85;
    for (let i = 0; i < 600; i++) stepWindsock(st, 0, { yawDeg: null, extensionDeg: 0 }, 1 / 30);
    expect(st.yaw[0]).toBeCloseTo(123, 3);
    expect(st.ext[0]).toBeLessThan(0.5);
  });
});

describe('windsock sites', () => {
  const sites = windsockSites(RUNWAYS_GEOM, runwayEndById);

  it('puts one beside every runway end, so every airport has them', () => {
    expect(sites).toHaveLength(RUNWAY_ENDS.length);
    for (const icao of ['KDFW', 'KDAL', 'KAFW', 'KADS', 'KGKY', 'KFTW']) {
      expect(sites.some((s) => s.airport === icao)).toBe(true);
    }
  });

  it('keeps every sock off every runway at its field (≥ 45 m from the pavement edge)', () => {
    for (const s of sites) {
      for (const r of RUNWAYS_GEOM.filter((o) => o.airport === s.airport)) {
        const dx = r.bx - r.ax, dz = r.bz - r.az;
        const t = Math.max(0, Math.min(1, ((s.x - r.ax) * dx + (s.z - r.az) * dz) / (dx * dx + dz * dz)));
        const edge = Math.hypot(s.x - (r.ax + dx * t), s.z - (r.az + dz * t)) - r.widthM / 2;
        expect(edge).toBeGreaterThanOrEqual(45 - 1e-6);
      }
    }
  });

  it('sites the 35C sock ~1,000 ft past the threshold, ~300 ft to the left, visible from the final', () => {
    const e = runwayEnd('KDFW', '35C');
    const s = sites.find((o) => o.end === e.id);
    const c = courseVector(e.hdgT);
    const dx = s.x - e.thrX, dz = s.z - e.thrZ;
    expect(dx * c.x + dz * c.z).toBeCloseTo(1000 * FT, 0);
    const right = dx * -c.z + dz * c.x; // + = right of the landing direction
    expect(right).toBeCloseTo(-300 * FT, 0);
  });
});

describe('windsock meshes', () => {
  const wxFor = () => ({ windDirDeg: 270, windKts: 20, gustKts: 0 });
  const make = () => createWindsocks({
    runways: RUNWAYS_GEOM, endById: runwayEndById, heightAt: () => 1.5, gustAt: gustFactor, surfaceFactor: surfaceWindFactor,
  });

  it('starts settled on its field\'s wind and stands on the ground', () => {
    const w = make();
    const cam = { x: 0, y: 100, z: 0 };
    w.update(0, 1 / 60, wxFor, cam, 0, { r: 1, g: 1, b: 1 });
    expect(w.group.children).toHaveLength(2);
    expect(w.state.baseY.every((y) => y === 1.5)).toBe(true);
    for (let i = 0; i < w.state.count; i++) {
      expect(angleDiff(w.state.st.yaw[i], 90)).toBeLessThan(4);  // from 270: streams east
      expect(w.state.st.ext[i]).toBeGreaterThan(80);
    }
  });

  it('allocates no new arrays after construction and keeps a minimum on-screen size at range', () => {
    const w = make();
    const cam = { x: 0, y: 100, z: 0 };
    w.update(0, 1 / 60, wxFor, cam, 0, { r: 1, g: 1, b: 1 });
    const arr = w.socks?.instanceMatrix?.array;
    for (let k = 1; k < 30; k++) w.update(k / 60, 1 / 60, wxFor, cam, 1, { r: 0.1, g: 0.1, b: 0.1 });
    expect(w.socks?.instanceMatrix?.array).toBe(arr);
    // A sock 2 km away is drawn larger than life; one 200 m away at its real size.
    const e = runwayEnd('KDFW', '35C');
    const i = w.state.sites.findIndex((s) => s.end === e.id);
    const s = w.state.sites[i];
    w.update(1, 1 / 60, wxFor, { x: s.x, y: 100, z: s.z + 2000 }, 0, { r: 1, g: 1, b: 1 });
    expect(w.state.scale[i]).toBeGreaterThan(2);
    w.update(1.1, 1 / 60, wxFor, { x: s.x, y: 30, z: s.z + 200 }, 0, { r: 1, g: 1, b: 1 });
    expect(w.state.scale[i]).toBe(1);
  });
});
