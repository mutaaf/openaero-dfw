// Ambient traffic's placement and scheduling (ticket 0080, src/traffic.js): never the player's
// runway, never within 1 NM of the player, the first jet of a flight ahead of the player, one jet
// at a time, off when the adaptive resolution is on its floor.
import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import {
  trafficEnds, pickTrafficSpawn, sameRunway, runwayOf, runwayY, distToThresholdNm, trafficAllowed,
  createTrafficScheduler, lateralM, MIN_SEP_M, FLOW_DEG, FIRST_SPAWN_S, GAP_S, PARALLEL_MIN_M,
} from '../../src/traffic.js';
import { RUNWAY_ENDS, runwayEnd, approachSpawn, takeoffSpawn } from '../../src/airports.js';
import { headingError, vrefFor } from '../../src/aero.js';
import { headingError as tHeadingError, vrefFor as tVrefFor } from '../../src/traffic.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { stepFlightModel, trimThrottle, rollHoldScale } from '../../src/flightModel.js';

const DFW = RUNWAY_ENDS.filter((e) => e.airport === 'KDFW');
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe('which runway the traffic lands on (0080)', () => {
  it('with the player on 35C: the other south-flow runways, 35R first (1.5 km), the close parallel 35L (360 m) last, never 35C or 17C', () => {
    const ends = trafficEnds(runwayEnd('KDFW', '35C')).map((e) => e.ident);
    expect(ends).not.toContain('35C');
    expect(ends).not.toContain('17C');
    expect(ends).toEqual(expect.arrayContaining(['35R', '35L', '36L', '36R']));
    expect(ends.every((i) => !i.startsWith('1'))).toBe(true); // no opposite flow
    expect(ends[0]).toBe('35R'); // the parallel beside it (1.5 km east)
    expect(ends.at(-1)).toBe('35L'); // 17R/35L is 1,200 ft from 17C/35C: under JO 7110.65's 2,500 ft
  });
  it('for every KDFW end with a runway 2,500 ft or more beside it, that one comes first', () => {
    for (const p of DFW) {
      const ends = trafficEnds(p);
      const far = ends.filter((e) => lateralM(e, p) >= PARALLEL_MIN_M);
      if (far.length) expect(lateralM(ends[0], p), p.id).toBeGreaterThanOrEqual(PARALLEL_MIN_M);
    }
  });
  it('for every KDFW end: another runway, the same flow, at KDFW', () => {
    for (const p of DFW) {
      const ends = trafficEnds(p);
      expect(ends.length, p.id).toBeGreaterThan(0);
      for (const e of ends) {
        expect(e.airport).toBe('KDFW');
        expect(sameRunway(e, p), `${p.id} → ${e.id}`).toBe(false);
        expect(Math.abs(headingError(e.hdgT, p.hdgT))).toBeLessThanOrEqual(FLOW_DEG);
      }
    }
  });
  it('none away from KDFW, or with no runway', () => {
    expect(trafficEnds(runwayEnd('KDAL', '13R'))).toEqual([]);
    expect(trafficEnds(null)).toEqual([]);
  });
  it('sameRunway knows both ends of a runway', () => {
    expect(sameRunway(runwayEnd('KDFW', '35C'), runwayEnd('KDFW', '17C'))).toBe(true);
    expect(sameRunway(runwayEnd('KDFW', '35C'), runwayEnd('KDFW', '35R'))).toBe(false);
    expect(runwayOf(runwayEnd('KDFW', '35R')).ends).toContain('KDFW_17L');
  });
});

describe('where the traffic starts (0080)', () => {
  it('the default 4 NM final on 35C: the first jet 2 NM out on 35R, ahead of the player, over 1 NM away', () => {
    const end = runwayEnd('KDFW', '35C');
    const player = approachSpawn(end, 4).pos;
    const s = pickTrafficSpawn(end, player, { first: true });
    expect(s.end.ident).toBe('35R');
    expect(s.distNm).toBeCloseTo(2, 5);
    const p = approachSpawn(s.end, s.distNm).pos;
    expect(dist3(p, player)).toBeGreaterThanOrEqual(MIN_SEP_M);
    expect(distToThresholdNm(s.end, p)).toBeLessThan(distToThresholdNm(end, player)); // ahead
  });
  it('every KDFW end, the player anywhere from the runway to 10 NM out, first or not: never their runway, never within 1 NM, 2-8 NM out', () => {
    let n = 0;
    for (const pe of DFW) {
      const spots = [0, 1, 2, 3, 4, 5, 6, 8, 10].map((nm) => approachSpawn(pe, nm).pos);
      const t = takeoffSpawn(pe);
      spots.push({ x: t.pos.x, y: pe.thrY + 2, z: t.pos.z });
      for (const pos of spots) {
        for (const first of [true, false]) {
          for (const r of [0, 0.5, 0.999]) {
            const s = pickTrafficSpawn(pe, pos, { first, rand: () => r });
            expect(s, `${pe.id}`).not.toBeNull();
            expect(sameRunway(s.end, pe)).toBe(false);
            expect(s.distNm).toBeGreaterThanOrEqual(2);
            expect(s.distNm).toBeLessThanOrEqual(8);
            if (!first) expect(s.distNm).toBeGreaterThanOrEqual(r === 0 ? 2 : 4); // 4-8, unless that spot was too close
            expect(dist3(approachSpawn(s.end, s.distNm).pos, pos)).toBeGreaterThanOrEqual(MIN_SEP_M);
            n++;
          }
        }
      }
    }
    expect(n).toBeGreaterThan(500);
  });
  it('not at KDFW: nowhere', () => {
    const e = runwayEnd('KDAL', '13R');
    expect(pickTrafficSpawn(e, approachSpawn(e, 4).pos, { first: true })).toBeNull();
  });
});

