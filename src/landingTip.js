// The one thing to fix next time (ticket 0061): a sentence under the grade on the results
// card, naming a number the card showed. Pure; part of the lazy results chunk (results.js),
// so it costs the boot budget nothing. Reads gradeLanding's own factor values and reasons
// (src/landing.js); tests/unit/landingTip.test.js feeds it real gradeLanding outputs, so a
// change to that wording fails there first.
// ctx: { kid (the Kid assist flies power, flare and line-up), noEngine (dead-stick) }.

// Ties go to the first in this order (the grade's own factor order).
const ORDER = ['rate', 'centreline', 'zone', 'flare', 'speed'];
const num = (s, i = 0) => Number((String(s).match(/-?\d+(\.\d+)?/g) || [])[i]);
const SMOOTH_FPM = 240; // where the grade's touchdown-rate bar starts to drop

const TIPS = {
  rate: (f) => (num(f.value) <= SMOOTH_FPM
    ? `Touched down at ${f.value}: nearly there, hold the flare a moment longer.`
    : `Touched down at ${f.value}: flare a little earlier, easing the nose up (under ${SMOOTH_FPM} is smooth).`),
  centreline: (f) => `${f.value} of the centreline: line up early and keep the centre stripes under the nose.`,
  zone: (f) => (num(f.value) < 150
    ? `Touched down only ${f.value}: aim further in, at the two wide white stripes.`
    : `Touched down ${f.value}: aim at the two wide white stripes and don't float.`),
  flare: (f) => {
    const pitch = num(f.value), bank = num(f.value, 1);
    if (pitch < 0) return `Nose down at touchdown (${pitch.toFixed(1)}°): raise it a little so the main wheels land first.`;
    if (pitch < 1) return `Flat touchdown (${pitch.toFixed(1)}° nose up): raise the nose a little more in the flare.`;
    if (pitch > 7) return `${pitch.toFixed(1)}° nose up at touchdown: ease the nose up a little less in the flare.`;
    return bankTip(bank);
  },
  speed: (f, ctx) => {
    const ias = num(f.value), vref = num(f.value, 1), d = Math.round(Math.abs(ias - vref));
    if (ias < vref) return `${ias} kt, ${d} kt under the approach speed (${vref}): fly ${vref} kt down to the flare.`;
    return `${ias} kt, ${d} kt over the approach speed (${vref}): slow down sooner${ctx.noEngine ? '' : ', power to idle over the runway'}.`;
  },
};
// Gentle bank is how a crosswind is landed (one wheel first): only the excess is the fault.
const bankTip = (bank) => `${Math.abs(bank).toFixed(1)}° of bank at touchdown: use only enough bank to hold the centreline.`;
// The worst-scoring of keys (ties in ORDER); null when nothing lost points.
function worstOf(result, keys) {
  let worst = null;
  for (const f of result.factors) {
    if (keys.includes(f.key) && f.score < 100 && (!worst || f.score < worst.score)) worst = f;
  }
  return worst;
}

export function landingTip(result, ctx = {}) {
  // Drills with their own cards and a greaser get none.
  if (result.kind || result.grade === 'S') return null;
  const by = (key) => result.factors.find((f) => f.key === key);
  const reason = result.reason || '';
  const settle = ctx.noEngine ? 'hold the landing attitude and let it settle' : 'hold the landing attitude, add a little power or go around';
  if (result.grade === 'CRASH') {
    if (/after the bounce/.test(reason)) return `After a bounce, ${settle}.`;
    if (/^Gear not down/.test(reason)) return 'The gear was up: put it down (G, or GEAR) on final and check it reads DN.';
    if (/^Hard landing/.test(reason) && by('rate')) return `${by('rate').value} is too hard: start the flare earlier (under ${SMOOTH_FPM} fpm is smooth).`;
    if (/^Wingtip strike/.test(reason) && by('flare')) return bankTip(num(by('flare').value, 1));
    return null;
  }
  if (result.madeRunway === false) return null; // the dead-stick miss: its reason is the advice
  if (/^Should have gone around/.test(reason)) return 'When the gate calls go around: full power, climb away, and try again.';
  // Kid flies the power, the flare and the line-up: the one thing left is letting it.
  if (ctx.kid) return 'Let go of the stick on short final: Kid level lines up and flares for you.';
  if (/short of the runway/.test(reason)) return 'Touched down short: keep two white, two red on the PAPI lights down to the runway.';
  if (/off the runway/.test(reason)) return by('centreline').score <= 40 ? TIPS.centreline(by('centreline')) : TIPS.zone(by('zone'));
  if (result.bounces) {
    // Name what made it bounce, not what to do in the air (the coach said that).
    const f = worstOf(result, ['rate', 'speed', 'flare']);
    if (!f) return `You bounced: ${settle}.`;
    return `You bounced. ${TIPS[f.key](f, ctx)}`;
  }
  const f = worstOf(result, ORDER);
  return f ? TIPS[f.key](f, ctx) : null;
}
