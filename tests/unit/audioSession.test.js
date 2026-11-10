import { describe, it, expect } from 'vitest';
import { audioSession } from '../../src/audioSession.js';

// iOS's silent switch (0169): the audio session type follows the game's sound state.
const nav = (type = 'auto') => {
  const writes = [];
  return { writes, audioSession: { _t: type, get type() { return this._t; }, set type(t) { this._t = t; writes.push(t); } } };
};

describe('audioSession (0169)', () => {
  it('sound on and flying: "playback" (plays through the ringer switch)', () => {
    const n = nav();
    audioSession({ paused: false, audioEnabled: true }, n);
    expect(n.audioSession.type).toBe('playback');
  });
  it('sound off: "auto"; paused: "ambient", whatever the sound toggle says', () => {
    const n = nav('playback');
    audioSession({ paused: false, audioEnabled: false }, n);
    expect(n.audioSession.type).toBe('auto');
    audioSession({ paused: true, audioEnabled: true }, n);
    expect(n.audioSession.type).toBe('ambient');
    audioSession({ paused: true, audioEnabled: false }, n);
    expect(n.audioSession.type).toBe('ambient');
  });
  it('writes only on a change (it runs every frame)', () => {
    const n = nav();
    for (let i = 0; i < 60; i++) audioSession({ paused: false, audioEnabled: true }, n);
    expect(n.writes).toEqual(['playback']);
  });
  it('no navigator, no audioSession, or a setter that throws: nothing thrown', () => {
    const sim = { paused: false, audioEnabled: true };
    expect(() => audioSession(sim, undefined)).not.toThrow();
    expect(() => audioSession(sim, {})).not.toThrow();
    const bad = { audioSession: { type: 'auto' } };
    Object.defineProperty(bad.audioSession, 'type', { get: () => 'auto', set: () => { throw new Error('NotAllowed'); } });
    expect(() => audioSession(sim, bad)).not.toThrow();
  });
});
