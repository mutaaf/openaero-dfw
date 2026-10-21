import { describe, it, expect } from 'vitest';
import {
  COACH_KEY, COACH_PROMPTS, coachTarget, createCoach, stepCoach, rolloutTarget, coachText,
  coachSeen, markCoachSeen, COACH_MIN_HOLD_S, COACH_DONE_HOLD_S,
} from '../../src/coach.js';

// On a stabilized 3° final: 2 white, ~-700 fpm, approach power.
const onPath = { aglFt: 900, vsiFpm: -700, papiWhite: 2, throttle: 0.44, onGround: false, autopilot: false };

describe('coachTarget', () => {
  it('Kid level: one hands-off prompt, never power, flare or idle', () => {
    expect(coachTarget({ ...onPath, kid: true })).toBe('kid');
    expect(coachTarget({ ...onPath, kid: true, papiWhite: 0, vsiFpm: -1500 })).toBe('kid');
    expect(coachTarget({ ...onPath, kid: true, aglFt: 20, throttle: 0.3 })).toBeNull();
    expect(coachTarget({ ...onPath, kid: true, papiWhite: null })).toBeNull();
  });
  it('on the glidepath it points at the PAPI', () => {
    expect(coachTarget(onPath)).toBe('papi');
  });
  it('3 or 4 white is high: nose down', () => {
    expect(coachTarget({ ...onPath, papiWhite: 3 })).toBe('high');
    expect(coachTarget({ ...onPath, papiWhite: 4 })).toBe('high');
  });
  it('0 or 1 white is low: nose up, add power', () => {
    expect(coachTarget({ ...onPath, papiWhite: 1 })).toBe('low');
    expect(coachTarget({ ...onPath, papiWhite: 0 })).toBe('low');
  });
  it('a sink rate over 1,200 fpm below 1,000 ft beats the PAPI', () => {
    expect(coachTarget({ ...onPath, vsiFpm: -1300, papiWhite: 4 })).toBe('sink');
    expect(coachTarget({ ...onPath, vsiFpm: -1300, aglFt: 1500 })).toBe('papi');
  });
  it('below 50 ft it says flare, and below 30 ft with power on it says idle', () => {
    expect(coachTarget({ ...onPath, aglFt: 45, throttle: 0 })).toBe('flare');
    expect(coachTarget({ ...onPath, aglFt: 45, throttle: 0.44 })).toBe('flare');
    expect(coachTarget({ ...onPath, aglFt: 25, throttle: 0.44 })).toBe('idle');
    expect(coachTarget({ ...onPath, aglFt: 25, throttle: 0.02 })).toBe('flare');
  });
  it('is quiet on the ground, under the autopilot, or with no runway ahead', () => {
    expect(coachTarget({ ...onPath, onGround: true })).toBe(null);
    expect(coachTarget({ ...onPath, autopilot: true })).toBe(null);
    expect(coachTarget({ ...onPath, papiWhite: null })).toBe(null);
  });
  it('every prompt has short text that fits a phone', () => {
    for (const k of Object.keys(COACH_PROMPTS)) {
      expect(COACH_PROMPTS[k]).toBeTruthy();
      expect(COACH_PROMPTS[k].length).toBeLessThanOrEqual(48);
    }
  });
});

