// ATIS-style briefing (ticket 0030; a lazy chunk, loaded on Start flight). buildAtis is pure, tested in
// tests/unit/atis.test.js: the METAR the game flies (weather.js parseMetar's object, its raw report for
// the time, weather, sky, temperature/dew point and altimeter groups) and the runway in use, said the way
// FAA Order JO 7110.65 says an ATIS is: para 2-9-3's items in its order (field, letter, observation time,
// wind, visibility, weather, sky, temperature, dew point, altimeter, runway in use) with the letter at
// both ends (2-9-1), numbers per para 2-4-17 (separate digits, "niner"; the wind to the nearest 10° in
// knots with any gusts; heights as thousands and hundreds; the altimeter's four digits). ATIS winds are
// magnetic (2-9-3's note: the ASOS's MAG WND), the METAR's true: magvar.js's variation. The letter follows the
// observation's UTC hour, so it is stable and steps Alfa..Zulu and round again. Never the real broadcast:
// the panel says so, and "SCENARIO" when the weather is weather.js's offline fallback.
// showAtis puts it in #atis (index.html) and speaks it through audio.js (the sound checkbox, no voice
// without speechSynthesis); #btnAtis in the weather ribbon opens it again.
// magvar.js's MAG_VAR_DEG, inlined: importing magvar.js from a lazy chunk splits it out of the boot chunk
// (+110 B at boot, AGENTS.md § 5). tests/unit/atis.test.js holds the two equal.
export const ATIS_MAG_VAR_DEG = 2.7;
const trueToMag = (deg) => ((deg - ATIS_MAG_VAR_DEG) % 360 + 360) % 360;

const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'];
const LETTERS = ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliett', 'Kilo', 'Lima',
  'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'X-ray', 'Yankee', 'Zulu'];
