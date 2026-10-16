import { test, expect } from '@playwright/test';
import { stubTiles, enterCockpit } from './helpers.js';

// Light frame-time probe. CI renders through SwiftShader (software GL), so the threshold
// is deliberately generous: it catches catastrophic regressions (a hang, a per-frame
// rebuild), not small ones. Track real numbers in docs/PERF.md.
test('frame time stays within the regression guard', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'measured on desktop only');
  await stubTiles(page);
  await enterCockpit(page);
  await page.waitForTimeout(1500);
  const stats = await page.evaluate(() => new Promise((resolve) => {
    const deltas = [];
    let last = performance.now();
    const end = last + 3000;
    function tick(now) {
      deltas.push(now - last);
      last = now;
      if (now < end) requestAnimationFrame(tick);
      else {
        deltas.sort((a, b) => a - b);
        const avg = deltas.reduce((s, d) => s + d, 0) / deltas.length;
        resolve({ frames: deltas.length, avgMs: avg, p95Ms: deltas[Math.floor(deltas.length * 0.95)] });
      }
    }
    requestAnimationFrame(tick);
  }));
  testInfo.annotations.push({ type: 'perf', description: JSON.stringify(stats) });
  console.log(`[perf] ${JSON.stringify(stats)}`);
  expect(stats.frames).toBeGreaterThan(5);
  expect(stats.avgMs).toBeLessThan(250);
});