describe('stepCoach state machine', () => {
  it('shows the PAPI prompt first', () => {
    const c = stepCoach(createCoach(), onPath, 0.016);
    expect(c.prompt).toBe('papi');
    expect(c.done).toBe(false);
  });
  it('holds a prompt for the minimum time before a same-rank change (no flicker)', () => {
    let c = stepCoach(createCoach(), onPath, 0.1);
    c = stepCoach(c, { ...onPath, papiWhite: 3 }, 0.1);
    expect(c.prompt).toBe('papi');
    c = stepCoach(c, { ...onPath, papiWhite: 3 }, COACH_MIN_HOLD_S);
    expect(c.prompt).toBe('high');
  });
  it('a one-frame PAPI blip after a long time on path changes nothing', () => {
    let c = stepCoach(createCoach(), onPath, 0.1);
    c = stepCoach(c, onPath, 10);
    c = stepCoach(c, { ...onPath, papiWhite: 3 }, 0.016);
    expect(c.prompt).toBe('papi');
    c = stepCoach(c, onPath, 0.016);
    c = stepCoach(c, { ...onPath, papiWhite: 3 }, 0.016);
    expect(c.prompt).toBe('papi');
  });
  it('steps down a rank (idle → flare) only once the throttle has stayed idle', () => {
    let c = stepCoach(createCoach(), { ...onPath, aglFt: 25 }, 0.1);
    expect(c.prompt).toBe('idle');
    c = stepCoach(c, { ...onPath, aglFt: 20, throttle: 0 }, 0.5);
    expect(c.prompt).toBe('idle');
    c = stepCoach(c, { ...onPath, aglFt: 15, throttle: 0 }, COACH_MIN_HOLD_S);
    expect(c.prompt).toBe('flare');
  });
  it('engaging the autopilot clears the prompt at once, and it returns when released', () => {
    let c = stepCoach(createCoach(), onPath, 0.1);
    c = stepCoach(c, { ...onPath, autopilot: true }, 0.016);
    expect(c.prompt).toBe(null);
    c = stepCoach(c, onPath, 0.016);
    expect(c.prompt).toBe('papi');
  });
  it('escalates to flare and idle at once', () => {
    let c = stepCoach(createCoach(), onPath, 0.1);
    c = stepCoach(c, { ...onPath, aglFt: 45 }, 0.016);
    expect(c.prompt).toBe('flare');
    c = stepCoach(c, { ...onPath, aglFt: 25 }, 0.016);
    expect(c.prompt).toBe('idle');
  });
  it('never steps back from flare to a PAPI prompt in the flare', () => {
    let c = stepCoach(createCoach(), { ...onPath, aglFt: 45 }, 0.1);
    c = stepCoach(c, { ...onPath, aglFt: 45, papiWhite: 0 }, COACH_MIN_HOLD_S * 2);
    expect(c.prompt).toBe('flare');
  });
  it('touchdown after flying finishes the coach with a done prompt', () => {
    let c = stepCoach(createCoach(), onPath, 0.1);
    c = stepCoach(c, { ...onPath, aglFt: 0, onGround: true }, 0.016);
    expect(c.done).toBe(true);
    expect(c.prompt).toBe('done');
    // Stays done whatever happens next.
    c = stepCoach(c, onPath, 5);
    expect(c.done).toBe(true);
  });
  it('sitting on the ground before flying is not a touchdown', () => {
    const c = stepCoach(createCoach(), { ...onPath, onGround: true }, 1);
    expect(c.done).toBe(false);
    expect(c.prompt).toBe(null);
  });
  it('allocates nothing per step (mutates and returns the same object)', () => {
    const c0 = createCoach();
    expect(stepCoach(c0, onPath, 0.016)).toBe(c0);
  });
});

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

describe('coach storage', () => {
  it('a first visit has not seen the coach', () => {
    expect(coachSeen(memStorage())).toBe(false);
  });
  it('remembers it was seen, versioned, under openaero_coach_v1', () => {
    const s = memStorage();
    markCoachSeen(s, 1234);
    expect(COACH_KEY).toBe('openaero_coach_v1');
    expect(JSON.parse(s.getItem(COACH_KEY))).toEqual({ v: 1, seen: true, at: 1234 });
    expect(coachSeen(s)).toBe(true);
  });
  it('tolerates junk and storage that throws', () => {
    expect(coachSeen(memStorage({ [COACH_KEY]: '{nope' }))).toBe(false);
    const throwing = { getItem: () => { throw new Error('private'); }, setItem: () => { throw new Error('private'); } };
    expect(coachSeen(throwing)).toBe(false);
    expect(() => markCoachSeen(throwing)).not.toThrow();
  });
});

// Ticket 0073: the landing coach on every final, from configuration to the stop.
const full = { ...onPath, iasKts: 155, targetKts: 155, locDots: 0, gearLocked: true, flapsLanding: true, driftDeg: 0 };