const FIELD = {
  KDFW: 'Dallas-Fort Worth', KDAL: 'Dallas Love Field', KADS: 'Addison',
  KAFW: 'Fort Worth Alliance', KFTW: 'Fort Worth Meacham', KGKY: 'Arlington',
};
const SIDE = { L: 'left', C: 'center', R: 'right' };
const COVER = { FEW: 'few', SCT: 'scattered', BKN: 'broken', OVC: 'overcast' };
const CLOUD = { CB: ['CB', 'cumulonimbus'], TCU: ['TCU', 'towering cumulus'] };
const DESC = { MI: 'shallow', PR: 'partial', BC: 'patches of', DR: 'low drifting', BL: 'blowing', FZ: 'freezing' };
const PHEN = {
  DZ: 'drizzle', RA: 'rain', SN: 'snow', SG: 'snow grains', IC: 'ice crystals', PL: 'ice pellets', GR: 'hail', GS: 'small hail',
  UP: 'unknown precipitation', BR: 'mist', FG: 'fog', FU: 'smoke', VA: 'volcanic ash', DU: 'dust', SA: 'sand', HZ: 'haze',
  PY: 'spray', PO: 'dust whirls', SQ: 'squalls', FC: 'funnel cloud', SS: 'sandstorm', DS: 'duststorm',
};
const WX = /^([+-]|VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?((?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)*)$/;

// "3041" → "three zero four one"; a number's digits the same way.
export const spokenDigits = (n) => [...String(n)].map((d) => DIGITS[d] ?? d).join(' ');
const signed = (n) => (n < 0 ? `minus ${spokenDigits(-n)}` : spokenDigits(n));
const comma = (n) => n.toLocaleString('en-US');

// 4,500 → "four thousand five hundred"; 25,000 → "two five thousand" (2-4-17 altitudes).
export function spokenHeight(ft) {
  const th = Math.floor(ft / 1000), h = Math.round((ft % 1000) / 100);
  return [th && `${spokenDigits(th)} thousand`, h && `${DIGITS[h]} hundred`].filter(Boolean).join(' ') || 'zero';
}

// One letter per UTC hour of the observation (seconds since the epoch).
export const atisLetter = (s) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[((Math.floor(s / 3600) % 26) + 26) % 26];

// Statute miles: 1.5 → ["1 1/2", "one and one half"], 10 → ["10", "one zero"].
function visibility(sm) {
  let whole = Math.floor(sm), n = Math.round((sm - whole) * 16), d = 16;
  if (n === 16) { whole++; n = 0; }
  while (n && n % 2 === 0) { n /= 2; d /= 2; }
  const den = { 2: 'half', 4: 'quarter', 8: 'eighth', 16: 'sixteenth' }[d];
  const frac = n ? [`${n}/${d}`, `${DIGITS[n] ?? spokenDigits(n)} ${den}${n > 1 ? 's' : ''}`] : null;
  if (!frac) return [String(whole), spokenDigits(whole)];
  return whole ? [`${whole} ${frac[0]}`, `${spokenDigits(whole)} and ${frac[1]}`] : frac;
}

// Present weather groups, "-TSRA" → "thunderstorm light rain".
function weatherWords(g) {
  const m = WX.exec(g);
  if (!m || !(m[2] || m[3])) return null;
  const [, pre, desc, phen] = m;
  if (g === '+FC') return 'tornado or waterspout'; // +FC is a tornado or waterspout, not a heavy funnel cloud
  const words = [desc === 'TS' && 'thunderstorm', pre === '-' && 'light', pre === '+' && 'heavy', DESC[desc],
    phen.match(/../g)?.map((p) => PHEN[p]).join(' '), desc === 'SH' && 'showers', pre === 'VC' && 'in the vicinity'];
  return words.filter(Boolean).join(' ');
}

const RMK_WORDS = {
  DSNT: 'distant', VC: 'in the vicinity', OHD: 'overhead', ALQDS: 'all quadrants', MOV: 'moving', AND: 'and',
  N: 'north', NE: 'northeast', E: 'east', SE: 'southeast', S: 'south', SW: 'southwest', W: 'west', NW: 'northwest',
};
const RMK_HEAD = /^(?:(?:OCNL|FRQ|CONS)?LTG(?:IC|CG|CC|CA)*|CB|TCU)$/;
export function remarkWords(raw) {
  const r = String(raw ?? '').split(/ RMK /)[1];
  if (!r) return [];
  const out = [];
  let cur = null;
  for (const g of r.split(/\s+/)) {
    if (RMK_HEAD.test(g)) { cur = [g.includes('LTG') ? 'lightning' : CLOUD[g][1]]; out.push(cur); continue; }
    const words = cur && g.split('-').map((p) => RMK_WORDS[p]);
    if (words && words.every(Boolean)) cur.push(words.join(' through ')); else cur = null;
  }
  return out.map((w) => w.join(' '));
}

export function buildAtis(wx, end, { nowMs = Date.now(), departing = false } = {}) {
  const raw = String(wx.raw ?? '');
  const groups = raw.split(/ (?:RMK|TEMPO|BECMG|NOSIG)\b/)[0].split(/\s+/);
  const field = end?.airport ?? wx.icao;
  const short = String(field).replace(/^K/, '');
  const letterWord = LETTERS['ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(atisLetter(wx.obsTime ?? nowMs / 1000))];
  const say = [`${FIELD[field] ?? short} information ${letterWord}`];
  const text = [`${short} information ${letterWord.toUpperCase()}`];

  // The observation time: the report's DDHHMMZ group, else its obsTime.
  const tg = groups.map((g) => /^\d{2}(\d{4})Z$/.exec(g)).find(Boolean);
  const hhmm = tg ? tg[1] : wx.obsTime ? new Date(wx.obsTime * 1000).toISOString().slice(11, 16).replace(':', '') : '';
  const other = wx.icao && wx.icao !== field;
  if (other || hhmm) {
    say.push([other && `${FIELD[wx.icao] ?? wx.icao} weather`, hhmm && `${spokenDigits(hhmm)} zulu`].filter(Boolean).join(', '));
    text.push([other && `Weather ${wx.icao}`, hhmm && `${hhmm}Z`].filter(Boolean).join(' '));
  }

  // Wind, magnetic to the nearest 10°.
  const kts = Math.round(wx.windKts || 0);
  if (!kts) { say.push('wind calm'); text.push('Wind calm'); } else {
    const dir = wx.windDirDeg == null ? null : Math.round(trueToMag(wx.windDirDeg) / 10) * 10 || 360;
    const gust = wx.gustKts > kts ? Math.round(wx.gustKts) : 0;
    const d = dir === null ? ['variable', 'variable'] : [String(dir).padStart(3, '0'), spokenDigits(String(dir).padStart(3, '0'))];
    say.push(`wind ${d[1]} at ${spokenDigits(kts)}${gust ? ` gusts ${spokenDigits(gust)}` : ''}`);
    text.push(`Wind ${d[0]} at ${kts}${gust ? ` gusts ${gust}` : ''}`);
  }

  // The report's SM group (M1/4SM: less than a quarter; P6SM: more than six), else the parsed miles.
  const vi = groups.findIndex((g) => /^[MP]?\d+(?:\/\d+)?SM$/.test(g));
  const vg = vi < 0 ? null : `${vi > 0 && /^\d+$/.test(groups[vi - 1]) ? `${groups[vi - 1]} ` : ''}${groups[vi]}`;
  const vq = vg ? { M: ['less than ', 'Less than '], P: ['more than ', 'More than '] }[vg.replace(/^\d+ /, '')[0]] : null;
  const sm = vg ? vg.replace(/[MP]|SM/g, '').split(' ').reduce((a, p) => a + (p.includes('/') ? p.split('/')[0] / p.split('/')[1] : Number(p)), 0) : Number(wx.visibilitySm);
  const vis = visibility(Number.isFinite(sm) ? Math.max(0, sm) : 10);
  say.push(`visibility ${vq ? vq[0] : ''}${vis[1]}`);
  text.push(`Visibility ${vq ? vq[0] : ''}${vis[0]}`);

  const wxWords = groups.slice(tg ? groups.indexOf(tg.input) + 1 : 0).map(weatherWords).filter(Boolean);
  if (wxWords.length) {
    say.push(wxWords.join(', '));
    text.push(wxWords.join(', ').replace(/^./, (c) => c.toUpperCase()));
  }

  // Sky: the report's layers, lowest first; the first broken/overcast (or vertical visibility) is the ceiling.
  const sky = groups.map((g) => /^(FEW|SCT|BKN|OVC|VV)(\d{3})(CB|TCU)?$/.exec(g)).filter(Boolean);
  let ceiling = false;
  const skySay = [], skyText = [];
  for (const [, cover, base, cloud] of sky) {
    const ft = Number(base) * 100;
    let s, t;
    if (cover === 'VV') { s = `indefinite ceiling ${spokenHeight(ft)}`; t = `indefinite ceiling ${comma(ft)}`; ceiling = true; }
    else if (cover === 'FEW') { s = `few clouds at ${spokenHeight(ft)}`; t = `few ${comma(ft)}`; }
    else if (cover === 'SCT') { s = `${spokenHeight(ft)} scattered`; t = `${comma(ft)} scattered`; }
    else {
      const c = ceiling ? '' : 'ceiling ';
      ceiling = true;
      s = `${c}${spokenHeight(ft)} ${COVER[cover]}`;
      t = `${c}${comma(ft)} ${COVER[cover]}`;
    }
    if (cloud) { s += `, ${CLOUD[cloud][1]}`; t += ` ${CLOUD[cloud][0]}`; }
    skySay.push(s);
    skyText.push(t);
  }
  // CLR is an automated station's "no clouds below 12,000 ft", not a clear sky.
  if (!sky.length && groups.includes('CLR')) { skySay.push('clear below one two thousand'); skyText.push('clear below 12,000'); }
  else if (!sky.length && groups.some((g) => /^(SKC|NSC|NCD)$/.test(g))) { skySay.push('sky clear'); skyText.push('sky clear'); }
  if (skySay.length) {
    say.push(skySay.join(', '));
    text.push(skyText.join(', ').replace(/^./, (c) => c.toUpperCase()));
  }

  // 2-9-3: always the remarks' lightning, cumulonimbus and towering cumulus ("LTG DSNT W", "CB DSNT NW MOV E").
  const rmk = remarkWords(raw);
  if (rmk.length) {
    say.push(rmk.join(', '));
    text.push(rmk.join(', ').replace(/^./, (c) => c.toUpperCase()));
  }

  // Temperature / dew point: the report's group (M = minus), else the parsed temperature.
  const tt = groups.map((g) => /^(M?\d{2})\/(M?\d{2})?$/.exec(g)).find(Boolean);
  const deg = (s) => Number(s.replace('M', '-'));
  const temp = tt ? deg(tt[1]) : typeof wx.tempC === 'number' ? Math.round(wx.tempC) : null;
  const dew = tt?.[2] ? deg(tt[2]) : null;
  if (temp !== null) {
    say.push(`temperature ${signed(temp)}${dew !== null ? `, dew point ${signed(dew)}` : ''}`);
    text.push(`Temperature ${temp}${dew !== null ? `, dew point ${dew}` : ''}`);
  }

  // Altimeter: the report's A group, else the parsed setting.
  const ag = groups.map((g) => /^A(\d{4})$/.exec(g)).find(Boolean);
  const alt = ag ? ag[1] : String(Math.round((wx.altimInHg || 29.92) * 100)).padStart(4, '0');
  say.push(`altimeter ${spokenDigits(alt)}`);
  text.push(`Altimeter ${alt.slice(0, 2)}.${alt.slice(2)}`);

  if (end) {
    const [, num, side] = /^(\d+)([LCR]?)$/.exec(end.ident) ?? [, end.ident, ''];
    const rwy = `runway ${spokenDigits(num)}${side ? ` ${SIDE[side]}` : ''}`;
    // A real ATIS never puts a tailwind runway in use; the mission's runway is fixed, so say it is yours, and the tailwind.
    const tw = kts && wx.windDirDeg != null ? Math.round(-kts * Math.cos((wx.windDirDeg - end.hdgT) * Math.PI / 180)) : 0;
    if (tw > 2) {
      say.push(`your ${rwy}, tailwind ${spokenDigits(tw)}`);
      text.push(`Your runway ${end.ident}, tailwind ${tw}`);
    } else {
      say.push(`${departing ? 'departing' : 'landing'} ${rwy}`);
      text.push(`${departing ? 'Departing' : 'Landing'} runway ${end.ident}`);
    }
  }
  say.push(`advise on initial contact you have information ${letterWord}`);
  text.push(`Advise you have ${letterWord.toUpperCase()}`);

  const live = !!wx.live;
  const source = live
    ? `ATIS-style · live ${wx.icao} METAR${hhmm ? ` ${hhmm}Z` : ''} · not the real broadcast`
    : 'SCENARIO weather (offline) · not the real broadcast';
  return {
    letter: atisLetter(wx.obsTime ?? nowMs / 1000), letterWord, live, source,
    speech: `${say.join('. ')}.`,
    text: text.join('\n'), lines: text,
  };
}

// The panel. Pilot sees it after Start flight (not Kid or Learner: ATIS words are for pilots; not on a phone held
// sideways, where it would sit over the Menu and the top bar); every level opens it from #btnAtis in the weather
// ribbon. It is spoken only when asked for (the ATIS button), and only when no coach is talking: on the ground
// without a coached takeoff or drill, or above 1,000 ft (the landing coach, the gate and the tutor speak lower).
// The chunk owns its utterance (audio.js's voice, at speaking pace), so closing the panel or Sound OFF stops it
// alone, never a callout; the panel stays up while it speaks and for HOLD_MS. It sits under the header and under
// the coach card when that card is in its top slot (hudLayout.js coachOverHud), and follows new weather while up.
export const HOLD_MS = 12000;
const SHORT_SIDEWAYS = '(orientation: landscape) and (max-height: 500px)';
let timer = 0, poll = 0, bound = false, utter = null, shownWx = null;
export function showAtis(sim, audio, asked = false) {
  const el = document.getElementById('atis');
  if (!el) return;
  const hide = () => { el.classList.add('hidden'); clearTimeout(timer); clearInterval(poll); };
  const hush = () => {
    try { if (utter && window.speechSynthesis?.speaking) window.speechSynthesis.cancel(); } catch { /* best-effort */ }
    utter = null;
  };
  if (!bound) {
    bound = true;
    el.addEventListener('click', () => { hush(); hide(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (utter || !el.classList.contains('hidden'))) { hush(); hide(); } });
    // Sound OFF (audio.js mute leaves speech alone): stop the briefing's voice.
    document.getElementById('btnAudio')?.addEventListener('click', () => { if (!sim.audioEnabled) hush(); });
    const btn = document.getElementById('btnAtis');
    btn?.classList.remove('hidden');
    btn?.addEventListener('click', () => {
      // The ribbon is in the phone's ☰ Menu sheet: fold it (main.js setHudMenu, through its button) to show the panel.
      if (document.getElementById('hudMenu')?.classList.contains('open')) document.getElementById('btnMenu')?.click();
      showAtis(sim, audio, true);
    });
  }
  if (!asked && (sim.assist !== 'pilot' || window.matchMedia?.(SHORT_SIDEWAYS).matches)) return null;
  const render = () => {
    shownWx = sim.wx;
    const a = buildAtis(sim.wx, sim.activeEnd, { departing: sim.loadedMission?.kind === 'takeoff' && sim.onGround });
    el.querySelector('[data-atis-src]').textContent = a.source;
    el.toggleAttribute('data-live', a.live);
    el.querySelector('[data-atis-text]').textContent = a.lines.join(' · ');
    return a;
  };
  const a = render();
  el.style.top = '';
  el.classList.remove('hidden');
  if (!window.matchMedia?.(SHORT_SIDEWAYS).matches) {
    const below = (id) => { const r = document.getElementById(id)?.getBoundingClientRect(); return r && r.height ? r.bottom : 0; };
    const coach = document.getElementById('coach');
    const coachTop = coach?.classList.contains('coach-top') && !coach.classList.contains('hidden') ? below('coach') : 0;
    el.style.top = `${Math.max(below('phoneHeader'), coachTop) + 6}px`;
  }
  clearTimeout(timer);
  clearInterval(poll);
  timer = setTimeout(function wait() { if (utter) timer = setTimeout(wait, 1000); else hide(); }, HOLD_MS);
  poll = setInterval(() => { if (sim.wx !== shownWx) render(); }, 1000); // a live METAR that lands after Start flight
  const quiet = sim.onGround ? !(sim.toCoach || sim.rto || sim.engineOut) : sim.aglFt > 1000;
  const synth = window.speechSynthesis;
  hush();
  if (asked && quiet && audio?.started && sim.audioEnabled && !sim.paused && synth && typeof SpeechSynthesisUtterance !== 'undefined') {
    try {
      const u = new SpeechSynthesisUtterance(a.speech);
      u.rate = 1.1;
      u.pitch = 0.75;
      u.volume = 0.9;
      u.onend = u.onerror = () => { if (utter === u) utter = null; };
      utter = u;
      synth.speak(u);
    } catch { utter = null; }
  }
  return a;
}
