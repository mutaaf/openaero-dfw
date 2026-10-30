// Captions (0117): record every line #calloutCaption shows, with where it and its neighbours
// were at that moment (CSS px). Call before the flight starts.
export async function recordCaptions(page) {
  await page.evaluate(() => {
    window.__captions = [];
    const el = document.getElementById('calloutCaption');
    const rectOf = (id) => {
      const e = document.getElementById(id);
      if (!e || e.classList.contains('hidden') || getComputedStyle(e).visibility === 'hidden') return null;
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    new MutationObserver(() => {
      if (!el.textContent) return;
      window.__captions.push({ text: el.textContent, rect: rectOf('calloutCaption'), coach: rectOf('coach'),
        master: rectOf('masterAlertBanner'), stall: rectOf('stallAlertBanner'), w: innerWidth, h: innerHeight });
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });
}

export const overlaps = (a, b) => !!a && !!b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
