import { describe, it, expect } from 'vitest';
import { createWakeLock } from '../../src/wakeLock.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

// A fake navigator.wakeLock: records requests, hands out sentinels that count releases and
// can be released "by the system" (fires the release listeners and onrelease, as an EventTarget does).
function fakeNav({ reject = false, throws = false } = {}) {
  const log = { requests: 0, released: 0, sentinels: [] };
  const wakeLock = {
    request(type) {
      if (throws) throw new Error('sync throw');
      log.requests++;
      expect(type).toBe('screen');
      if (reject) return Promise.reject(new DOMException('denied', 'NotAllowedError'));
      const listeners = [];
      const s = {
        released: false,
        addEventListener: (ev, fn) => { if (ev === 'release') listeners.push(fn); },
        release() { if (!s.released) { s.released = true; log.released++; listeners.forEach((fn) => fn()); s.onrelease?.(); } return Promise.resolve(); },
        systemRelease() { s.release(); },
      };
      log.sentinels.push(s);
      return Promise.resolve(s);
    },
  };
  return { nav: { wakeLock }, log };
}

describe('createWakeLock', () => {
  it('requests once when flying starts and releases when it stops', async () => {
    const { nav, log } = fakeNav();
    const wl = createWakeLock(nav);
    for (let i = 0; i < 10; i++) wl.sync(true); // every frame: still one request
    await flush();
    expect(log.requests).toBe(1);
    expect(wl.held).toBe(true);
    wl.sync(false);
    expect(log.released).toBe(1);
    expect(wl.held).toBe(false);
    wl.sync(true);
    await flush();
    expect(log.requests).toBe(2);
    expect(wl.held).toBe(true);
  });

  it('releases a lock that arrives after flying already stopped', async () => {
    const { nav, log } = fakeNav();
    const wl = createWakeLock(nav);
    wl.sync(true);
    wl.sync(false); // paused before the promise resolved
    await flush();
    expect(log.requests).toBe(1);
    expect(log.released).toBe(1);
    expect(wl.held).toBe(false);
  });

  it('is a silent no-op without navigator.wakeLock', () => {
    for (const nav of [undefined, {}, { wakeLock: {} }]) {
      const wl = createWakeLock(nav);
      expect(() => { wl.sync(true); wl.sync(false); }).not.toThrow();
      expect(wl.held).toBe(false);
    }
  });

  it('a rejected request is not retried every frame, only when flying starts again', async () => {
    const { nav, log } = fakeNav({ reject: true });
    const wl = createWakeLock(nav);
    wl.sync(true);
    await flush();
    for (let i = 0; i < 60; i++) wl.sync(true);
    await flush();
    expect(log.requests).toBe(1);
    expect(wl.held).toBe(false);
    wl.sync(false);
    wl.sync(true);
    await flush();
    expect(log.requests).toBe(2);
  });

  it('a request that throws synchronously is swallowed', async () => {
    const { nav } = fakeNav({ throws: true });
    const wl = createWakeLock(nav);
    expect(() => wl.sync(true)).not.toThrow();
    await flush();
    expect(wl.held).toBe(false);
    wl.sync(false);
    wl.sync(true); // flying again: tried once more, still silent
    await flush();
    expect(wl.held).toBe(false);
  });

  it('re-requests once after the system releases the lock while still flying', async () => {
    const { nav, log } = fakeNav();
    const wl = createWakeLock(nav);
    wl.sync(true);
    await flush();
    log.sentinels[0].systemRelease();
    expect(wl.held).toBe(false);
    wl.sync(true);
    await flush();
    expect(log.requests).toBe(2);
    expect(wl.held).toBe(true);
    // A device that keeps revoking it gets no loop: no third request this stretch...
    log.sentinels[1].systemRelease();
    for (let i = 0; i < 10; i++) { wl.sync(true); await flush(); }
    expect(log.requests).toBe(2);
    // ...but the next time flying starts it tries again.
    wl.sync(false);
    wl.sync(true);
    await flush();
    expect(log.requests).toBe(3);
  });
});
