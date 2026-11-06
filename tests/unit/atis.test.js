// Ticket 0030: an ATIS-style briefing built from the METAR the game flies. Phraseology from FAA Order
// JO 7110.65 para 2-9-3 (content, in that order: field, letter, time, wind, visibility, weather, sky,
// temperature, dew point, altimeter, runway in use; the letter at both ends) and para 2-4-17 (numbers:
// separate digits, "niner"; wind to the nearest 10° and magnetic, as the ASOS gives ATIS; altitudes as
// "thousand"/"hundred"; altimeter digits).
import { describe, it, expect } from 'vitest';
import { buildAtis, spokenDigits, spokenHeight, atisLetter, ATIS_MAG_VAR_DEG } from '../../src/atis.js';
import { MAG_VAR_DEG } from '../../src/magvar.js';
import { parseMetar, scenarioWeather } from '../../src/weather.js';
import { runwayEnd } from '../../src/airports.js';

const metar = (rawOb, extra = {}) => parseMetar({
  icaoId: 'KDFW', obsTime: 1792183980, rawOb, temp: 18, dewp: 3, wdir: 350, wspd: 23, wgst: 32, visib: '10+',
  altim: 1029.9, clouds: [{ cover: 'FEW', base: 5000 }, { cover: 'BKN', base: 25000 }], fltCat: 'VFR', ...extra,
});
const DFW = metar('METAR KDFW 162053Z 35023G32KT 10SM FEW050 BKN250 18/03 A3041');
const END = runwayEnd('KDFW', '35C');

describe('ATIS numbers (7110.65 para 2-4-17)', () => {
  it('states digits separately, nine as niner', () => {
    expect(spokenDigits('3041')).toBe('three zero four one');
    expect(spokenDigits('1953')).toBe('one niner five three');
    expect(spokenDigits(29)).toBe('two niner');
  });
  it('states heights by thousands and hundreds', () => {
    expect(spokenHeight(5000)).toBe('five thousand');
    expect(spokenHeight(4500)).toBe('four thousand five hundred');
    expect(spokenHeight(800)).toBe('eight hundred');
    expect(spokenHeight(25000)).toBe('two five thousand');
    expect(spokenHeight(17900)).toBe('one seven thousand niner hundred');
  });
});

