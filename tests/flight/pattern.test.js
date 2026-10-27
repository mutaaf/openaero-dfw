// Traffic pattern at Addison (ticket 0048), flown headless from the mission's real spawn
// (docs/LESSONS.md: fly a new mission hands off from its spawn at every assist level). Kid lets
// go: the assist (assists.js shapeControls, autoConfigure, the autothrottle main.js runs) flies
// pattern.js's guide round the circuit and the game's own localizer/glidepath guide down the
// final, as main.js applyAssists does. The pattern is the FAA's (AC 90-66C: 1,000 ft AGL; AFH
// FAA-H-8083-3C ch. 7: downwind 1/2 to 1 mile out, base with the touchdown point 45° behind the
// wing). Along the same flight, the words a Pilot would have been given must come in the
// pattern's order. Flat ground (the harness): the runway's threshold height is taken as 0.
import { describe, it, expect } from 'vitest';
import { Vector3, Quaternion, Euler } from 'three';
import { AIRCRAFT_DATABASE } from '../../src/aircraft.js';
import { M_TO_FT, KTS_TO_MPS } from '../../src/constants.js';
import { trimThrottle } from '../../src/flightModel.js';
import { airAt } from '../../src/atmosphere.js';
import { stallAoaDeg, headingError } from '../../src/aero.js';
import { glidepathGammaDeg, autothrottleCommand } from '../../src/autopilot.js';
import { runwayEnd, approachGeometry, selectActiveRunway } from '../../src/airports.js';
import { assistConfig, createAssistState, shapeControls, autoConfigure, kidTargetKts, kidLocalizerBankDeg } from '../../src/assists.js';
import { missionByKey } from '../../src/missions.js';
import { PATTERN_KEY, createPattern, kidGuide, patternPrompt, patternLeg, PT_TPA_FT } from '../../src/pattern.js';
import { makeBody, fly, attitude } from './harness.js';

const c172 = AIRCRAFT_DATABASE.c172;
const flat = (e) => ({ ...e, thrY: 0 });
const _e = new Euler();

