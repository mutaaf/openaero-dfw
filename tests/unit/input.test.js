import { describe, it, expect } from 'vitest';
import { pilotTargets, stickFromPoint } from '../../src/input.js';

describe('pilotTargets', () => {
  it('is neutral with no keys', () => {
    expect(pilotTargets({})).toEqual({ pitch: 0, roll: 0, yaw: 0 });
  });
  it('maps W/S and arrows to pitch (W = nose down)', () => {
    expect(pilotTargets({ KeyW: true }).pitch).toBe(1);
    expect(pilotTargets({ ArrowUp: true }).pitch).toBe(-1);
  });
  it('maps A/D to roll and Q/E to yaw', () => {
    expect(pilotTargets({ KeyA: true }).roll).toBe(-1);
    expect(pilotTargets({ ArrowRight: true }).roll).toBe(1);
    expect(pilotTargets({ KeyQ: true, KeyE: true }).yaw).toBe(0);
  });
});

describe('stickFromPoint', () => {
  const rect = { left: 100, top: 100, width: 96, height: 96 };
  it('centre is neutral', () => {
    expect(stickFromPoint(148, 148, rect)).toEqual({ x: 0, y: 0 });
  });
  it('clamps outside the pad', () => {
    expect(stickFromPoint(0, 1000, rect)).toEqual({ x: -1, y: 1 });
  });
});

import { combineTargets, throttleFromPoint, tillerRudder } from '../../src/input.js';

describe('combineTargets', () => {
  const kb = { pitch: 1, roll: -1, yaw: 0 };
  it('uses the keyboard when nothing else is active', () => {
    expect(combineTargets(kb, null, null)).toEqual({ pitch: 1, roll: -1, yaw: 0, source: 'keyboard' });
  });
  it('an active touch/drag stick wins over everything', () => {
    const stick = { x: 0.5, y: -0.25, active: true };
    const pad = { roll: 1, pitch: 1, yaw: 1, active: true };
    expect(combineTargets(kb, stick, pad)).toEqual({ pitch: -0.25, roll: 0.5, yaw: 1, source: 'stick' });
  });
  it('a deflected gamepad wins over the keyboard', () => {
    const pad = { roll: 0.3, pitch: -0.4, yaw: 0.1, active: true };
    expect(combineTargets(kb, { x: 0, y: 0, active: false }, pad)).toEqual({ pitch: -0.4, roll: 0.3, yaw: 0.1, source: 'gamepad' });
  });
  it('keyboard yaw still works while the touch stick is held', () => {
    expect(combineTargets({ pitch: 0, roll: 0, yaw: -1 }, { x: 0.2, y: 0.1, active: true }, null).yaw).toBe(-1);
  });
});

describe('throttleFromPoint', () => {
  const rect = { top: 100, height: 200 };
  it('top of the track is full power, bottom is idle', () => {
    expect(throttleFromPoint(100, rect)).toBe(1);
    expect(throttleFromPoint(300, rect)).toBe(0);
    expect(throttleFromPoint(200, rect)).toBeCloseTo(0.5);
  });
  it('clamps outside the track', () => {
    expect(throttleFromPoint(0, rect)).toBe(1);
    expect(throttleFromPoint(999, rect)).toBe(0);
  });
});

// Ticket 0110: Pilot's touch tiller on the runway.
describe('tillerRudder', () => {
  const wb = 1.651, steer = 10; // C172 (aircraft.js gear)
  it('a thumb resting near the centre of the pad does not steer', () => {
    expect(tillerRudder(0.2, 5, wb, steer)).toBe(0);
    expect(tillerRudder(-0.25, 5, wb, steer)).toBe(-0);
  });
  it('full nose wheel at walking pace, either way', () => {
    expect(tillerRudder(1, 1, wb, steer)).toBe(1);
    expect(tillerRudder(-1, 1, wb, steer)).toBe(-1);
  });
  it('on the roll full stick turns no faster than 8°/s (v·tan δ / wheelbase)', () => {
    for (const gs of [10, 25, 70]) {
      const rud = tillerRudder(1, gs, wb, steer);
      const rateDegS = gs * Math.tan(rud * steer * Math.PI / 180) / wb * 180 / Math.PI;
      expect(rateDegS).toBeLessThanOrEqual(8.05);
      expect(rateDegS).toBeGreaterThan(7);
    }
  });
});

