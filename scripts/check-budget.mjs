#!/usr/bin/env node
// Boot JS budget (ticket 0084): gzips every script the built index.html loads before the
// first paint (the entry module plus its modulepreloads, i.e. the chunks it imports
// statically) and fails above the limit written in AGENTS.md § 5 ("JS ≤ N kB gzipped at
// boot"). kB = 1000 bytes of gzip -9. Run after `npm run build`; `npm run check` does.
// It also fails unless the bundle holds exactly one copy of three: `three` resolves to its
// source (vite.config.js), which drops three's own "multiple instances" warning, and a second
// copy (e.g. an import of three/webgpu or three/build/*) would break instanceof silently.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// The bundle paths (relative to the HTML's directory) of the boot scripts, in page order.
export function bootScripts(html, base = '/openaero/') {
  const out = [];
  const re = /<(?:script\b[^>]*\btype="module"[^>]*\bsrc|link\b[^>]*\brel="modulepreload"[^>]*\bhref)="([^"]+\.js)"/g;
  for (const m of html.matchAll(re)) {
    const p = m[1].startsWith(base) ? m[1].slice(base.length) : m[1].replace(/^\.?\//, '');
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

export function budgetKb(agentsMd) {
  const m = agentsMd.match(/JS ≤ (\d+(?:\.\d+)?) kB gzipped at boot/);
  if (!m) throw new Error('AGENTS.md: no "JS ≤ N kB gzipped at boot" line');
  return Number(m[1]);
}

// { files: [{ path, kb }], totalKb, limitKb, ok } for a built dist directory.
export function checkBudget(distDir, limitKb) {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8');
  const paths = bootScripts(html);
  if (!paths.length) throw new Error(`${distDir}/index.html: no module scripts found`);
  const files = paths.map((path) => ({ path, kb: gzipSync(readFileSync(join(distDir, path)), { level: 9 }).length / 1000 }));
  const totalKb = files.reduce((s, f) => s + f.kb, 0);
  return { files, totalKb, limitKb, ok: totalKb <= limitKb };
}

// How many times three's Object3D is defined across the built JS (1 = one copy of three).
export function threeCopies(distDir) {
  const dir = join(distDir, 'assets');
  return readdirSync(dir).filter((f) => /\.m?js$/.test(f))
    .reduce((n, f) => n + (readFileSync(join(dir, f), 'utf8').match(/\bisObject3D\s*=\s*(?:!0|true)/g) || []).length, 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = checkBudget(process.argv[2] || 'dist/openaero', budgetKb(readFileSync('AGENTS.md', 'utf8')));
  for (const f of r.files) console.log(`${f.kb.toFixed(2).padStart(8)} kB  ${f.path}`);
  console.log(`boot JS ${r.totalKb.toFixed(2)} kB gz, budget ${r.limitKb} kB: ${r.ok ? 'ok' : 'OVER'}`);
  const copies = threeCopies(process.argv[2] || 'dist/openaero');
  console.log(`three.js copies in the bundle: ${copies}${copies === 1 ? '' : ' (expected 1)'}`);
  if (!r.ok || copies !== 1) process.exit(1);
}
