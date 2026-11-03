// Ticket 0049: the controls cheat sheet lists every control the game binds. Each check reads the
// bindings from the source, so a key, pad button or touch control added later without a row fails here.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { KEYBOARD, GAMEPAD, TOUCH, sheetSections } from '../../src/controlsSheet.js';
import { BUTTON } from '../../src/gamepad.js';

const src = (f) => readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8');
const all = readdirSync(new URL('../../src/', import.meta.url)).filter((f) => f.endsWith('.js')).map(src).join('\n');
const grab = (text, re) => [...text.matchAll(re)].map((m) => m[1]);

describe('controls cheat sheet (0049)', () => {
  const codes = new Set(KEYBOARD.flatMap((r) => r.codes ?? []));
  const keyNames = new Set(KEYBOARD.flatMap((r) => r.keys ?? []));

  it('lists every key code a handler binds (e.code, the held-keys table, input.js)', () => {
    const bound = new Set([
      ...grab(all, /e\.code === '(\w+)'/g),
      ...grab(all, /keys\['(\w+)'\]/g),
      ...grab(src('input.js'), /\bk\.([A-Z]\w+)/g),
    ]);
    expect(bound.size).toBeGreaterThan(20); // the scan found the bindings at all
    expect([...bound].filter((c) => !codes.has(c))).toEqual([]);
  });

  it('lists every key name a handler binds (e.key), "?" among them', () => {
    const bound = new Set(grab(all, /e\.key === '([^']+)'/g));
    expect(grab(src('main.js'), /e\.key === '([^']+)'/g)).toContain('?'); // main.js opens the sheet
    expect([...bound].filter((k) => !keyNames.has(k))).toEqual([]);
  });

  it('lists every gamepad button gamepad.js maps, and the sticks and triggers', () => {
    const listed = new Set(GAMEPAD.flatMap((r) => r.buttons ?? []));
    expect(Object.keys(BUTTON).filter((b) => !listed.has(b))).toEqual([]);
    const text = GAMEPAD.map((r) => r.input).join(' ');
    for (const w of ['Left stick', 'Right stick', 'LB', 'RB', 'LT', 'RT']) expect(text).toContain(w);
  });

  it('lists every touch control on the flight deck', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const deck = html.slice(html.indexOf('id="touchDeck"'), html.indexOf('id="keyHints"'));
    const ids = grab(deck, /<(?:button|div) id="(touch(?:Throttle|Stick|Gear|Flaps|Brakes|Ils|TrimUp|TrimDn))"/g);
    expect(ids.length).toBe(8);
    const listed = new Set(TOUCH.flatMap((r) => r.ids ?? []));
    expect(ids.filter((id) => !listed.has(id))).toEqual([]);
  });

  it('says what each row does, in words a first-timer reads', () => {
    for (const r of [...KEYBOARD, ...GAMEPAD, ...TOUCH]) {
      expect(r.input.length).toBeGreaterThan(0);
      expect(r.does.length).toBeGreaterThan(3);
    }
    // The pitch rows say which way the nose goes (W = nose down, input.test.js; the touch stick: up = nose up).
    expect(KEYBOARD.find((r) => r.codes?.includes('KeyW')).does).toMatch(/nose down/i);
    expect(KEYBOARD.find((r) => r.codes?.includes('KeyS')).does).toMatch(/nose up/i);
    expect(TOUCH.find((r) => r.ids?.includes('touchStick')).does).toMatch(/up.*nose up/i);
  });

  it('puts touch first on a touch screen, the keyboard first otherwise', () => {
    expect(sheetSections(true).map((s) => s.title)).toEqual(['Touch', 'Keyboard and mouse', 'Gamepad']);
    expect(sheetSections(false).map((s) => s.title)).toEqual(['Keyboard and mouse', 'Gamepad', 'Touch']);
  });
});
