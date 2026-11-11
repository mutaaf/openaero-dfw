// Low-ceiling approach mission (ticket 0092): a scripted low-IFR day on the ILS to KDFW 35C,
// and the decision height. A lazy chunk, loaded with the mission (main.js startDrills); boot
// carries only the mission's entry and the hooks. Pure (no THREE, no DOM): tests/unit/lowIfr.test.js.
import { parseMetar } from './metar.js';
import { M_TO_FT } from './constants.js';
import { DRILL_TEXT, RANK, TOUCH_WORDS } from './coach.js';
import { fogDensityForVisibility } from './weather.js';

// Flight category, AIM 7-1-7 (verbatim at angleofattack.com/aim/chapter-7/7-1-7/): LIFR is a
// ceiling under 500 ft and/or visibility under 1 SM; IFR 500 to under 1,000 ft and/or 1 to
// under 3 SM; MVFR 1,000 to 3,000 ft and/or 3 to 5 SM inclusive; VFR above both. The ceiling is
// the lowest broken or overcast layer (null: none). The worse of the two decides.
export function flightCategory(ceilingFt, visibilitySm) {
  const c = ceilingFt ?? Infinity, v = visibilitySm ?? Infinity;
  if (c < 500 || v < 1) return 'LIFR';
  if (c < 1000 || v < 3) return 'IFR';
  if (c <= 3000 || v <= 5) return 'MVFR';
  return 'VFR';
}

// The day's report, in the Worker's JSON shape so it goes through the same parser as a live
// one: 12 kt from 350° (11.8 kt on the nose of 35C, 2 kt from the left), 2 SM in mist, broken
// at 400 ft and overcast at 800 (above the field). A mist (BR) report is 5/8 to 6 SM with a close dew point; it wets nothing.
// Labelled "SCENARIO", never live.
export const LOW_IFR_REPORT = {
  icaoId: 'KDFW', obsTime: null, rawOb: 'SCENARIO KDFW 35012KT 2SM BR BKN004 OVC008 12/11 A2992',
  wdir: 350, wspd: 12, visib: '2', altim: 1013.2, temp: 12, dewp: 11,
  clouds: [{ cover: 'BKN', base: 400 }, { cover: 'OVC', base: 800 }],
};
export function lowIfrWeather() {
  const wx = parseMetar(LOW_IFR_REPORT);
  wx.fltCat = flightCategory(wx.ceilingFt, wx.visibilitySm);
  wx.live = false;
  wx.scripted = true; // atis.js: this mission's report, not the offline fallback
  return wx;
}
// One object for the mission's whole run: main.js currentWeather() hands it out, and its
// identity is how syncWeatherUI knows nothing changed.
export const WX = lowIfrWeather();

// Decision height: a Category I ILS approach is flown to a height above touchdown of not less
// than 200 ft (FAA Pilot/Controller Glossary, "ILS CATEGORIES"); there the pilot decides,
// visual reference in sight or an immediate missed approach (14 CFR 1.1, "Decision height").
// Read as the altimeter reads it, the aircraft's height above the threshold (standing in for the
// touchdown zone elevation; like the stabilized gate's), not the radio altitude over the ground.
export const DH_FT = 200;
// Re-armed 100 ft above it, like the GPWS heights (aero.js gpwsRearm): a go-around and a
// second approach are called again; a bump in the descent is not.
const REARM_FT = DH_FT + 100;
// How long the coach's decision prompt holds after the call.
export const DH_PROMPT_S = 5;

export const createDh = () => ({ armed: false, calledAt: null, calls: 0, missed: false });

// In the cloud. The sky dome's layers are flat planes you see through edge-on, so above the broken
// base the view would be clear down to the runway; in a real BKN004 OVC008 day you are in cloud
// from the spawn down to the base. The fog's density for the camera's height above the threshold
// (camHatFt): the report's 2 SM below 380 ft, ~120 m in the cloud above 440 ft (a ramp between,
// the break-out). One number a frame, no allocation (main.js sets scene.fog.density).
const CLEAR_FOG = fogDensityForVisibility(2);
const CLOUD_FOG = 1.517 / 120;
export function cloudFog(camHatFt) {
  const k = Math.min(1, Math.max(0, (camHatFt - 380) / 60));
  return CLEAR_FOG + (CLOUD_FOG - CLEAR_FOG) * k;
}