describe('the runway under the jet (0080)', () => {
  it('follows the surveyed slope of 17L/35R (575 ft to 524 ft) and holds the end heights off the ends', () => {
    const r = runwayOf(runwayEnd('KDFW', '35R'));
    const mid = runwayY(r, (r.ax + r.bx) / 2, (r.az + r.bz) / 2);
    expect(mid).toBeCloseTo((r.ay + r.by) / 2, 6);
    expect(runwayY(r, r.ax + (r.ax - r.bx), r.az + (r.az - r.bz))).toBeCloseTo(r.ay, 6);
    expect(runwayY(r, r.bx + (r.bx - r.ax), r.bz + (r.bz - r.az))).toBeCloseTo(r.by, 6);
    expect(Math.abs(r.ay - r.by)).toBeGreaterThan(10); // 51 ft
  });
});

describe('slow devices (0080)', () => {
  it('off once the adaptive resolution sits on its floor of 1 on a screen that started above it', () => {
    expect(trafficAllowed(3, 3)).toBe(true);
    expect(trafficAllowed(1.25, 3)).toBe(true);
    expect(trafficAllowed(1, 3)).toBe(false);
    expect(trafficAllowed(1, 1)).toBe(true); // a 1x screen has no lower rung to fall to
  });
});

describe('the scheduler (0080)', () => {
  const final = (rwy = '35C', nm = 4) => {
    const end = runwayEnd('KDFW', rwy);
    const p = approachSpawn(end, nm).pos;
    return { simTime: 0, activeEnd: end, loadedMission: { key: rwy }, pos: new Vector3(p.x, p.y, p.z), windVec: new Vector3(), mslOffsetM: 0, isaDevC: 0, altimInHg: 29.92, fm: { stepFlightModel, trimThrottle, rollHoldScale } };
  };
  const run = (sim, sch, s, allowed = true) => {
    for (let t = 0; t < s; t += 1 / 60) { sim.simTime += 1 / 60; sch.tick(allowed); }
  };

  it('nothing while the sim clock stands still (menus, the results card, a pause)', () => {
    const sim = final(), sch = createTrafficScheduler(sim);
    for (let i = 0; i < 600; i++) sch.tick();
    expect(sch.jet).toBeNull();
    expect(sch.spawned).toBe(0);
  });
  it('the first jet a second into the flight, ahead of the player; one at a time; the next after a 40-90 s gap', () => {
    const sim = final(), sch = createTrafficScheduler(sim, { rand: () => 0.5 });
    run(sim, sch, FIRST_SPAWN_S + 0.1);
    expect(sch.jet).not.toBeNull();
    expect(sch.jet.end.ident).toBe('35R');
    expect(sch.spawned).toBe(1);
    // It lands and vacates (~85 s from 2 NM), then the gap (65 s at rand 0.5).
    let doneAt = null;
    for (let t = 0; t < 400 && sch.spawned === 1; t += 1 / 60) {
      sim.simTime += 1 / 60; sch.tick();
      if (doneAt === null && !sch.jet) doneAt = sim.simTime;
    }
    expect(doneAt).not.toBeNull();
    expect(sch.spawned).toBe(2);
    const gap = GAP_S[0] + 0.5 * (GAP_S[1] - GAP_S[0]);
    expect(sim.simTime - doneAt).toBeGreaterThan(gap - 0.1);
    expect(sim.simTime - doneAt).toBeLessThan(gap + 0.1);
    expect(sch.jet.end.ident).not.toMatch(/C$/);
  });
  it('a new mission, a respawn (FLY AGAIN) or the player lining up on its runway clears it', () => {
    const sim = final(), sch = createTrafficScheduler(sim);
    run(sim, sch, 2);
    expect(sch.jet?.end.ident).toBe('35R');
    sim.activeEnd = runwayEnd('KDFW', '35R'); // the player switched to the jet's runway
    sch.tick();
    expect(sch.jet).toBeNull();
    run(sim, sch, 2);
    expect(sch.jet).not.toBeNull();
    expect(sameRunway(sch.jet.end, sim.activeEnd)).toBe(false);
    sim.pos.z += 5000; // FLY AGAIN: the same mission object, the player back at the start
    sch.tick();
    expect(sch.jet).toBeNull();
    run(sim, sch, 2);
    expect(sch.jet).not.toBeNull();
    sim.loadedMission = { key: 'kdal' }; sim.activeEnd = runwayEnd('KDAL', '13R');
    run(sim, sch, 5);
    expect(sch.jet).toBeNull();
  });
  it('off for the rest of the flight on a slow device, back for the next flight', () => {
    const sim = final(), sch = createTrafficScheduler(sim);
    run(sim, sch, 2);
    expect(sch.jet).not.toBeNull();
    sch.tick(false);
    expect(sch.jet).toBeNull();
    run(sim, sch, 5); // the ratio climbed back: still off this flight
    expect(sch.jet).toBeNull();
    sim.loadedMission = { key: 'next' };
    run(sim, sch, 2);
    expect(sch.jet).not.toBeNull();
  });
});

describe("traffic.js's copies of aero.js helpers (inlined to keep aero.js in the boot chunk)", () => {
  it('headingError and vrefFor give aero.js\'s answers', () => {
    for (let t = -30; t <= 390; t += 7.5) for (let c = 0; c < 360; c += 11) expect(tHeadingError(t, c)).toBeCloseTo(headingError(t, c), 9);
    for (const k of Object.keys(AIRCRAFT_DATABASE)) for (const f of [0, 1, 2, 3]) expect(tVrefFor(AIRCRAFT_DATABASE[k], f)).toBe(vrefFor(AIRCRAFT_DATABASE[k], f));
  });
});
