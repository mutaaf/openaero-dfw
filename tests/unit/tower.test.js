// Ticket 0145: the tower's landing clearance. FAA Order JO 7110.65 para 3-10-5 (RUNWAY (number) CLEARED TO LAND),
// para 2-4-17 (wind: separate digits, nearest 10°, "at", gusts; runway: separate digits, left/right/center) and
// para 2-4-21 (type in group form).
import { describe, it, expect } from 'vitest';
import { towerClearance, towerStep, quietMission, CLEAR_FT, FLOOR_FT } from '../../src/tower.js';
import { ATIS_MAG_VAR_DEG } from '../../src/atis.js';
import { RUNWAY_ENDS, runwayEnd, approachGeometry, courseVector } from '../../src/airports.js';
import { scenarioWeather } from '../../src/weather.js';
import { MISSIONS } from '../../src/missions.js';

const DIGIT = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'];
const SIDE = { L: 'left', C: 'center', R: 'right' };
// METAR winds are true; the tower's magnetic: 352.7° true is 350 magnetic at DFW's 2.7° E.
const LIVE = { live: true, windDirDeg: 350 + ATIS_MAG_VAR_DEG, windKts: 10, gustKts: 10 };

describe('towerClearance words (7110.65 3-10-5, 2-4-17, 2-4-21)', () => {
  it('KDFW 35C in a Cessna: type, wind, runway three five center, cleared to land', () => {
    const c = towerClearance(runwayEnd('KDFW', '35C'), LIVE, 'c172');
    expect(c.speech).toBe('Cessna one seventy-two, wind three five zero at one zero, runway three five center, cleared to land.');
    expect(c.text).toBe('Cleared to land 35C · Wind 350 at 10');
    expect(c.holdS).toBeGreaterThanOrEqual(4);
  });
  it('the runway words come from the end flown, for every end of the six airports', () => {
    expect(RUNWAY_ENDS.length).toBeGreaterThanOrEqual(30);
    for (const end of RUNWAY_ENDS) {
      const [, num, side] = /^(\d+)([LCR]?)$/.exec(end.ident);
      const words = `runway ${[...num].map((d) => DIGIT[d]).join(' ')}${side ? ` ${SIDE[side]}` : ''}, cleared to land.`;
      const c = towerClearance(end, LIVE, 'b738');
      expect(c.speech, end.id).toMatch(new RegExp(`^Boeing seven thirty-seven, wind .*, ${words}$`));
      expect(c.text, end.id).toContain(`Cleared to land ${end.ident} · `);
      // Two parts of ≤ 26 characters each, even with a scenario gust: the caption stays two lines.
      const worst = towerClearance(end, { live: false, windDirDeg: 352.7, windKts: 23, gustKts: 32 }, 'b738').text;
      const [first, second] = worst.split(' · ');
      expect(first.length, first).toBeLessThanOrEqual(22); // with its " ·" inside 26
      expect(second.length, second).toBeLessThanOrEqual(26);
    }
    expect(towerClearance(runwayEnd('KDFW', '17R'), LIVE, 'b738').speech).toContain('runway one seven right, cleared');
    expect(towerClearance(runwayEnd('KDFW', '18L'), LIVE, 'b738').speech).toContain('runway one eight left, cleared');
    expect(towerClearance(runwayEnd('KDAL', '13R'), LIVE, 'b738').speech).toContain('runway one three right, cleared');
    expect(towerClearance(runwayEnd('KFTW', '16'), LIVE, 'f16').speech).toBe('F-sixteen, wind three five zero at one zero, runway one six, cleared to land.');
  });
  it('wind: magnetic, nearest 10°, 360 for north, gusts, calm, variable', () => {
    const end = runwayEnd('KDFW', '17C');
    const say = (wx) => towerClearance(end, { live: true, ...wx }, 'c172');
    expect(say({ windDirDeg: 2.7 + 4, windKts: 7 }).speech).toContain('wind three six zero at seven,');
    expect(say({ windDirDeg: 182.7, windKts: 14, gustKts: 22 }).speech).toContain('wind one eight zero at one four gusts two two,');
    expect(say({ windDirDeg: 182.7, windKts: 14, gustKts: 22 }).text).toBe('Cleared to land 17C · Wind 180 at 14G22');
    expect(say({ windDirDeg: 90, windKts: 0 }).speech).toBe('Cessna one seventy-two, wind calm, runway one seven center, cleared to land.');
    expect(say({ windDirDeg: null, windKts: 4 }).speech).toContain('wind variable at four,');
  });
  it('a wind that is not a live METAR is labelled scenario on the caption', () => {
    const c = towerClearance(runwayEnd('KDFW', '35C'), scenarioWeather(), 'c172');
    expect(c.text).toMatch(/^Cleared to land 35C · Scenario wind \d{3} at \d+/);
    expect(c.speech).not.toMatch(/scenario/i); // the tower's words stay the tower's
  });
  it('a live METAR from another field (the DFW fallback) is named on the caption', () => {
    const c = towerClearance(runwayEnd('KADS', '16'), { ...LIVE, icao: 'KDFW' }, 'c172');
    expect(c.text).toBe('Cleared to land 16 · KDFW wind 350 at 10');
    expect(towerClearance(runwayEnd('KADS', '16'), { ...LIVE, icao: 'KADS' }, 'c172').text).toBe('Cleared to land 16 · Wind 350 at 10');
  });
});

