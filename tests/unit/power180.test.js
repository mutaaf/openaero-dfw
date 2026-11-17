import { describe, it, expect } from 'vitest';
import {
  P180_KEY, P180_TEXT, SPOT_M, BEYOND_FT, SPOT_X, SPOT_Z, DOWNWIND_NM, TURN_FT, FLAPS_FT,
  createDeadStick, power180Target, deadStickPrompt, spotGeometry, spotScore, deadStickResult, kidGuide, p180Step, landingEnd,
} from '../../src/power180.js';
import { gradeLanding } from '../../src/landing.js';
import { coachText } from '../../src/coach.js';
import { MISSIONS, missionByKey, groupMissions } from '../../src/missions.js';
import { missionFromLink } from '../../src/deeplink.js';
import { runwayEnd, approachGeometry, AIM_POINT_M } from '../../src/airports.js';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { stallAoaDeg } from '../../src/aero.js';
import { assistBestKey } from '../../src/assists.js';
import { M_TO_FT } from '../../src/constants.js';

const E16 = runwayEnd('KADS', '16');
const E34 = runwayEnd('KADS', '34');
const NM = 1852;
const r16 = E16.hdgT * Math.PI / 180, DX = Math.sin(r16), DZ = -Math.cos(r16);
// A point `pastM` past the spot along 16's centreline and `rightM` right of it (looking down 16).
const atSpot = (pastM, rightM = 0) => ({ x: SPOT_X + DX * pastM - DZ * rightM, z: SPOT_Z + DZ * pastM + DX * rightM });
const input = (over) => ({ t: 30, iasKts: 68, aglFt: 900, ...atSpot(-300, -926), trackDeg: 340, flaps: 0, windX: 0, windZ: 0, tasMps: 35, kid: false, turned: false, ...over });
// A touchdown on 16 `pastFt` past the spot, graded by landing.js as main.js does.
function touchdown(pastFt, { crossM = 0, vsFpm = -150, iasKts = 60, pitchDeg = 4, bankDeg = 0 } = {}) {
  const p = atSpot(pastFt / M_TO_FT, crossM);
  const pos = { x: p.x, y: 0, z: p.z };
  const g = approachGeometry(E16, pos);
  const landing = gradeLanding({ vsFpm, crossM: g.crossM, pastThresholdM: -g.distM, runwayLengthM: E16.lengthM - E16.displacedM, runwayWidthM: E16.widthM, pitchDeg, bankDeg, iasKts, vrefKts: 62 });
  return { landing, pos, end: landingEnd(E16.hdgT) };
}

describe('power-off 180 mission (ticket 0189)', () => {
  const m = missionByKey(P180_KEY);

  it('is the Cessna, engine out, 1,000 ft up at 85 KIAS on a left downwind for 16, half a mile east, abeam the spot', () => {
    expect(m.key).toBe('pad_180_kads_16');
    expect(m).toMatchObject({ kind: 'drill', airport: 'KADS', rwy: '16', aircraft: 'c172', aglFt: 1000, kias: 85, hdg: 340, deadStick: true, power180: true, group: 'drills' });
    expect((m.hdg - E16.hdgT + 360) % 360).toBe(180); // downwind: the reciprocal of the landing direction
    const g = approachGeometry(E16, { x: m.pos[0], y: 0, z: m.pos[1] });
    expect(Math.abs(g.crossM + DOWNWIND_NM * NM)).toBeLessThan(5); // left of the landing direction: east
    expect(Math.abs(-g.distM - SPOT_M)).toBeLessThan(5); // abeam the spot
  });

  it('the spot is the aiming-point marking, 1,000 ft past the landing threshold (the strip and the 3D runway paint it)', () => {
    expect(SPOT_M).toBe(AIM_POINT_M);
    expect(Math.round(SPOT_M * M_TO_FT / 10) * 10).toBe(1000);
    const g = approachGeometry(E16, { x: SPOT_X, y: 0, z: SPOT_Z });
    expect(g.crossM).toBeCloseTo(0, 6);
    expect(-g.distM).toBeCloseTo(SPOT_M, 6);
    expect(BEYOND_FT).toBe(200); // ACS: −0/+200 ft
  });

  it('is in the Drills group, deep-links, and keeps its bests per assist level (invariant 6)', () => {
    const drills = groupMissions(MISSIONS).find((g) => g.id === 'drills');
    expect(drills.missions.map((x) => x.key)).toContain(P180_KEY);
    expect(missionFromLink(`?mission=${P180_KEY}`)).toBe(P180_KEY);
    expect(assistBestKey(P180_KEY, 'pilot')).toBe(P180_KEY);
    expect(assistBestKey(P180_KEY, 'kid')).toBe(`${P180_KEY}@kid`);
  });

  it('every prompt has words in the coach (DRILL_TEXT), short enough for a phone\'s card', () => {
    for (const [key, text] of Object.entries(P180_TEXT)) {
      expect(coachText(key)).toBe(text);
      expect(text.length).toBeLessThanOrEqual(64);
    }
    expect(AIRCRAFT_DATABASE.c172.vGlideKts).toBe(68);
  });
});

