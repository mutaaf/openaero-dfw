// Bakes the star field drawn over DFW at night (src/skyDome.js).
//
//   node scripts/bake-stars.mjs [path/to/bsc5-short.json]
//
// Source: the Yale Bright Star Catalogue, 5th revised edition (Hoffleit & Warren 1991,
// public domain, http://tdc-www.harvard.edu/catalogs/bsc5.html), in the JSON form from
// https://github.com/brettonw/YaleBrightStarCatalog (bsc5-short.json: J2000 RA/Dec, V, K).
// Output: public/sky/stars-v1.bin = float32 LE [ra rad, dec rad, V, temperature K] per star
// down to V 5.8 (a dark-sky naked-eye limit), brightest first. The output is committed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SRC = process.argv[2] || 'bsc5-short.json';
const LIMIT_V = 5.8;
const rows = JSON.parse(readFileSync(SRC, 'utf8'));

const num = (s) => parseFloat(String(s).replace('−', '-'));
function ra(s) {
  const m = s.match(/(\d+)h\s*(\d+)m\s*([\d.]+)s/);
  return ((+m[1] + +m[2] / 60 + +m[3] / 3600) * 15) * Math.PI / 180;
}
function dec(s) {
  const m = s.match(/([+-−])(\d+)°\s*(\d+)′\s*([\d.]+)″/);
  const v = +m[2] + +m[3] / 60 + +m[4] / 3600;
  return (m[1] === '+' ? v : -v) * Math.PI / 180;
}

const stars = rows
  .filter((r) => r.RA && r.Dec && r.V !== undefined && num(r.V) <= LIMIT_V)
  .map((r) => [ra(r.RA), dec(r.Dec), num(r.V), num(r.K) || 6000])
  .sort((a, b) => a[2] - b[2]);
const out = new Float32Array(stars.length * 4);
stars.forEach((s, i) => out.set(s, i * 4));
mkdirSync('public/sky', { recursive: true });
writeFileSync('public/sky/stars-v1.bin', Buffer.from(out.buffer));
console.log(`${stars.length} stars to V ${LIMIT_V}, ${out.byteLength} bytes`);