// Kid, hands off, from the spawn to the touchdown. wind: { fromDeg, kts } (steady).
function flyPattern({ fromDeg = 0, kts = 0 } = {}) {
  const m = missionByKey(PATTERN_KEY);
  const cfg = assistConfig('kid');
  const ast = createAssistState();
  const st = createPattern(m);
  st.end = flat(st.end);
  const ends = [st.end, flat(runwayEnd('KADS', '34'))];
  const b = makeBody(c172, { kts: m.kias, altM: m.aglFt / M_TO_FT });
  b.apMaster = false;
  b.autoTrim = true; // Kid's assist trims (main.js: sim.autoTrim with an assist)
  const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -m.hdg * Math.PI / 180);
  b.quat.premultiply(yaw);
  b.vel.applyQuaternion(yaw);
  b.pos.x = m.pos[0]; b.pos.z = m.pos[1];
  const w = fromDeg * Math.PI / 180;
  b.windVec.set(-Math.sin(w) * kts * KTS_TO_MPS, 0, Math.cos(w) * kts * KTS_TO_MPS);
  b.vel.add(b.windVec);
  const sim = { pos: b.pos, vel: b.vel, spec: c172, assist: 'kid', activeEnd: null, aglFt: 0, iasKts: 0, flapsIndex: 0 };
  const s = {}, out = {}, conf = { gearDown: true, flapsIndex: 0 }, at = { trim: 0 };
  let selT = 0, prevIas = null, iasRate = 0, lastVs = 0;
  const prompts = [], legs = [];
  const rec = { maxBank: 0, maxDistNm: 0, minIas: Infinity, downwindAlt: [], baseTurnAlongM: null, finalFt: null };
  let td = null;
  fly(b, c172, 400, (x, dt) => {
    sim.aglFt = (x.pos.y - c172.gearHeight) * M_TO_FT; sim.iasKts = x.iasKts; sim.flapsIndex = x.flapsIndex;
    // main.js picks the runway you're lined up on twice a second.
    if ((selT -= dt) <= 0) {
      selT = 0.5;
      const hdg = (Math.atan2(x.vel.x, -x.vel.z) * 180 / Math.PI + 360) % 360;
      sim.activeEnd = selectActiveRunway(ends, x.pos, hdg, sim.activeEnd);
    }
    const { pitchDeg, bankRightDeg } = attitude(x);
    s.guideBankDeg = 0; s.guideGammaDeg = 0;
    const e = sim.activeEnd;
    const ap = e ? approachGeometry(e, x.pos) : null;
    const nose = (-_e.setFromQuaternion(x.quat, 'YXZ').y * 180 / Math.PI + 360) % 360;
    // main.js: the final's guide when lined up (captured on the nose, flown on the ground track,
    // 0097), else the pattern's (pattern.js kidGuide).
    if (e && ap.distM > 0 && ap.distM < 20000 && Math.abs(ap.crossM) < 1500 && Math.abs(headingError(e.hdgT, nose)) < 45) {
      s.guideBankDeg = kidLocalizerBankDeg(e.hdgT, (Math.atan2(x.vel.x, -x.vel.z) * 180 / Math.PI + 360) % 360, ap.crossM);
      s.guideGammaDeg = glidepathGammaDeg(ap.heightAbovePathM);
    }
    kidGuide(st, sim, s);
    Object.assign(s, {
      pitchIn: 0, rollIn: 0, yawIn: 0, pitchDeg, bankRightDeg, pitchRateUp: x.angVel.x, rollRateRight: -x.angVel.z,
      aoaDeg: x.aoaDeg ?? 0, betaDeg: x.betaDeg ?? 0, dihedralAil: 0, stallAoaDeg: stallAoaDeg(c172, x.flapsIndex),
      tailstrikeDeg: c172.maxGroundPitchDeg ?? 15, onGround: !!x.onGround, wheelHeightM: x.pos.y - c172.gearHeight,
      airspeedMps: (x.tasKts ?? 0) * KTS_TO_MPS,
    });
    shapeControls(cfg, ast, s, dt, out);
    x.elevInput = out.elev; x.aileronInput = out.ail; x.rudderInput = out.rud;
    if (x.onGround) { x.throttle = 0; x.brakesOn = true; return; }
    // Kid's flaps and power (main.js applyAssists).
    conf.flapsIndex = x.flapsIndex;
    autoConfigure(c172, { onGround: false, vsiFpm: x.vel.y * M_TO_FT * 60, aglFt: sim.aglFt, iasKts: x.iasKts }, conf);
    x.flapsIndex = conf.flapsIndex;
    if (prevIas !== null) iasRate += ((x.iasKts - prevIas) / dt - iasRate) * Math.min(1, dt / 0.5);
    prevIas = x.iasKts;
    if (s.wheelHeightM > 8) {
      const gs = Math.hypot(x.vel.x, x.vel.z);
      const gamma = Math.atan2(x.vel.y, Math.max(20, gs)) * 180 / Math.PI;
      const tgt = kidTargetKts(c172, x.flapsIndex);
      const ff = trimThrottle(c172, tgt * KTS_TO_MPS, x.flapsIndex, gamma, true, airAt(x.pos.y));
      x.throttle = autothrottleCommand(ff, at, x.iasKts, tgt, iasRate, dt);
    } else x.throttle = Math.max(0, x.throttle - dt * 0.5);
    lastVs = x.vel.y;
    if (process.env.PT_TRACE && Math.abs(x.t % 1) < dt && e) console.log(`t ${x.t.toFixed(0)} dist ${ap.distM.toFixed(0)} agl ${sim.aglFt.toFixed(0)} hap ${ap.heightAbovePathM.toFixed(1)} ias ${x.iasKts.toFixed(0)} vs ${(x.vel.y * M_TO_FT * 60).toFixed(0)} thr ${x.throttle.toFixed(2)} fl ${x.flapsIndex} gam ${s.guideGammaDeg.toFixed(1)} bank ${s.guideBankDeg.toFixed(1)} cross ${ap.crossM.toFixed(0)} pitch ${pitchDeg.toFixed(1)}`);
    // What a Pilot would be told here, and where the airplane is.
    const p = patternPrompt(st, { ...sim, assist: 'pilot' });
    if (p !== prompts[prompts.length - 1]) prompts.push(p);
    const g = patternLeg(st.end, { x: x.pos.x, z: x.pos.z, trackDeg: (Math.atan2(x.vel.x, -x.vel.z) * 180 / Math.PI + 360) % 360, aglFt: sim.aglFt });
    if (g.leg !== legs[legs.length - 1]) legs.push(g.leg);
    if (g.leg === 'downwind' && !g.abeam) rec.downwindAlt.push(sim.aglFt);
    // Where Kid actually rolls into the base turn (bank past 10° after abeam), and the cross then.
    if (g.leg === 'downwind' && g.abeam && bankRightDeg < -10 && rec.baseTurnAlongM === null) { rec.baseTurnAlongM = g.along; rec.baseTurnCrossM = g.cross; }
    if (g.leg === 'final' && rec.finalFt === null) rec.finalFt = { aglFt: sim.aglFt, alongM: g.along, crossM: g.cross };
    rec.maxBank = Math.max(rec.maxBank, Math.abs(bankRightDeg));
    rec.maxDistNm = Math.max(rec.maxDistNm, Math.hypot(x.pos.x - st.end.thrX, x.pos.z - st.end.thrZ) / 1852);
    rec.minIas = Math.min(rec.minIas, x.iasKts);
  }, (x) => {
    if (x.onGround && !td) {
      const g = approachGeometry(st.end, x.pos);
      td = { pastThrM: -g.distM, crossM: g.crossM, vsFpm: lastVs * M_TO_FT * 60, iasKts: x.iasKts, t: x.t, flaps: x.flapsIndex };
      return true;
    }
    return false;
  });
  return { td, prompts: prompts.filter((p) => p !== null), legs, rec };
}