describe('power-off 180 coach (power180.js power180Target)', () => {
  it('says engine out first; Kid hears the plane glides', () => {
    expect(power180Target(input({ t: 0, iasKts: 85 }))).toBe('p1Fail');
    expect(power180Target(input({ t: 0, kid: true }))).toBe('p1KidFail');
    expect(power180Target(input({ kid: true }))).toBe('p1Kid');
  });

  it('is quiet below the flare height (the landing coach has it)', () => {
    expect(power180Target(input({ aglFt: 40 }))).toBeNull();
  });

  it('says slow or fast around best glide', () => {
    expect(power180Target(input({ iasKts: 58 }))).toBe('p1Slow');
    expect(power180Target(input({ iasKts: 80 }))).toBe('p1Fast');
  });

  it('abeam the spot at 1,000 ft: too high to turn, glide on (the spot off the left)', () => {
    const s = input({ aglFt: 1000, ...atSpot(0, -926) });
    expect(spotGeometry(s).viaFinalFt).toBeGreaterThan(TURN_FT);
    expect(power180Target(s)).toBe('p1WaitL');
  });

  it('down the downwind, once the way round is within reach: turn left now, and it does not take the turn back', () => {
    // 600 m past abeam, 650 ft: the way round (base 926 m, final ~640 m, flaps 20 on the last 600) leaves under TURN_FT.
    const s = input({ aglFt: 650, ...atSpot(-640, -926) });
    expect(spotGeometry(s).viaFinalFt).toBeLessThanOrEqual(TURN_FT);
    expect(power180Target(s)).toBe('p1TurnL');
    const st = createDeadStick(0);
    const sim = { simTime: 30, iasKts: 68, aglFt: 650, pos: { ...atSpot(-640, -926), y: 0 }, vel: { x: -DX, y: 0, z: -DZ }, flapsIndex: 0, tasKts: 68, windVec: { x: 0, z: 0 }, assist: 'pilot' };
    expect(deadStickPrompt(st, sim)).toBe('p1TurnL');
    expect(st.turned).toBe(true);
    sim.aglFt = 900; // higher again (an updraft): the coach keeps guiding the turn it called
    expect(deadStickPrompt(st, sim)).toBe('p1TurnL');
    sim.simTime = 36; // still turning 6 s later: "keep turning"
    expect(deadStickPrompt(st, sim)).toBe('p1KeepL');
  });

  it('on final: flaps 20 when they still reach, flaps 30 after; low says flaps up; over the runway, touch on the blocks', () => {
    const fin = (pastM, aglFt, flaps = 0) => input({ ...atSpot(pastM, 0), aglFt, flaps, trackDeg: E16.hdgT, turned: true });
    expect(power180Target(fin(-700, 600))).toBe('p1Flaps');
    expect(power180Target(fin(-700, 600, 2))).toBe('p1High');
    expect(power180Target(fin(-700, 260))).toBe('p1Final'); // 660 m to the aim (FLOAT_M 40): 9.2:1 makes it (235 ft), 7.5:1 does not (289)
    expect(power180Target(fin(-700, 225))).toBe('p1Final'); // a little under the glide: not yet "low"
    expect(power180Target(fin(-700, 120))).toBe('p1LowF');
    expect(P180_TEXT.p1LowF).not.toMatch(/flaps up/);
    expect(power180Target(fin(-150, 80, 2))).toBe('p1High'); // still high over the pavement: flaps 30
    expect(power180Target(fin(-150, 80, 3))).toBe('p1Runway');
    expect(FLAPS_FT).toBeGreaterThan(0);
  });

  it('reads the wind per leg: a tailwind on the base says wait longer than calm, a headwind turn sooner', () => {
    const at = { aglFt: 700, ...atSpot(-500, -926) };
    const calm = spotGeometry(input(at)).viaFinalFt;
    // The base leg heads 250° (west-south-west): a wind from 070° pushes along it.
    const r = 70 * Math.PI / 180, kt = 10 * 0.514444;
    const tail = spotGeometry(input({ ...at, windX: -Math.sin(r) * kt, windZ: Math.cos(r) * kt })).viaFinalFt;
    const head = spotGeometry(input({ ...at, windX: Math.sin(r) * kt, windZ: -Math.cos(r) * kt })).viaFinalFt;
    expect(tail).toBeGreaterThan(calm);
    expect(head).toBeLessThan(calm);
  });
});

