// Shared by world.spec.js and world.mobile.spec.js (ticket 0043).

// Every request for the world's chunk or Rapier's wasm, as it happens.
export function worldFetches(page) {
  const urls = [];
  page.on('request', (r) => { if (/worldScene|rapier_wasm3d/.test(r.url())) urls.push(r.url()); });
  return urls;
}

// Start the flight and wait for the world: returns its first snapshot.
export async function flyWorld(page) {
  await page.locator('#onboardingModal').waitFor({ state: 'visible' });
  await page.locator('#btnStartFlight').click();
  await page.locator('#onboardingModal').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => typeof window.openaeroWorld === 'function', null, { timeout: 30_000 });
  return page.evaluate(() => window.openaeroWorld());
}
