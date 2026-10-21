import { test, expect } from './fixtures.js';
import { BASE, stubTiles, collectErrors } from './helpers.js';

// Ticket 0032: hiding the tab pauses the flight (no auto-resume), and the screen is kept
// awake while flying. navigator.wakeLock is stubbed and document.hidden is overridable.
// Like a real browser, the fake lets go of a held lock on its own when the page hides.
const FAKE_WAKE_LOCK = () => {
  window.__wl = { requests: 0, releases: 0, held: [] };
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: {
      request: async () => {
        window.__wl.requests++;
        const listeners = [];
        const s = {
          released: false,
          addEventListener(ev, fn) { if (ev === 'release') listeners.push(fn); },
          async release() {
            if (s.released) return;
            s.released = true;
            window.__wl.releases++;
            window.__wl.held = window.__wl.held.filter((x) => x !== s);
            listeners.forEach((fn) => fn());
            s.onrelease?.(); // a real sentinel fires both
          },
        };
        window.__wl.held.push(s);
        return s;
      },
    },
  });
};

const HIDDEN_SWITCH = () => {
  window.__hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__hidden ? 'hidden' : 'visible') });
};

const setHidden = (page, hidden) => page.evaluate((h) => {
  window.__hidden = h;
  if (h && window.__wl) window.__wl.held.forEach((s) => s.release()); // the system's release
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);

const debug = (page) => page.evaluate(() => window.openaeroDebug());
const wl = (page) => page.evaluate(() => window.__wl);

async function fly(page) {
  await page.goto(BASE);
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
}

async function hideReturnStaysPaused(page, pauseLabel) {
  await expect.poll(async () => (await wl(page)).requests).toBe(1);
  expect((await debug(page)).wakeLock).toBe(true);
  await expect.poll(async () => (await debug(page)).audio).toBe('running');

  await setHidden(page, true);
  expect((await debug(page)).paused).toBe(true);
  await expect.poll(async () => (await wl(page)).releases).toBe(1);
  const a = await debug(page);
  await page.waitForTimeout(1000);
  const b = await debug(page);
  expect(b.simTime).toBe(a.simTime);
  expect(b.pos).toEqual(a.pos);
  await expect.poll(async () => (await debug(page)).audio).toBe('suspended');

  // Back on the tab: still paused, PAUSED shown, no new wake lock until Resume.
  await setHidden(page, false);
  await page.waitForTimeout(500);
  const c = await debug(page);
  expect(c.paused).toBe(true);
  expect(c.simTime).toBe(a.simTime);
  await expect(pauseLabel).toBeVisible();
  expect((await wl(page)).requests).toBe(1);
  return c;
}

test.describe('hidden tab and wake lock', () => {
  test.beforeEach(async ({ page }) => {
    await stubTiles(page);
    await page.addInitScript(FAKE_WAKE_LOCK);
    await page.addInitScript(HIDDEN_SWITCH);
  });

  test('desktop: hiding pauses, returning stays paused, Resume flies and re-locks', async ({ page }) => {
    const errors = collectErrors(page);
    await fly(page);
    await hideReturnStaysPaused(page, page.locator('#btnPause', { hasText: 'RESUME' }));

    await page.locator('#btnPause').click();
    expect((await debug(page)).paused).toBe(false);
    await expect.poll(async () => (await wl(page)).requests).toBe(2);
    await expect.poll(async () => (await debug(page)).audio).toBe('running');
    const t0 = (await debug(page)).simTime;
    await expect.poll(async () => (await debug(page)).simTime).toBeGreaterThan(t0);

    // A quick pause/resume (gamepad START) never leaves the engine silent.
    await page.evaluate(() => { const b = document.getElementById('btnPause'); b.click(); b.click(); });
    await page.waitForTimeout(300);
    expect((await debug(page)).audio).toBe('running');

    // The results card lets go of it; dismissing the card takes it back.
    await page.evaluate(() => document.getElementById('resultsCard').classList.remove('hidden'));
    await expect.poll(async () => (await wl(page)).releases).toBe(2);
    await page.locator('#btnKeepRolling').click();
    await expect.poll(async () => (await wl(page)).requests).toBe(3);

    // Pausing by hand releases it too.
    await page.locator('#btnPause').click();
    await expect.poll(async () => (await wl(page)).releases).toBe(3);
    expect(errors).toEqual([]);
  });

  test('no wake lock is requested behind the start screen, and hiding there does not pause', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('#onboardingModal').waitFor({ state: 'visible' });
    await page.waitForTimeout(500);
    expect((await wl(page)).requests).toBe(0);
    await setHidden(page, true);
    expect((await debug(page)).paused).toBe(false);
  });

  test('closing the start screen with ✕ (not ENTER COCKPIT) still pauses on hide', async ({ page }) => {
    await page.goto(BASE);
    await page.locator('#onboardingModal').waitFor({ state: 'visible' });
    await page.locator('#btnCloseModal').click();
    await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
    await setHidden(page, true);
    expect((await debug(page)).paused).toBe(true);
  });

  test('on a phone, Resume closes the menu sheet and the menu button is labelled paused', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await fly(page);
    await setHidden(page, true);
    await setHidden(page, false);
    await expect(page.locator('#btnMenu')).toHaveAttribute('aria-label', 'Menu, paused');
    await page.locator('#btnMenu').click();
    await page.locator('#btnPause').click();
    expect((await debug(page)).paused).toBe(false);
    await expect(page.locator('#btnMenu')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#btnMenu')).toHaveAttribute('aria-label', 'Menu');
  });

  test('mid-flight behind the Missions modal, hiding still pauses and silences', async ({ page }) => {
    await fly(page);
    await expect.poll(async () => (await debug(page)).audio).toBe('running');
    await page.locator('#btnOpenMissions').click();
    await page.locator('#onboardingModal').waitFor({ state: 'visible' });
    await setHidden(page, true);
    expect((await debug(page)).paused).toBe(true);
    await expect.poll(async () => (await debug(page)).audio).toBe('suspended');
    // Back and straight into the cockpit: still paused, still quiet until Resume.
    await setHidden(page, false);
    await page.locator('#btnStartFlight').click();
    await page.waitForTimeout(300);
    expect((await debug(page)).paused).toBe(true);
    expect((await debug(page)).audio).toBe('suspended');
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('hiding pauses and the always-visible menu button says PAUSED', async ({ page }) => {
      const errors = collectErrors(page);
      await fly(page);
      await hideReturnStaysPaused(page, page.locator('#btnMenu', { hasText: 'PAUSED' }));
      expect(errors).toEqual([]);
    });
  });
});

test.describe('without the Wake Lock API', () => {
  test('a missing navigator.wakeLock logs nothing and hiding still pauses', async ({ page }) => {
    await stubTiles(page);
    await page.addInitScript(HIDDEN_SWITCH);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
    });
    const errors = collectErrors(page);
    await fly(page);
    await page.waitForTimeout(500);
    await setHidden(page, true);
    expect((await debug(page)).paused).toBe(true);
    expect((await debug(page)).wakeLock).toBe(false);
    expect(errors).toEqual([]);
  });

  test('a rejected request is silent', async ({ page }) => {
    await stubTiles(page);
    await page.addInitScript(() => {
      window.__rejects = 0;
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: { request: () => { window.__rejects++; return Promise.reject(new DOMException('denied', 'NotAllowedError')); } },
      });
    });
    const errors = collectErrors(page);
    await fly(page);
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => window.__rejects)).toBe(1); // not retried every frame
    expect((await debug(page)).wakeLock).toBe(false);
    expect(errors).toEqual([]);
  });
});