// A body on the 3° path to an end: `nm` out, `ft` above the threshold, flying down the centreline at 140 kt.
function onFinal(end, nm, ft, extra = {}) {
  const d = courseVector(end.hdgT), distM = nm * 1852;
  const pos = { x: end.thrX - d.x * distM, y: (end.thrY ?? 0) + ft * 0.3048, z: end.thrZ - d.z * distM };
  const v = 72;
  const sim = { activeEnd: end, pos, vel: { x: d.x * v, y: -3.8, z: d.z * v }, onGround: false, engineFailed: false,
    loadedMission: MISSIONS.find((m) => m.kind === 'final' && !quietMission(m)), wx: LIVE, aircraftKey: 'b738', towerFor: null, ...extra };
  sim.approach = approachGeometry(end, pos);
  return sim;
}

describe('towerStep: once, on a steady final, at 800 ft or 2 NM', () => {
  const end = runwayEnd('KDFW', '35C');
  it('quiet at 4 NM and 1,270 ft; cleared at 800 ft; once', () => {
    expect(towerStep(onFinal(end, 4, 1270))).toBeNull();
    const s = onFinal(end, 2.5, CLEAR_FT - 5);
    const c = towerStep(s);
    expect(c.speech).toContain('runway three five center, cleared to land');
    expect(s.towerFor).toBe(end.id);
    expect(towerStep(s)).toBeNull(); // said once
    // A go-around and a second final to the same end: not again.
    expect(towerStep({ ...s, ...onFinal(end, 2, 640), towerFor: s.towerFor })).toBeNull();
    // A new final to another end is a new clearance.
    const s2 = onFinal(runwayEnd('KDFW', '36L'), 2, 640, { towerFor: s.towerFor });
    expect(towerStep(s2)?.speech).toContain('runway three six left');
  });
  it('2 NM wins when high on the path (above 800 ft)', () => {
    expect(towerStep(onFinal(end, 2.1, 900))).toBeNull();
    expect(towerStep(onFinal(end, 1.95, 900))).not.toBeNull();
  });
  it('never under 500 ft, climbing, on the ground, past the threshold, off the centreline or tracking across it', () => {
    expect(towerStep(onFinal(end, 1.4, FLOOR_FT - 10))).toBeNull();
    const climbing = onFinal(end, 2, 640); climbing.vel.y = 2;
    expect(towerStep(climbing)).toBeNull();
    expect(towerStep(onFinal(end, 2, 640, { onGround: true }))).toBeNull();
    const off = onFinal(end, 2, 640); off.pos.x += 600; off.approach = approachGeometry(end, off.pos);
    expect(towerStep(off)).toBeNull();
    const across = onFinal(end, 2, 640); across.vel.x = 72; across.vel.z = 0;
    expect(towerStep(across)).toBeNull();
    expect(towerStep(onFinal(end, 2, 640, { activeEnd: null }))).toBeNull();
  });
  it('not in a drill whose coach speaks, nor with the engine out', () => {
    for (const k of ['goAround', 'deadStick', 'engineOutFt', 'rto', 'windshear', 'stallDrill', 'pattern', 'steepTurns']) {
      expect(towerStep(onFinal(end, 2, 640, { loadedMission: { kind: 'final', [k]: 1 } })), k).toBeNull();
    }
    expect(towerStep(onFinal(end, 2, 640, { engineFailed: true }))).toBeNull();
    // Every drill mission in the catalogue is one of those.
    const drills = MISSIONS.filter((m) => m.goAround || m.deadStick || m.engineOutFt || m.rto || m.windshear);
    expect(drills.length).toBeGreaterThan(3);
    for (const m of drills) expect(quietMission(m), m.key).toBe(true);
  });
});
