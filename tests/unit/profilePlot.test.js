// The results card's approach profile (ticket 0227): the last 30 s of the replay buffer seen from the side,
// against the 3° path through the aim point and the ±0.5° band.
import { describe, it, expect } from 'vitest';
import { createReplayBuffer, recordReplay, REPLAY_STRIDE } from '../../src/replay.js';
import { courseVector, AIM_POINT_M, GLIDE_DEG, runwayEnd } from '../../src/airports.js';
import { profilePoints, profileSummary, profileSvg, profileLegend, PROFILE_STRIDE, PROFILE_MIN_S } from '../../src/trackPlot.js';

const TAN3 = Math.tan(GLIDE_DEG * Math.PI / 180);
const END = runwayEnd('KDFW', '35C');

// Fly a final to END at 70 m/s: h(distM) gives the CG's height above the threshold for a distance to the
// threshold (positive before it); the flight starts startM out and ends at the touchdown, tdM past it.
// Then rolls rollS seconds along the runway on the wheels (2 m up).
function fly({ h, startM = 1500, tdM = 400, rollS = 2, crossAt = null, buf = createReplayBuffer() }) {
  const d = courseVector(END.hdgT), v = 70, dt = 1 / 60;
  const sim = { simTime: 0, pos: { x: 0, y: 0, z: 0 }, quat: { x: 0, y: 0, z: 0, w: 1 },
    throttle: 0.3, gearPos: 1, flapDeg: 30, aileronInput: 0, elevInput: 0, rudderInput: 0 };
  const place = (distM, y, cross = 0) => {
    sim.pos.x = END.thrX - d.x * distM - d.z * cross;
    sim.pos.z = END.thrZ - d.z * distM + d.x * cross;
    sim.pos.y = END.thrY + y;
  };
  for (let dist = startM; dist > -tdM; dist -= v * dt) {
    place(dist, h(dist), crossAt ? crossAt(dist) : 0);
    recordReplay(buf, sim);
    sim.simTime += dt;
  }
  for (let s = 0, dist = -tdM; s < rollS; s += dt, dist -= 30 * dt) {
    place(dist, 2);
    recordReplay(buf, sim);
    sim.simTime += dt;
  }
  return buf;
}
const onPath = (dist) => (dist + AIM_POINT_M) * TAN3;

describe('approach profile (0227)', () => {
  it('reads the replay buffer as replay.js lays it out', () => {
    expect(PROFILE_STRIDE).toBe(REPLAY_STRIDE);
  });

  it('a final on the 3° path: x to the aim point, height above the threshold, ending at the touchdown', () => {
    const p = profilePoints(fly({ h: (dist) => Math.max(2, onPath(dist)) }), END, 400);
    expect(p).not.toBeNull();
    expect(p.n).toBeGreaterThan(5 * 20);
    expect(p.pts[0]).toBeGreaterThan(p.pts[2 * (p.n - 1)]); // flying towards the runway: x falls
    // The first sample is ~(1,500 + 305) m out at its 3° height (the ring holds 30 s: all of this flight).
    expect(p.pts[0]).toBeCloseTo(1500 + AIM_POINT_M, -1);
    expect(p.pts[1]).toBeCloseTo(onPath(p.pts[0] - AIM_POINT_M), 0);
    // It stops at the touchdown (400 m past the threshold), not along the rollout.
    expect(p.tdX).toBeCloseTo(AIM_POINT_M - 400, 3);
    expect(p.pts[2 * (p.n - 1)]).toBeGreaterThan(p.tdX - 3);
    expect(p.runs).toEqual([]);
    expect(Math.abs(p.thrDevFt)).toBeLessThan(2);
    expect(profileSummary(p)).toMatch(/^Your approach from the side: inside the on-slope band all the way down, on the path at the threshold\.$/);
  });

  it('a scripted high-then-dive approach plots above the band, then below it', () => {
    // 150 ft high on the 3° path from 1,500 m to 900 m out, then a dive to 60% of the path's height, then
    // the last 150 m back to the runway.
    const high = 150 / 3.28084;
    const h = (dist) => (dist > 900 ? onPath(dist) + high
      : dist > 300 ? onPath(dist) * 0.6
        : Math.max(2, onPath(300) * 0.6 * Math.max(0, dist + 400) / 700));
    const p = profilePoints(fly({ h }), END, 400);
    expect(p.runs.map((r) => r.side)).toEqual(['above', 'below']);
    const [up, down] = p.runs;
    expect(up.fromM).toBeCloseTo(1500, -2);
    expect(up.toM).toBeCloseTo(900, -2);
    expect(down.fromM).toBeLessThan(900);
    expect(down.toM).toBeLessThan(down.fromM);
    expect(p.thrDevFt).toBeLessThan(-10); // low at the threshold
    const text = profileSummary(p);
    expect(text).toContain('above the band from 0.8 NM to 0.5 NM');
    expect(text).toMatch(/below it from 0\.\d NM to /);
    expect(text).toMatch(/\d+ ft low at the threshold\.$/);
  });

  it('the band is the PAPI\'s ±0.5°: 3.4° is inside, 3.6° above, 2.4° below', () => {
    const at = (deg) => profilePoints(fly({ h: (dist) => Math.max(2, (dist + AIM_POINT_M) * Math.tan(deg * Math.PI / 180)) }), END, 400).runs.map((r) => r.side);
    expect(at(3.4)).toEqual([]);
    expect(at(2.6)).toEqual([]);
    expect(at(3.6)).toEqual(['above']);
    expect(at(2.4)).toEqual(['below']);
  });

  it('only the final: a base turn before it (off the centreline) is left out', () => {
    // 1.5 km out to 1.1 km out: 600 m beside the centreline (on base); then on it.
    const p = profilePoints(fly({ h: (dist) => Math.max(2, onPath(dist)), crossAt: (dist) => (dist > 1100 ? 600 : 0) }), END, 400);
    expect(p.pts[0]).toBeLessThanOrEqual(1100 + AIM_POINT_M + 1);
    expect(p.pts[0]).toBeGreaterThan(1100 + AIM_POINT_M - 10);
  });

  it(`nothing under ${PROFILE_MIN_S} s of final, an empty buffer or no touchdown on the track`, () => {
    expect(PROFILE_MIN_S).toBe(5);
    expect(profilePoints(createReplayBuffer(), END, 400)).toBeNull();
    // 4 s of final at 70 m/s: 280 m.
    expect(profilePoints(fly({ h: (dist) => Math.max(2, onPath(dist)), startM: -120 }), END, 400)).toBeNull();
    // The touchdown is beyond the recording (the rollout ran the approach out of the ring): nothing to show.
    expect(profilePoints(fly({ h: (dist) => Math.max(2, onPath(dist)) }), END, 2000)).toBeNull();
  });

  it('the SVG: the band, a dashed 3° path, a solid track, the touchdown dot, no NaN; a legend and alt text', () => {
    const p = profilePoints(fly({ h: (dist) => Math.max(2, onPath(dist)) }), END, 400);
    const svg = profileSvg(p);
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('stroke-dasharray'); // the 3° path is dashed, the track solid: not colour alone
    expect(svg).toMatch(/<path d="M[^"]+Z"[^>]*fill=/); // the band
    expect(svg).toMatch(/<path d="M[^"]+"[^>]*stroke="#38bdf8"[^>]*\/>/); // the track
    expect(svg.match(/stroke="#38bdf8"[^>]*stroke-dasharray/)).toBeNull();
    expect(svg).toContain('<circle ');
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    expect(profileLegend).toMatch(/dashed: the 3° path/);
  });
});