describe('buildAtis (ticket 0030)', () => {
  const a = buildAtis(DFW, END, { nowMs: 0 });

  it('carries every item 2-9-3 lists, in order, the letter at both ends', () => {
    const order = ['Dallas-Fort Worth information', 'two zero five three zulu', 'wind three five zero at two three gusts three two',
      'visibility one zero', 'few clouds at five thousand', 'ceiling two five thousand broken', 'temperature one eight',
      'dew point three', 'altimeter three zero four one', 'landing runway three five center',
      `advise on initial contact you have information ${a.letterWord}`];
    let at = -1;
    for (const w of order) {
      const i = a.speech.toLowerCase().indexOf(w.toLowerCase());
      expect(i, w).toBeGreaterThan(at);
      at = i;
    }
    expect(a.speech.startsWith(`Dallas-Fort Worth information ${a.letterWord}.`)).toBe(true);
  });

  it('writes the same briefing in figures for the panel', () => {
    expect(a.text).toContain(`DFW information ${a.letterWord.toUpperCase()}`);
    expect(a.text).toContain('2053Z');
    expect(a.text).toContain('Wind 350 at 23 gusts 32');
    expect(a.text).toContain('Visibility 10');
    expect(a.text).toContain('Few 5,000, ceiling 25,000 broken');
    expect(a.text).toContain('Temperature 18, dew point 3');
    expect(a.text).toContain('Altimeter 30.41');
    expect(a.text).toContain('Landing runway 35C');
  });

  it('uses magvar.js\'s variation (inlined to keep it out of boot)', () => expect(ATIS_MAG_VAR_DEG).toBe(MAG_VAR_DEG));
  it('gives the wind magnetic, to the nearest 10° (METAR 004° true is 360 magnetic over DFW)', () => {
    const w = buildAtis(metar('METAR KDFW 162053Z 00412KT 10SM CLR 18/03 A3041', { wdir: 4, wspd: 12, wgst: null }), END, { nowMs: 0 });
    expect(w.text).toContain('Wind 360 at 12');
    expect(w.speech).toContain('wind three six zero at one two');
    // 357° true is 354.3° magnetic: 350.
    const v = buildAtis(metar('METAR KDFW 162053Z 35712KT 10SM CLR 18/03 A3041', { wdir: 357, wspd: 12, wgst: null }), END, { nowMs: 0 });
    expect(v.text).toContain('Wind 350 at 12');
  });

  it('says calm and variable winds, clear skies and negative temperatures', () => {
    const c = buildAtis(metar('METAR KDFW 162053Z 00000KT 10SM CLR M02/M05 A2992', { wdir: 0, wspd: 0, wgst: null, temp: -2, dewp: -5, altim: 1013.2 }), END, { nowMs: 0 });
    expect(c.speech).toContain('wind calm');
    expect(c.speech).toContain('clear below one two thousand');
    expect(c.speech).toContain('temperature minus two, dew point minus five');
    expect(c.speech).toContain('altimeter two niner niner two');
    expect(c.text).toContain('Temperature -2, dew point -5');
    const v = buildAtis(metar('METAR KDFW 162053Z VRB03KT 10SM CLR 18/03 A3041', { wdir: 'VRB', wspd: 3, wgst: null }), END, { nowMs: 0 });
    expect(v.speech).toContain('wind variable at three');
  });

  it('reads low visibility, present weather and cumulonimbus (2-9-3: always CB and TCU)', () => {
    const w = buildAtis(metar('METAR KDFW 162053Z 18008KT 1 1/2SM -TSRA BR BKN008CB OVC015 22/21 A2988 RMK AO2',
      { wdir: 180, wspd: 8, wgst: null, visib: '1 1/2', temp: 22, dewp: 21 }), END, { nowMs: 0 });
    expect(w.speech).toContain('visibility one and one half');
    expect(w.speech).toContain('thunderstorm light rain, mist');
    expect(w.speech).toContain('ceiling eight hundred broken, cumulonimbus');
    expect(w.speech).toContain('one thousand five hundred overcast');
    expect(w.text).toContain('Visibility 1 1/2');
    expect(w.text).toContain('Ceiling 800 broken CB, 1,500 overcast');
  });

  it('names the departure runway on a takeoff and the field the runway is at', () => {
    const t = buildAtis(metar('METAR KADS 162053Z 16008KT 10SM SKC 18/03 A3041', { icaoId: 'KADS', wdir: 160, wspd: 8, wgst: null }), runwayEnd('KADS', '16'), { nowMs: 0, departing: true });
    expect(t.speech.startsWith('Addison information')).toBe(true);
    expect(t.speech).toContain('departing runway one six');
    expect(t.text).toContain('Departing runway 16');
  });

  it('says whose METAR it is when the field has none of its own', () => {
    const t = buildAtis(DFW, runwayEnd('KADS', '16'), { nowMs: 0 });
    expect(t.source).toMatch(/KDFW METAR/);
    expect(t.speech).toContain('Dallas-Fort Worth weather');
  });

  it('is labelled honestly: live METAR (never the real broadcast), or scenario', () => {
    expect(a.live).toBe(true);
    expect(a.source).toMatch(/^ATIS-style · live KDFW METAR 2053Z/);
    expect(a.source).toMatch(/not the real broadcast/);
    const s = buildAtis(scenarioWeather(), END, { nowMs: Date.UTC(2026, 10, 6, 10, 20) });
    expect(s.live).toBe(false);
    expect(s.source).toMatch(/^SCENARIO weather/);
    expect(s.source).not.toMatch(/live/i);
    expect(s.text).toContain('Altimeter 30.00');
    expect(s.text).toContain('Wind 350 at 10');
  });

  it('keeps one letter per hour of the observation, sequential and wrapping Alfa..Zulu', () => {
    const h = 1792180800; // a whole UTC hour
    expect(atisLetter(h)).toBe(atisLetter(h + 3599));
    const i = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(atisLetter(h));
    expect(atisLetter(h + 3600)).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ'[(i + 1) % 26]);
    expect(buildAtis(DFW, END, { nowMs: 0 }).letter).toBe(atisLetter(DFW.obsTime));
    expect(buildAtis(DFW, END, { nowMs: 9e12 }).letter).toBe(a.letter); // the observation's hour, not the clock's
  });

  it('copes with no runway and a sparse report', () => {
    const t = buildAtis({ icao: 'KDFW', raw: '', windDirDeg: null, windKts: 0, gustKts: 0, visibilitySm: 10, altimInHg: 29.92, tempC: undefined, live: true, obsTime: null }, null, { nowMs: 0 });
    expect(t.speech).toContain('wind calm');
    expect(t.speech).toContain('altimeter two niner niner two');
    expect(t.speech).not.toMatch(/undefined|NaN|null/);
    expect(t.text).not.toMatch(/undefined|NaN|null/);
  });
});

