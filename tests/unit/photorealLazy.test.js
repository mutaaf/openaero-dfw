import { describe, it, expect, vi } from 'vitest';
import { createLazyPhotoreal, photorealAllowed } from '../../src/photorealLazy.js';

function fakeImpl() {
  const impl = {
    state: { status: 'off', attributions: 'Google' },
    session: { page: { roots: 1 } },
    start: vi.fn(async () => { impl.state.status = 'loading'; }),
    update: vi.fn(), setVisible: vi.fn(), resize: vi.fn(), noteSessionReuse: vi.fn(),
    bounds: vi.fn(() => ({ min: [0, 0, 0], max: [1, 1, 1] })),
  };
  return impl;
}

describe('lazy photoreal (0084)', () => {
  it('is an idle no-op until start, and loads nothing', () => {
    const load = vi.fn();
    const p = createLazyPhotoreal({}, load);
    expect(p.state.status).toBe('off');
    expect(p.session).toBeNull();
    expect(p.bounds()).toBeNull();
    p.update(0.016); p.resize(); p.noteSessionReuse(); p.setVisible(false);
    expect(load).not.toHaveBeenCalled();
  });

  it('start loads the module once, builds it with the options and forwards everything', async () => {
    const impl = fakeImpl();
    const createPhotoreal = vi.fn(() => impl);
    const load = vi.fn(async () => ({ createPhotoreal }));
    const opts = { scene: {}, onActive() {} };
    const p = createLazyPhotoreal(opts, load);
    p.setVisible(false); // before load: remembered
    const a = p.start('/openaero/api/config');
    const b = p.start('/openaero/api/config'); // a second Fly while loading: still one load
    expect(p.state.status).toBe('starting');
    await Promise.all([a, b]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(createPhotoreal).toHaveBeenCalledWith(opts);
    expect(impl.setVisible).toHaveBeenCalledWith(false);
    expect(impl.start).toHaveBeenCalledTimes(1);
    expect(impl.start).toHaveBeenCalledWith('/openaero/api/config');
    expect(p.state).toBe(impl.state);
    expect(p.session).toBe(impl.session);
    p.update(0.5); p.resize(); p.noteSessionReuse(); p.setVisible(true);
    expect(impl.update).toHaveBeenCalledWith(0.5);
    expect(impl.resize).toHaveBeenCalled();
    expect(impl.noteSessionReuse).toHaveBeenCalled();
    expect(impl.setVisible).toHaveBeenLastCalledWith(true);
    expect(p.bounds()).toEqual({ min: [0, 0, 0], max: [1, 1, 1] });
    await p.start('/openaero/api/config'); // after load: the module's own guard decides
    expect(impl.start).toHaveBeenCalledTimes(2);
  });

  it('a chunk that fails to load reports unavailable (the free terrain stays)', async () => {
    const onUnavailable = vi.fn();
    const p = createLazyPhotoreal({ onUnavailable }, async () => { throw new Error('chunk 404'); });
    await p.start('/x');
    expect(p.state.status).toBe('unavailable');
    expect(p.state.reason).toBe('chunk 404');
    expect(onUnavailable).toHaveBeenCalledWith('chunk 404');
  });

  it('a module that throws while building reports unavailable too', async () => {
    const onUnavailable = vi.fn();
    const p = createLazyPhotoreal({ onUnavailable }, async () => ({ createPhotoreal() { throw new Error('boom'); } }));
    await p.start('/x');
    expect(p.state.status).toBe('unavailable');
    expect(onUnavailable).toHaveBeenCalledWith('boom');
  });

  it('photorealAllowed: the live origin or ?photoreal only', () => {
    expect(photorealAllowed({ origin: 'https://mutaafaziz.com', search: '' })).toBe(true);
    expect(photorealAllowed({ origin: 'http://localhost:4173', search: '' })).toBe(false);
    expect(photorealAllowed({ origin: 'http://localhost:4173', search: '?photoreal' })).toBe(true);
  });
});
