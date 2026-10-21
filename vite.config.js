import { readFileSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// Cloudflare Web Analytics is on for the mutaafaziz.com zone and auto-injects its beacon into
// every HTML response. Path exclusions need a paid plan, so the game's HTML opts out with
// `Cache-Control: no-transform` instead (AGENTS.md §3.3: no analytics). Workers static assets
// read `_headers` from the root of the assets directory (./dist), one level above outDir.
const HEADERS = ['/openaero/', '/openaero/index.html']
  .map((path) => `${path}\n  Cache-Control: public, max-age=0, must-revalidate, no-transform\n`)
  .join('');

const noAnalyticsHeaders = {
  name: 'no-analytics-headers',
  apply: 'build',
  closeBundle() {
    writeFileSync('dist/_headers', HEADERS);
  },
};

// The start screen's Credits link (ticket 0045) opens credits.html, built from
// public/CREDITS.md: phones show a .md file (text/markdown) as tiny raw text or download it.
// Only what CREDITS.md uses: # headings, - bullets (continued on indented lines), **bold**,
// `code` and bare https links.
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (t) => esc(t)
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/`(.+?)`/g, '<code>$1</code>')
  .replace(/(https:\/\/[^\s),]+[^\s),.])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
export function creditsHtml(md) {
  const blocks = md.split(/\n(?=#|- |\n)/).map((b) => b.trim()).filter(Boolean);
  const body = blocks.map((b) => {
    const h = b.match(/^(#{1,3}) (.*)/);
    if (h) return `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
    const text = inline(b.replace(/^- /, '').replace(/\s*\n\s*/g, ' '));
    return b.startsWith('- ') ? `<li>${text}</li>` : `<p>${text}</p>`;
  }).join('\n').replace(/(<li>[\s\S]*?<\/li>)(?!\n<li>)/g, '$1</ul>').replace(/(?<!<\/li>\n)<li>/g, '<ul><li>');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenAero DFW credits</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:46rem;margin:0 auto;padding:1rem max(1rem,env(safe-area-inset-left));background:#020617;color:#e2e8f0}
a{color:#7dd3fc;overflow-wrap:anywhere}code{font-size:.9em;color:#cbd5e1;overflow-wrap:anywhere}h1{font-size:1.4rem}h2{font-size:1.1rem;margin-top:1.6rem;color:#7dd3fc}li{margin:.4rem 0}</style></head>
<body>${body}</body></html>\n`;
}
const creditsPage = {
  name: 'credits-page',
  apply: 'build',
  closeBundle() {
    writeFileSync('dist/openaero/credits.html', creditsHtml(readFileSync('public/CREDITS.md', 'utf8')));
  },
};

// Served at https://mutaafaziz.com/openaero/ — the base path is an invariant (AGENTS.md §3.2).
export default defineConfig({
  base: '/openaero/',
  plugins: [noAnalyticsHeaders, creditsPage],
  build: {
    outDir: 'dist/openaero',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['tests/unit/**/*.test.js', 'tests/flight/**/*.test.js'],
    environment: 'node',
  },
});