// Validation panel (physics/aviation reviewer): 2-9-3's remarks, M/P visibility, +FC, CLR and VV.
describe('buildAtis, the panel\'s cases (ticket 0030)', () => {
  const END = runwayEnd('KDFW', '35C');
  const said = (rawOb, extra = {}) => buildAtis(parseMetar({ icaoId: 'KDFW', obsTime: 1792183980, rawOb, temp: 20, dewp: 10, wdir: 180, wspd: 5, visib: '10+', altim: 1013.2, clouds: [], ...extra }), END, { nowMs: 0 });
  it('says the remarks\' lightning, cumulonimbus and towering cumulus (2-9-3: always)', () => {
    const a = said('METAR KDFW 061853Z 22012G22KT 5SM VCTS +TSRA SCT030CB BKN050TCU 28/22 A2975 RMK AO2 LTG DSNT W CB DSNT NW MOV E SLP071');
    expect(a.speech).toContain('lightning distant west, cumulonimbus distant northwest moving east');
    expect(a.speech.indexOf('lightning')).toBeLessThan(a.speech.indexOf('temperature'));
    expect(said('METAR KDFW 061853Z 22012KT 10SM SCT040 28/22 A2975 RMK AO2 TCU DSNT S-SW').speech).toContain('towering cumulus distant south through southwest');
    expect(said('METAR KDFW 061853Z 22012KT 10SM SCT040 28/22 A2975 RMK AO2 SLP071 T02780222').speech).not.toMatch(/lightning|cumulus/);
  });
  it('reads the report\'s visibility, less than and more than, and never says NaN', () => {
    const m = said('SPECI KDFW 061853Z AUTO 18005KT M1/4SM FZFG VV001 M01/M01 A2992', { visib: 'M1/4' });
    expect(m.speech).toContain('visibility less than one quarter');
    expect(m.speech).toContain('indefinite ceiling one hundred');
    expect(m.text).not.toMatch(/NaN/);
    expect(said('METAR KDFW 061853Z 18005KT 1 1/2SM BR OVC008 20/19 A2992', { visib: NaN }).speech).toContain('visibility one and one half');
    expect(said('METAR KDFW 061853Z 18005KT P6SM SKC 20/10 A2992').speech).toContain('visibility more than six');
  });
  it('+FC is a tornado or waterspout; CLR is clear below 12,000', () => {
    expect(said('METAR KDFW 061853Z 18005KT 2SM +FC OVC010 20/19 A2992').speech).toContain('tornado or waterspout');
    expect(said('METAR KDFW 061853Z 18005KT 10SM CLR 20/10 A2992').speech).toContain('clear below one two thousand');
  });
});

describe('buildAtis, a tailwind runway (first-timer panel, ticket 0030)', () => {
  it('a real ATIS never puts a tailwind runway in use: the mission\'s runway is "your runway", with the tailwind', () => {
    const south = parseMetar({ icaoId: 'KDFW', obsTime: 1792183980, rawOb: 'METAR KDFW 162053Z 17015KT 10SM SKC 20/10 A2992', wdir: 170, wspd: 15, visib: '10+', altim: 1013.2, clouds: [] });
    const a = buildAtis(south, runwayEnd('KDFW', '35C'), { nowMs: 0 });
    expect(a.text).toMatch(/Your runway 35C, tailwind 1[45]/);
    expect(a.speech).toMatch(/your runway three five center, tailwind one (four|five)/);
    expect(a.text).not.toContain('Landing runway');
    expect(buildAtis(south, runwayEnd('KDFW', '17C'), { nowMs: 0 }).text).toContain('Landing runway 17C');
  });
});