// 0106: Pilot on touch has no pedals; from 40 kt to Vr the centreline hold steers the roll.
import { touchGroundRudder, tillerShare } from '../../src/input.js';
describe('touchGroundRudder', () => {
  const kt = 0.514444, wb = 15.6, steer = 7;
  it('is the tiller to 20 kt, the hold from 40 kt, a blend between; the hold whenever the thumb is not steering', () => {
    expect(tillerShare(10 * kt)).toBe(1);
    expect(tillerShare(30 * kt)).toBeCloseTo(0.5, 6);
    expect(tillerShare(60 * kt)).toBe(0);
    expect(touchGroundRudder(1, 10 * kt, wb, steer, -0.4)).toBe(tillerRudder(1, 10 * kt, wb, steer));
    expect(touchGroundRudder(1, 80 * kt, wb, steer, -0.4)).toBe(-0.4);
    expect(touchGroundRudder(0.625, 30 * kt, wb, steer, -0.4)).toBeCloseTo(0.5 * tillerRudder(0.625, 30 * kt, wb, steer) - 0.2, 6);
    expect(touchGroundRudder(0, 5 * kt, wb, steer, -0.4)).toBe(-0.4);
    expect(touchGroundRudder(0.2, 30 * kt, wb, steer, -0.4)).toBe(-0.4);
  });
});

