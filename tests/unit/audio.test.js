import { describe, it, expect } from 'vitest';
import { createAudio } from '../../src/audio.js';

// Captions (0117): the callouts are picked whether or not sound is on (audio never started here).
const simAt = (aglFt, extra = {}) => ({ aglFt, vsiFpm: -700, onGround: false, vel: { y: -3.5 }, lastCalloutIdx: -1,
  throttle: 0.3, engineFailed: false, paused: false, audioEnabled: false, ...extra });

describe('audio callouts are captioned with sound off (0117)', () => {
  it('captions each altitude callout once as the airplane descends through it', () => {
    const said = [];
    const sim = simAt(1000);
    const audio = createAudio(sim, () => {}, (t, queued) => said.push([t, !!queued]));
    for (let ft = 1010; ft > 280; ft -= 5) { sim.aglFt = ft; audio.update(); }
    expect(said).toEqual([['one thousand', false], ['five hundred', false], ['four hundred', false], ['three hundred', false]]);
    expect(audio.started).toBe(false);
  });

  it('twenty is followed by a queued "retard" with power on', () => {
    const said = [];
    const sim = simAt(60, { vsiFpm: -300 });
    const audio = createAudio(sim, () => {}, (t, queued) => said.push([t, !!queued]));
    for (let ft = 60; ft > 12; ft -= 1) { sim.aglFt = ft; audio.update(); }
    expect(said.slice(-3)).toEqual([['thirty', false], ['twenty', false], ['retard', true]]);
  });

  it('captions the sim\'s one-off calls (gate, gear, windshear) as queued', () => {
    const said = [];
    const audio = createAudio(simAt(600), () => {}, (t, queued) => said.push([t, !!queued]));
    audio.callout('unstabilized, go around');
    expect(said).toEqual([['unstabilized, go around', true]]);
  });

  it('captions sink rate / pull up, and nothing while paused', () => {
    const said = [];
    const sim = simAt(420, { vsiFpm: -2000, lastCalloutIdx: 2, paused: true });
    const audio = createAudio(sim, () => {}, (t) => said.push(t));
    audio.update();
    expect(said).toEqual([]);
    sim.paused = false;
    audio.update();
    expect(said).toEqual(['sink rate']);
  });
});