const XWIND = { fromDeg: 250, kts: 10 };
describe('Cessna 172S traffic pattern at Addison 16, Kid hands off from the spawn (flightModel, ticket 0048)', () => {
  for (const [name, wind] of [['calm', {}], ['12 kt headwind on final (160°)', { fromDeg: 160, kts: 12 }], ['10 kt tailwind on final, headwind on the downwind (340°)', { fromDeg: 340, kts: 10 }], ['10 kt crosswind from the right (250°)', XWIND], ['10 kt crosswind from the left (070°)', { fromDeg: 70, kts: 10 }]]) {
    it(`${name}: flies downwind at 1,000 ft, turns base and final where cued and lands in the touchdown zone on the centreline`, () => {
      const { td, prompts, legs, rec } = flyPattern(wind);
      const dw = rec.downwindAlt;
      console.log(`[c172 flightModel] pattern ${name}: legs ${legs.join(' > ')}; downwind ${Math.min(...dw).toFixed(0)}-${Math.max(...dw).toFixed(0)} ft; base turn ${(rec.baseTurnAlongM / 1852).toFixed(2)} NM before; final at ${rec.finalFt && (-rec.finalFt.alongM / 1852).toFixed(2)} NM, ${rec.finalFt?.aglFt.toFixed(0)} ft; touchdown ${td && td.pastThrM.toFixed(0)} m past, ${td && td.crossM.toFixed(1)} m off, ${td && td.vsFpm.toFixed(0)} fpm, ${td && td.iasKts.toFixed(0)} KIAS, ${td && td.t.toFixed(0)} s; coach ${prompts.join(' > ')}`);
      // The circuit, in order (the spawn is on the downwind).
      expect(legs.slice(0, 3)).toEqual(['downwind', 'base', 'final']);
      // Downwind at pattern altitude (AC 90-66C), within the coach's ±150 ft.
      expect(Math.min(...dw)).toBeGreaterThan(PT_TPA_FT - 150);
      expect(Math.max(...dw)).toBeLessThan(PT_TPA_FT + 150);
      // Base rolled into with the threshold ~45° behind the wing (AFH): as far past abeam as the
      // downwind is out (0.75 NM), give or take a second or two of the roll.
      expect(-rec.baseTurnAlongM / Math.abs(rec.baseTurnCrossM)).toBeGreaterThan(0.9);
      expect(-rec.baseTurnAlongM / Math.abs(rec.baseTurnCrossM)).toBeLessThan(1.15);
      // The final long enough to be stable (>= 0.3 NM).
      expect(-rec.finalFt.alongM).toBeGreaterThan(0.3 * 1852);
      expect(rec.maxBank).toBeLessThan(31); // Kid's 30° cap
      expect(rec.maxDistNm).toBeLessThan(2.5);
      expect(rec.minIas).toBeGreaterThan(c172.stallCleanKts + 5);
      // Landed on 16: in the touchdown zone (landing.js: full marks to 600 m), on the centreline, gently.
      expect(td).not.toBeNull();
      expect(td.pastThrM).toBeGreaterThan(0);
      expect(td.pastThrM).toBeLessThan(600);
      expect(Math.abs(td.crossM)).toBeLessThan(8); // a crab flies the track, no steady offset (0097)
      expect(td.vsFpm).toBeGreaterThan(-400);
      // A Pilot along the same path: downwind, abeam, turn base, base, turn final, in that order.
      const order = ['ptDownwind', 'ptAbeam', 'ptTurnBaseL', 'ptBase', 'ptTurnFinalL'].map((k) => prompts.indexOf(k));
      expect(order.every((i) => i >= 0)).toBe(true);
      expect([...order].sort((a, c) => a - c)).toEqual(order);
      expect(prompts).not.toContain('ptSlow');
      expect(prompts).not.toContain('ptLow');
    });
  }
});
