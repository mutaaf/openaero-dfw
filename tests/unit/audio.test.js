import { describe, it, expect } from 'vitest';
import { createAudio } from '../../src/audio.js';

// Captions (0117): the callouts are picked whether or not sound is on (audio never started here).
// raFt: the radio altitude at the main wheels the callouts read (0122); aglFt is the CG's.
const simAt = (raFt, extra = {}) => ({ raFt, aglFt: raFt + 12, vsiFpm: -700, onGround: false, vel: { y: -3.5 }, lastCalloutIdx: -1,
  throttle: 0.3, engineFailed: false, paused: false, audioEnabled: false, ...extra });

describe('audio callouts are captioned with sound off (0117)', () => {
  it('captions each altitude callout once as the airplane descends through it', () => {
    const said = [];
    const sim = simAt(1000);
    const audio = createAudio(sim, () => {}, (t, queued) => said.push([t, !!queued]));
    for (let ft = 1010; ft > 280; ft -= 5) { sim.raFt = ft; audio.update(); }
    expect(said).toEqual([['one thousand', false], ['five hundred', false], ['four hundred', false], ['three hundred', false]]);
    expect(audio.started).toBe(false);
  });

  it('twenty is followed by a queued "retard" with power on', () => {
    const said = [];
    const sim = simAt(60, { vsiFpm: -300 });
    const audio = createAudio(sim, () => {}, (t, queued) => said.push([t, !!queued]));
    for (let ft = 60; ft > 12; ft -= 1) { sim.raFt = ft; audio.update(); }
    expect(said.slice(-3)).toEqual([['thirty', false], ['twenty', false], ['retard', true]]);
  });

  it('captions the sim\'s one-off calls (gate, gear, windshear) as queued', () => {
    const said = [];
    const audio = createAudio(simAt(600), () => {}, (t, queued) => said.push([t, !!queued]));
    audio.callout('unstabilized, go around');
    expect(said).toEqual([['unstabilized, go around', true]]);
  });

  it('a second approach after a go-around is called again; nothing behind the start screen', () => {
    const said = [];
    const sim = simAt(520);
    const audio = createAudio(sim, () => {}, (t) => said.push(t));
    sim.raFt = 490; audio.update(false);
    expect(said).toEqual([]);
    audio.update();
    expect(said).toEqual(['five hundred']);
    sim.vel.y = 5; sim.raFt = 650; audio.update(); // the go-around's climb
    sim.vel.y = -3.5; sim.raFt = 495; audio.update();
    expect(said).toEqual(['five hundred', 'five hundred']);
  });

  it('a sink rate warning holds the height callouts back (EGPWS priority)', () => {
    const said = [];
    const sim = simAt(410, { vsiFpm: -2700, lastCalloutIdx: 1 });
    const audio = createAudio(sim, () => {}, (t) => said.push(t));
    sim.raFt = 398; audio.update();
    expect(said).toEqual(['sink rate']);
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

describe('the gate call is never cut off (0020, 0117)', () => {
  it('a sink rate warning just after the gate queues behind it', () => {
    const said = [];
    const sim = simAt(520, { lastCalloutIdx: 1 });
    const audio = createAudio(sim, () => {}, (t, queued) => said.push([t, !!queued]));
    audio.callout('unstabilized, go around');
    sim.raFt = 440; sim.vsiFpm = -2000; audio.update();
    expect(said).toEqual([['unstabilized, go around', true], ['sink rate', true]]);
  });
});

describe('the callouts read the radio altitude at the wheels, not the CG (0122)', () => {
  it('a 737 flaring with its CG at 22 ft and its wheels at 10 ft hears "ten"', () => {
    const said = [];
    const sim = simAt(40, { vsiFpm: -200, throttle: 0 });
    const audio = createAudio(sim, () => {}, (t) => said.push(t));
    for (let ft = 40; ft >= 0; ft -= 1) { sim.raFt = ft; sim.aglFt = ft + 12; audio.update(); }
    expect(said).toEqual(['forty', 'thirty', 'twenty', 'ten']);
  });

  it('"twenty" waits for the wheels: nothing with the CG at 20 ft and the wheels at 25', () => {
    const said = [];
    const sim = simAt(25, { vsiFpm: -200, lastCalloutIdx: 8, aglFt: 20 });
    const audio = createAudio(sim, () => {}, (t) => said.push(t));
    audio.update();
    expect(said).toEqual([]);
    sim.raFt = 20; audio.update();
    expect(said).toEqual(['twenty', 'retard']);
  });

  it('pull up (not sink rate) under 250 ft of radio altitude', () => {
    const said = [];
    const sim = simAt(245, { vsiFpm: -2000, aglFt: 257 });
    createAudio(sim, () => {}, (t) => said.push(t)).update();
    expect(said).toEqual(['pull up']);
  });
});