describe('landing coach (0073)', () => {
  it('a stable final is still the PAPI prompt', () => {
    expect(coachTarget(full)).toBe('papi');
  });
  it('gear first, then landing flaps, before anything about the path', () => {
    expect(coachTarget({ ...full, gearLocked: false, flapsLanding: false, papiWhite: 4 })).toBe('gear');
    expect(coachTarget({ ...full, flapsLanding: false, papiWhite: 4 })).toBe('flaps');
    expect(coachTarget({ ...full, gearLocked: false, aglFt: 2500 })).toBe('papi');
  });
  it('slow beats the glidepath; fast waits until the path is right', () => {
    expect(coachTarget({ ...full, iasKts: 145, papiWhite: 4 })).toBe('slow');
    expect(coachTarget({ ...full, iasKts: 170, papiWhite: 4 })).toBe('high');
    expect(coachTarget({ ...full, iasKts: 170 })).toBe('fast');
    expect(coachTarget({ ...full, iasKts: 162 })).toBe('papi');
  });
  it('says which way back to the centreline', () => {
    expect(coachTarget({ ...full, locDots: 1 })).toBe('offRight');
    expect(coachTarget({ ...full, locDots: -1 })).toBe('offLeft');
    expect(coachTarget({ ...full, locDots: 0.4 })).toBe('papi');
  });
  it('in the flare with a crab on, it says to rudder the nose straight', () => {
    expect(coachTarget({ ...full, aglFt: 40, throttle: 0, driftDeg: 7 })).toBe('decrab');
    expect(coachTarget({ ...full, aglFt: 40, throttle: 0, driftDeg: 2 })).toBe('flare');
    expect(coachTarget({ ...full, aglFt: 200, driftDeg: 7 })).toBe('papi'); // crabbing on final is right
  });
  it('the rollout: reverse, brakes, stow at 60 kt, stopped', () => {
    expect(rolloutTarget({ gsKts: 130, canReverse: true, reverserPos: 0, braking: true })).toBe('reverse');
    expect(rolloutTarget({ gsKts: 130, canReverse: false, reverserPos: 0, braking: false })).toBe('brake');
    expect(rolloutTarget({ gsKts: 130, canReverse: false, reverserPos: 0, braking: true })).toBe(null);
    expect(rolloutTarget({ gsKts: 65, canReverse: true, reverserPos: 1, braking: true })).toBe('stow');
    expect(rolloutTarget({ gsKts: 1, canReverse: true, reverserPos: 0, braking: true })).toBe('stopped');
  });
  it('after "Touchdown!" the rollout prompts follow the stop, and "Stopped" is the end', () => {
    const rollout = { gsKts: 130, canReverse: true, reverserPos: 0, braking: false };
    let c = stepCoach(createCoach(), full, 0.1);
    c = stepCoach(c, { ...full, onGround: true, rollout }, 0.016);
    expect(c.prompt).toBe('done');
    c = stepCoach(c, { ...full, onGround: true, rollout }, COACH_DONE_HOLD_S);
    expect(c.prompt).toBe('reverse');
    rollout.reverserPos = 1; rollout.braking = true; rollout.gsKts = 60;
    c = stepCoach(c, { ...full, onGround: true, rollout }, 0.016);
    expect(c.prompt).toBe('stow');
    rollout.gsKts = 0;
    c = stepCoach(c, { ...full, onGround: true, rollout }, 0.016);
    expect(c.prompt).toBe('stopped');
    rollout.gsKts = 40;
    c = stepCoach(c, { ...full, onGround: true, rollout }, 0.016);
    expect(c.prompt).toBe('stopped');
  });
  it('on a touch screen it names the buttons, not the keys, and still fits a phone', () => {
    for (const k of ['gear', 'reverse', 'brake', 'stow', 'flaps']) {
      const t = coachText(k, { touch: true, flapsDeg: 30 });
      expect(t).not.toMatch(/\((G|R|B)\)|press [FR]\b|: R,/);
      expect(t.length).toBeLessThanOrEqual(48);
    }
    expect(coachText('reverse', { touch: true })).toContain('REV');
  });
  it('puts the numbers in the words', () => {
    expect(coachText('slow', { targetKts: 155 })).toBe('Slow: fly 155 kt, add power');
    expect(coachText('flaps', { flapsDeg: 30 })).toBe('Landing flaps: press F until 30°');
    expect(coachText('papi')).toBe(COACH_PROMPTS.papi);
  });
});