// One frame. st is mutated (no allocation). s: main.js's sim (pos.y, vel.y, activeEnd.thrY,
// approach.distM: metres to the threshold along the course, + before it; simTime). True on the
// frame the aircraft descends through the decision height on the final, before the threshold.
export function dhStep(st, s) {
  const end = s.activeEnd;
  if (!end || s.onGround) return false;
  const hatFt = (s.pos.y - end.thrY) * M_TO_FT;
  // A missed approach: full power and climbing after the call (the coach then flies it with you).
  if (st.calledAt !== null && !st.missed && s.throttle >= 0.9 && s.vel.y > 0 && hatFt < DH_FT + 300) st.missed = true;
  if (hatFt > REARM_FT) { st.armed = true; return false; }
  if (!st.armed || hatFt > DH_FT || !(s.vel.y < 0) || !(s.approach.distM > 0)) return false;
  st.armed = false;
  st.missed = false;
  st.calledAt = s.simTime;
  st.calls++;
  return true;
}

// The coach's prompt key for DH_PROMPT_S after the call, in the air (main.js feeds it as s.ds, which
// coach.js puts above every landing prompt). So it gives way at once to what matters more: the
// gear not down, a sink over 1,200 fpm (the coach's 'sink'), and under 100 ft of radio altitude,
// the flare and the idle call.
// After a missed approach (st.missed) it coaches the climb-out instead, step by step (the go-around
// drill's order, goAround.js): power, pitch, a notch of flap, gear, climb; then how to try again.
export function dhPrompt(st, s, kid) {
  if (st.missed && !kid && !s.onGround) {
    if (s.throttle < 0.9) return 'maPower';
    if (s.vsiFpm <= 0) return 'maPitch';
    if (s.flapsIndex >= (s.spec.landingFlapsIndex ?? 2)) return 'maFlaps'; // aero.js landingFlaps, inlined
    if (s.gearDown && !s.spec.fixedGear) return 'maGear';
    return (s.pos.y - s.activeEnd.thrY) * M_TO_FT < 1500 ? 'maClimb' : 'maDone';
  }
  if (st.calledAt === null || s.onGround || s.simTime - st.calledAt > DH_PROMPT_S) return null;
  if (!s.gearDown || s.vsiFpm < -1200 || s.raFt < 100) return null;
  return kid ? 'dhKid' : 'dh';
}

export const DH_TEXT = {
  dh: 'Minimums: lights in sight? Land. No lights: full power, nose up, go around',
  dhKid: 'Minimums (200 ft): there are the runway lights! Let the plane land',
  maPower: 'Go around! Full power',
  maPitch: 'Nose up: climb away',
  maFlaps: 'Flaps up one notch: press F',
  maGear: 'Climbing: gear up (G)',
  maClimb: 'Climb straight ahead to 1,500 ft',
  maDone: 'Missed approach: good call. To try again: RESET (in the Menu)',
};
Object.assign(DRILL_TEXT, DH_TEXT);
Object.assign(TOUCH_WORDS, { maPower: 'Go around! Slide the throttle to the top', maPitch: 'Nose up: push the stick up, climb away', maFlaps: 'Flaps up one notch: tap FLAPS', maGear: 'Climbing: tap GEAR to raise it' });
// Rank 3: it replaces the path prompts (rank 1-2) at once when it starts; dhPrompt's own gates hand the
// card back to gear, sink, flare and idle (as s.ds it outranks them in coach.js coachTarget).
Object.assign(RANK, { dh: 3, dhKid: 3, maPower: 4, maPitch: 4, maFlaps: 4, maGear: 4, maClimb: 4, maDone: 4 });