describe('power-off 180 start (power180.js p180Step)', () => {
  const v3 = (x, y, z) => ({ x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; } });
  it('holds the Cessna at its spawn behind the start screen, and the engine quits (the coach\'s clock starts) as flying starts', () => {
    const st = createDeadStick(5);
    const m = missionByKey(P180_KEY);
    // The chunk arrived late (a slow link): the Cessna has glided 50 m on and 15 ft down since the spawn.
    const sim = { simTime: 5, aglFt: 985, pos: v3(m.pos[0] - 17, 310, m.pos[1] - 47), vel: v3(0, -1, -40), angVel: v3(0, 0, 0), quat: { x: 0, y: 0.98, z: 0, w: 0.17, set(a, b, c, d) { Object.assign(this, { x: a, y: b, z: c, w: d }); } } };
    p180Step(st, sim, false);
    const held = [sim.pos.x, sim.pos.y, sim.pos.z];
    expect(held[0]).toBe(m.pos[0]);
    expect(held[2]).toBe(m.pos[1]);
    expect(held[1]).toBeCloseTo(310 + 15 / M_TO_FT, 6); // back up to the mission's 1,000 ft
    sim.pos.set(1, 290, -40); sim.angVel.set(0.1, 0, 0); sim.simTime = 9; // the start screen's 4 s of gliding
    p180Step(st, sim, false);
    expect([sim.pos.x, sim.pos.y, sim.pos.z]).toEqual(held);
    expect(sim.angVel.x).toBe(0);
    expect(st.t0).toBe(9);
    sim.simTime = 12;
    p180Step(st, sim, true); // ENTER COCKPIT
    expect(st.live).toBe(true);
    expect(st.t0).toBe(12);
    expect(power180Target(input({ t: sim.simTime - st.t0 }))).toBe('p1Fail');
    Object.assign(sim, { spec: AIRCRAFT_DATABASE.c172, flapsIndex: 0, aoaDeg: 0, onGround: false });
    sim.pos.set(1, 250, -100); sim.simTime = 20;
    p180Step(st, sim, false); // a menu opened mid-flight: no jump back
    expect(sim.pos.y).toBe(250);
  });
});

describe("power-off 180 Kid's guide (power180.js kidGuide)", () => {
  const sim = (over) => ({ simTime: 30, iasKts: 68, aglFt: 1000, pos: { ...atSpot(0, -926), y: 0 }, vel: { x: -DX, y: 0, z: -DZ }, flapsIndex: 0, tasKts: 68, windVec: { x: 0, z: 0 }, assist: 'kid', ...over });
  it('holds the wings level down the downwind, turns left when the coach would, and sets Kid\'s flaps on final', () => {
    const st = createDeadStick(0), out = {};
    expect(kidGuide(st, sim(), out).guideBankDeg).toBe(0);
    expect(out.guideGammaDeg).toBeLessThan(0);
    expect(kidGuide(st, sim({ aglFt: 650, pos: { ...atSpot(-640, -926), y: 0 } }), out).guideBankDeg).toBeLessThan(-10);
    const fin = sim({ aglFt: 600, pos: { ...atSpot(-700, 0), y: 0 }, vel: { x: DX, y: 0, z: DZ } });
    kidGuide(st, fin, out);
    expect(fin.flapsIndex).toBe(2);
    const pilot = sim({ aglFt: 600, pos: { ...atSpot(-700, 0), y: 0 }, vel: { x: DX, y: 0, z: DZ }, assist: 'learner' });
    kidGuide(st, pilot, out);
    expect(pilot.flapsIndex).toBe(0); // Learner's and Pilot's flaps are their own
  });
});

