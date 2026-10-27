// The one thing to fix next time (ticket 0061): a sentence under the grade on the results
// card, naming a number the card showed. Pure; part of the lazy results chunk (results.js),
// so it costs the boot budget nothing. Reads gradeLanding's own factor values and reasons
// (src/landing.js); tests/unit/landingTip.test.js feeds it real gradeLanding outputs, so a
// change to that wording fails there first.

// Ties go to the first in this order (the grade's own factor order).
const ORDER = ['rate', 'centreline', 'zone', 'flare', 'speed'];
const num = (s, i = 0) => Number((String(s).match(/-?\d+(\.\d+)?/g) || [])[i]);

const TIPS = {
  rate: (f) => `Touched down at ${f.value}: flare a little earlier, raising the nose gently (under 240 fpm is smooth).`,
  centreline: (f) => `${f.value} of the centreline: line up early and keep the centre stripes under the nose.`,
  zone: (f) => (num(f.value) < 150
    ? `Touched down only ${f.value}: aim a little further in, at the big white bars.`
    : `Touched down ${f.value}: aim at the big white bars and let it settle, don't float.`),
  flare: (f) => {
    const pitch = num(f.value), bank = num(f.value, 1);
    if (pitch < 0) return `Nose down at touchdown (${pitch.toFixed(1)}°): raise it a little so the main wheels land first.`;
    if (pitch < 1) return `Flat touchdown (${pitch.toFixed(1)}° nose up): raise the nose a little more in the flare.`;
    if (pitch > 7) return `${pitch.toFixed(1)}° nose up is a lot: flare a little less, or the tail can hit.`;
    return `${bank.toFixed(1)}° of bank at touchdown: level the wings before the wheels touch.`;
  },
  speed: (f) => {
    const ias = num(f.value), vref = num(f.value, 1);
    return ias > vref ? `${ias} kt at touchdown, Vref ${vref}: slow to Vref on short final, power to idle over the runway.`
      : `${ias} kt, slower than Vref ${vref}: keep a little power on until the flare.`;
  },
};

export function landingTip(result) {
  // Drills with their own cards and a greaser get none.
  if (result.kind || result.grade === 'S') return null;
  const by = (key) => result.factors.find((f) => f.key === key);
  const reason = result.reason || '';
  if (result.grade === 'CRASH') {
    if (/after the bounce/.test(reason)) return 'After a bounce, hold the nose up and add a little power, or go around.';
    if (/^Gear not down/.test(reason)) return 'The gear was up: put it down (G, or GEAR) on final and check it reads DN.';
    if (/^Hard landing/.test(reason)) return `${by('rate').value} is too hard: start the flare earlier and keep the sink under 600 fpm.`;
    if (/^Wingtip strike/.test(reason)) return `${num(by('flare').value, 1).toFixed(1)}° of bank at touchdown: keep the wings level in the flare.`;
  }
  if (result.madeRunway === false) return null; // the dead-stick miss: its reason is the advice
  if (/short of the runway/.test(reason)) return 'Touched down short: keep two white, two red on the PAPI down to the runway.';
  if (/off the runway/.test(reason)) return by('centreline').score <= 40 ? TIPS.centreline(by('centreline')) : TIPS.zone(by('zone'));
  if (result.bounces) return `You bounced off a ${by('rate').value} touchdown: hold the nose up and let it settle.`;
  let worst = null;
  for (const key of ORDER) {
    const f = by(key);
    if (f && (!worst || f.score < worst.score)) worst = f;
  }
  return worst ? TIPS[worst.key](worst) : null;
}