// 0171: rebindable keys. keyMap.js holds the table, storage and rebinding; input.js keyCode reads the Map.
import { keys, keyCode, setKeyMap } from '../../src/input.js';
import { DEFAULT_KEYS, ACTION_WORDS, defaultMap, keyTable, readKeys, rebindKey, keyLabel, pressedLabel } from '../../src/keyMap.js';
describe('rebindable keys (0171)', () => {
  const stored = (map, extra = {}) => JSON.stringify({ v: 1, map, at: 1, ...extra });
  const press = (code) => { const c = keyCode(code); if (c) keys[c] = true; return c; };

  it('the default table is the old keys, every action named', () => {
    expect(DEFAULT_KEYS.pitchDown).toEqual(['KeyW', 'ArrowDown']);
    expect(DEFAULT_KEYS.bankLeft).toEqual(['KeyA', 'ArrowLeft']);
    expect(DEFAULT_KEYS.powerDown).toEqual(['ControlLeft', 'ControlRight']);
    expect(DEFAULT_KEYS.trimUp).toEqual(['BracketRight', 'Numpad1']);
    const all = Object.values(DEFAULT_KEYS).flat();
    expect(new Set(all).size).toBe(all.length); // no code twice
    expect(Object.keys(ACTION_WORDS).sort()).toEqual(Object.keys(DEFAULT_KEYS).sort());
    expect(keyTable(defaultMap())).toBe(null); // the defaults need no table
  });

  it('with no map every key passes through unchanged', () => {
    setKeyMap(null);
    for (const c of ['KeyW', 'KeyA', 'ShiftLeft', 'KeyX', 'Space']) expect(keyCode(c)).toBe(c);
  });

  it('bank left on KeyJ: KeyJ banks left, KeyA does nothing, the arrow still banks', () => {
    const r = rebindKey(defaultMap(), 'bankLeft', 'KeyJ');
    expect(r.map.bankLeft).toEqual(['KeyJ', 'ArrowLeft']);
    setKeyMap(keyTable(r.map));
    expect(keyCode('KeyJ')).toBe('KeyA');
    expect(keyCode('KeyA')).toBe(null);
    expect(keyCode('ArrowLeft')).toBe('ArrowLeft');
    expect(keyCode('KeyW')).toBe('KeyW');
    expect(keyCode('KeyX')).toBe('KeyX'); // unbound: passes through, nothing reads it
    for (const k in keys) keys[k] = false;
    press('KeyJ');
    expect(pilotTargets(keys).roll).toBe(-1);
    for (const k in keys) keys[k] = false;
    press('KeyA');
    expect(pilotTargets(keys).roll).toBe(0);
    setKeyMap(null);
  });

  it('a moved key can take another action; setKeyMap lets go of held keys', () => {
    let m = rebindKey(defaultMap(), 'bankLeft', 'KeyJ').map;
    m = rebindKey(m, 'gear', 'KeyA').map;
    keys.KeyW = true;
    setKeyMap(keyTable(m));
    expect(keys.KeyW).toBe(false);
    expect(keyCode('KeyA')).toBe('KeyG');
    expect(keyCode('KeyG')).toBe(null);
    setKeyMap(null);
  });

  it('refuses a key another action has, naming it; Tab and Escape are reserved', () => {
    expect(rebindKey(defaultMap(), 'bankLeft', 'KeyD')).toEqual({ conflict: 'bankRight' });
    expect(rebindKey(defaultMap(), 'bankLeft', 'ArrowLeft')).toEqual({ conflict: 'bankLeft' }); // its own second key
    expect(rebindKey(defaultMap(), 'bankLeft', 'KeyA').map.bankLeft).toEqual(['KeyA', 'ArrowLeft']); // the same key: fine
    expect(rebindKey(defaultMap(), 'gear', 'Tab')).toEqual({ reserved: true });
    expect(rebindKey(defaultMap(), 'gear', 'Escape')).toEqual({ reserved: true });
    expect(rebindKey(defaultMap(), 'gear', 'MetaLeft')).toEqual({ reserved: true });
    expect(rebindKey(defaultMap(), 'gear', '')).toEqual({ reserved: true });
    // Keys whose browser default would still run, or that latch (panel): F5 reloads, CapsLock sends no
    // keyup on macOS, Slash/Quote open Firefox's quick find (and Shift+/ is "?"), Alt the menu bar,
    // Ctrl (power) + N/T opens a window.
    for (const c of ['F5', 'F11', 'CapsLock', 'NumLock', 'Slash', 'Quote', 'AltLeft', 'AltGraph', 'KeyN', 'KeyT', 'ContextMenu'])
      expect(rebindKey(defaultMap(), 'gear', c)).toEqual({ reserved: true });
    for (const c of ['KeyJ', 'Digit5', 'Numpad5', 'Semicolon', 'Enter', 'Backquote'])
      expect(rebindKey(defaultMap(), 'gear', c).map.gear).toEqual([c]);
  });

  it('reset: the default map again is no table at all', () => {
    const m = rebindKey(defaultMap(), 'powerDown', 'KeyX').map;
    expect(keyTable(m)).not.toBe(null);
    expect(keyTable(rebindKey(m, 'powerDown', 'ControlLeft').map)).toBe(null);
  });

  it('reads a stored map; corrupt or foreign data falls back to the defaults', () => {
    const m = rebindKey(defaultMap(), 'bankLeft', 'KeyJ').map;
    expect(readKeys(stored(m, { labels: { KeyJ: 'J', KeyZ: 'nope' } }))).toEqual({ map: m, labels: { KeyJ: 'J', KeyZ: 'nope' } });
    for (const raw of [null, '', '{', 'null', '[]', '42', JSON.stringify({ v: 2, map: m }), JSON.stringify({ v: 1 })]) expect(readKeys(raw)).toBe(null);
    // A code bound twice drops the map; a bad action keeps its default.
    expect(readKeys(stored({ ...m, gear: ['KeyJ'] }))).toBe(null);
    const bad = readKeys(stored({ ...m, gear: 'KeyG', flaps: ['F5'], brakes: ['KeyB', 'KeyN'], camera: [7] }));
    expect(bad.map.gear).toEqual(['KeyG']);
    expect(bad.map.flaps).toEqual(['KeyF']);
    expect(bad.map.brakes).toEqual(['KeyB']);
    expect(bad.map.camera).toEqual(['KeyC']);
    expect(bad.map.bankLeft).toEqual(['KeyJ', 'ArrowLeft']);
    // Labels only for bound codes, short strings.
    expect(readKeys(stored(m, { labels: { KeyJ: 'J', KeyY: 'Y', KeyW: 'x'.repeat(40) } })).labels).toEqual({ KeyJ: 'J' });
  });

  it('names a key by what it printed, else the layout, else its code', () => {
    expect(keyLabel('KeyJ')).toBe('J');
    expect(keyLabel('Digit5')).toBe('5');
    expect(keyLabel('Numpad7')).toBe('Num 7');
    expect(keyLabel('ArrowLeft')).toBe('←');
    expect(keyLabel('ControlRight')).toBe('Ctrl');
    expect(keyLabel('BracketLeft')).toBe('[');
    expect(keyLabel('KeyQ', {}, new Map([['KeyQ', 'a']]))).toBe('A'); // AZERTY
    expect(keyLabel('KeyQ', { KeyQ: 'Ä' }, new Map([['KeyQ', 'a']]))).toBe('Ä');
    expect(pressedLabel({ key: 'j', code: 'KeyJ' })).toBe('J');
    expect(pressedLabel({ key: ' ', code: 'Space' })).toBe('Space');
    expect(pressedLabel({ key: 'Shift', code: 'ShiftLeft' })).toBe('Shift');
  });
});
