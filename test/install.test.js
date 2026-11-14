import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PALETTE } from '../src/look/index.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const hex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const manifest = () => JSON.parse(read('src/manifest.webmanifest'));
const html = () => read('src/index.html');

test('the install manifest names the page and asks for no browser bars', () => {
  const m = manifest();
  assert.equal(m.name, 'Jars');
  assert.equal(m.short_name, 'Jars');
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, '/');
  assert.equal(m.scope, '/');
});

test('every manifest icon exists, with one maskable and one scalable', () => {
  const { icons } = manifest();
  for (const i of icons) assert.ok(existsSync(new URL(`../src${i.src}`, import.meta.url)), `${i.src} is missing`);
  assert.equal(icons.filter((i) => i.purpose === 'maskable').length, 1);
  const svgs = icons.filter((i) => i.type === 'image/svg+xml');
  assert.equal(svgs.length, 1);
  assert.equal(svgs[0].sizes, 'any');
});

test('the PNG icons are PNGs of the size their name says', () => {
  for (const size of [180, 192, 512]) {
    const b = readFileSync(new URL(`../src/icons/jar-${size}.png`, import.meta.url));
    assert.deepEqual([...b.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `jar-${size}.png is not a PNG`);
    assert.equal(b.readUInt32BE(16), size, `jar-${size}.png width`);
    assert.equal(b.readUInt32BE(20), size, `jar-${size}.png height`);
  }
  const m = readFileSync(new URL('../src/icons/jar-maskable-512.png', import.meta.url));
  assert.equal(m.readUInt32BE(16), 512);
  assert.equal(m.readUInt32BE(20), 512);
});

test("the manifest's and the page's colours are the page colour", () => {
  const want = hex(PALETTE.page);
  const m = manifest();
  assert.equal(m.theme_color, want);
  assert.equal(m.background_color, want);
  assert.equal(html().match(/<meta name="theme-color" content="([^"]+)"/)?.[1], want);
  assert.ok(read('src/icons/jar-maskable.svg').includes(`<rect width="128" height="128" fill="${want}"/>`), 'the maskable icon background drifted from the page colour');
});

test('index.html carries the install tags once and the lantern button once', () => {
  const h = html();
  const count = (re) => (h.match(re) || []).length;
  assert.equal(count(/rel="manifest" href="manifest\.webmanifest"/g), 1);
  assert.equal(count(/rel="apple-touch-icon"/g), 1);
  assert.equal(count(/id="lantern"/g), 1);
  assert.equal(count(/<meta name="mobile-web-app-capable" content="yes">/g), 1);
  assert.equal(count(/<meta name="apple-mobile-web-app-capable" content="yes">/g), 1);
  assert.ok(existsSync(new URL('../src/icons/jar-180.png', import.meta.url)));
});

test('the dev server knows the manifest and PNG types', () => {
  const s = read('tools/serve.mjs');
  assert.ok(s.includes("'.webmanifest': 'application/manifest+json"));
  assert.ok(s.includes("'.png': 'image/png'"));
});

test('nothing under src/ stores anything on the device', () => {
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|html|css|webmanifest|svg)$/.test(name) && /localStorage|sessionStorage|indexedDB|document\.cookie/.test(readFileSync(p, 'utf8'))) hits.push(p);
    }
  };
  walk(new URL('../src', import.meta.url).pathname);
  assert.deepEqual(hits, []);
});

test('no icon the manifest or the page names is git-ignored', (t) => {
  const probe = spawnSync('git', ['--version']);
  if (probe.error || probe.status !== 0) return t.skip('git is not available');
  const root = new URL('../', import.meta.url).pathname;
  const paths = manifest().icons.map((i) => `src${i.src}`);
  paths.push(html().match(/rel="apple-touch-icon" href="([^"]+)"/)[1].replace(/^/, 'src/'));
  paths.push('src/icons/jar-maskable.svg');
  for (const p of paths) {
    const r = spawnSync('git', ['check-ignore', '-q', p], { cwd: root });
    if (r.status === 128) return t.skip('not a git checkout');
    assert.notEqual(r.status, 0, `${p} is git-ignored: a clean checkout would not have it`);
  }
});