describe('power-off 180 grade (power180.js deadStickResult)', () => {
  const grade = (pastFt, opts, st) => { const t = touchdown(pastFt, opts); return deadStickResult(t.landing, t.end, t.pos, st); };

  it('on the spot to 200 ft past: full marks for the spot, an A or B with a fair touchdown', () => {
    expect(spotScore(0)).toBe(100);
    expect(spotScore(200)).toBe(100);
    for (const ft of [5, 100, 195]) {
      const r = grade(ft);
      expect(['S', 'A', 'B']).toContain(r.grade);
      expect(r.factors[0]).toMatchObject({ key: 'spot', score: 100 });
      expect(r.reason).toBeNull();
      expect(r.title).toBe('Power-off 180');
    }
    expect(['A', 'B']).toContain(grade(100, { vsFpm: -250 }).grade);
  });

  it('on Kid (the plane flew it) the card says how far, with no advice', () => {
    const st = createDeadStick(0);
    p180Step(st, { assist: 'kid', simTime: 0, aglFt: 300, aoaDeg: 0, spec: AIRCRAFT_DATABASE.c172, flapsIndex: 0, onGround: true });
    expect(grade(400, {}, st).reason).toBe('400 ft past the spot.');
    expect(grade(-50, {}, st).reason).toMatch(/^Short of the spot by 5\d ft\.$/);
  });

  it('both sides of the window fail the test: just short is a C, just past is a B, never better', () => {
    expect(grade(-1).grade).toBe('C');
    expect(grade(-1).score).toBe(69);
    expect(grade(201).grade).toBe('B');
    expect(grade(201).reason).toMatch(/^201 ft past the spot/);
    expect(grade(250).score).toBeLessThanOrEqual(84);
    expect(grade(-300).grade).toBe('D'); // far short: the spot's marks are gone
    expect(spotScore(-1)).toBeGreaterThan(spotScore(-100));
    expect(spotScore(201)).toBeLessThan(100);
  });

  it('the nose against the track at touchdown is graded (ACS: longitudinal axis aligned)', () => {
    const t = touchdown(100);
    const st = createDeadStick(0);
    st.driftDeg = 0.5;
    const straight = deadStickResult(t.landing, t.end, t.pos, st);
    st.driftDeg = 9;
    const crabbed = deadStickResult(t.landing, t.end, t.pos, st);
    expect(straight.factors.find((f) => f.key === 'align').score).toBe(100);
    expect(crabbed.factors.find((f) => f.key === 'align').score).toBeLessThan(50);
    expect(crabbed.score).toBeLessThan(straight.score);
  });

  it('50 ft short: a C at best, and it says short of the spot', () => {
    const r = grade(-50);
    expect(r.grade).toBe('C');
    expect(r.score).toBeLessThanOrEqual(69);
    expect(r.reason).toMatch(/^Short of the spot by 5\d ft/);
    expect(r.factors[0].value).toMatch(/short$/);
  });

  it('600 ft long: says how far, and the spot\'s marks are mostly gone', () => {
    const r = grade(600);
    expect(r.reason).toMatch(/^600 ft past the spot/);
    expect(r.factors[0].score).toBeLessThanOrEqual(30);
    expect(['C', 'D']).toContain(r.grade);
    expect(r.score).toBeLessThanOrEqual(84);
    expect(spotScore(300)).toBeLessThan(spotScore(250));
  });

  it('the touchdown zone is the spot\'s job: no zone factor; the strip shades the ACS window', () => {
    const r = grade(100);
    expect(r.factors.map((f) => f.key)).not.toContain('zone');
    expect(r.touchdown.zoneM[0]).toBeCloseTo(SPOT_M, 6);
    expect(r.touchdown.zoneM[1]).toBeCloseTo(SPOT_M + 200 / M_TO_FT, 6);
  });

  it('a stall on the way down is a D at best', () => {
    const st = createDeadStick(0);
    const spec = AIRCRAFT_DATABASE.c172, stall = stallAoaDeg(spec, 0);
    const step = (simTime, aglFt, aoaDeg) => p180Step(st, { simTime, aglFt, aoaDeg, spec, flapsIndex: 0, onGround: false });
    step(0, 300, 0); // flying starts (live)
    step(0.1, 300, stall - 1);
    expect(st.stalled).toBe(false);
    for (let t = 0.2; t < 2; t += 0.1) step(t, 30, stall + 1); // the flare: not counted
    expect(st.stalled).toBe(false);
    step(2.1, 300, stall + 1); step(2.2, 300, stall - 1); // a gust's moment past it: not a stall
    expect(st.stalled).toBe(false);
    for (let t = 2.3; t < 3; t += 0.1) step(t, 300, stall + 1); // held past it for 0.5 s
    expect(st.stalled).toBe(true);
    const r = grade(100, {}, st);
    expect(r.grade).toBe('D');
    expect(r.reason).toMatch(/Stalled/);
  });

  it('off the pavement or on 34: the dead-stick\'s miss card, a D at best; a crash stays a crash', () => {
    const shortField = touchdown(-(SPOT_M + E16.displacedM + 100) * M_TO_FT);
    const miss = deadStickResult(shortField.landing, shortField.end, shortField.pos);
    expect(miss.grade).toBe('D');
    expect(miss.reason).toMatch(/^Short of the runway/);
    const t = touchdown(500);
    const r34 = deadStickResult(t.landing, landingEnd(E34.hdgT), t.pos);
    expect(r34.grade).toBe('D');
    expect(r34.reason).toMatch(/34/);
    const crash = grade(100, { vsFpm: -800 });
    expect(crash.grade).toBe('CRASH');
    expect(crash.score).toBe(0);
  });
});
