// Adapted from Memory Lane (vir-sunset) test/hosting.test.js, 2026-10-18
// Hosting: the page is published on Vercel from GitHub. These tests hold the
// shape of what makes that safe: vercel.json's headers (a self-only CSP, the
// absence of any "do not index" request, a cache split: the front page re-checks every
// visit, modules and the stylesheet keep for one minute, nothing is pinned), the
// robots pair, the link preview and icons, the dev server serving the same headers, the two workflows,
// the runbook's two copies, and nothing in git that must never be public.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { headersFor } from '../tools/serve.mjs';
import { PALETTE } from '../src/look/lantern/palette.js';

// The one copy of the live address in tests; the other is the commented block in src/index.html.
const LIVE = 'https://jar-pearl.vercel.app';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const hosting = () => JSON.parse(read('vercel.json'));
const allRule = () => hosting().headers.find((r) => r.source === '/(.*)');
const header = (name) => {
  const h = allRule().headers.find((x) => x.key.toLowerCase() === name.toLowerCase());
  return h && h.value;
};
const csp = () => Object.fromEntries(header('Content-Security-Policy')
  .split(';').map((d) => d.trim()).filter(Boolean)
  .map((d) => { const [name, ...sources] = d.split(/\s+/); return [name, sources]; }));

test('vercel.json publishes src/ as it is, with no build and no Git deploys', () => {
  const v = hosting();
  assert.equal(v.outputDirectory, 'src');
  assert.equal(v.framework, null);
  assert.ok(v.buildCommand === null || v.buildCommand === 'true', `buildCommand is ${v.buildCommand}`);
  assert.equal(v.git.deploymentEnabled.main, false);
});

test('the weather function runs in Frankfurt, next to the weather vendor', () => {
  assert.deepEqual(hosting().regions, ['fra1']);
});

test('one header rule covers every path', () => {
  assert.ok(allRule(), 'no headers rule with source "/(.*)"');
});

test('connect-src is exactly self, so the browser can only ask its own origin', () => {
  assert.deepEqual(csp()['connect-src'], ["'self'"]);
  assert.equal(header('Content-Security-Policy').split("connect-src 'self'").length - 1, 1);
});

test('/api/ answers are cached for 900 s at the edge and re-checked by the browser', () => {
  const rule = hosting().headers.find((r) => r.source === '/api/(.*)');
  assert.ok(rule, 'no /api/(.*) rule');
  const cc = rule.headers.find((x) => x.key.toLowerCase() === 'cache-control').value;
  assert.equal(cc, 'public, max-age=0, s-maxage=900');
  assert.equal(headersFor('/api/weather')['cache-control'], cc);
  assert.ok(read('api/weather.js').includes('s-maxage=900'), 'the function carries the same window');
});

test('the CSP loads nothing from outside the page', () => {
  const value = header('Content-Security-Policy');
  const d = csp();
  assert.deepEqual(d['default-src'], ["'self'"]);
  for (const [name, sources] of Object.entries(d)) {
    const allowed = name === 'img-src' ? ["'self'", "'none'", 'data:'] : ["'self'", "'none'"];
    for (const s of sources) assert.ok(allowed.includes(s), `${name} allows ${s}`);
  }
  for (const bad of ['http', '*', 'unsafe-inline', 'unsafe-eval']) {
    assert.ok(!value.includes(bad), `the CSP contains ${bad}`);
  }
  assert.deepEqual(d['frame-ancestors'], ["'none'"]);
  assert.deepEqual(d['object-src'], ["'none'"]);
  assert.deepEqual(d['base-uri'], ["'self'"]);
});

test('nothing asks search engines to stay out; the default is re-check every visit', () => {
  assert.equal(header('X-Robots-Tag'), undefined);
  assert.equal(header('Cache-Control'), 'public, max-age=0, must-revalidate');
});

test('modules and the stylesheet get a one-minute window; the front page re-checks every visit', () => {
  for (const p of ['/', '/index.html', '/robots.txt']) {
    assert.equal(headersFor(p)['cache-control'], 'public, max-age=0, must-revalidate', p);
  }
  for (const p of ['/main.js', '/cities/warsaw/index.js', '/style.css']) {
    assert.equal(headersFor(p)['cache-control'], 'public, max-age=60', p);
  }
  const caches = hosting().headers.flatMap((r) => r.headers
    .filter((x) => x.key.toLowerCase() === 'cache-control').map((x) => ({ source: r.source, value: x.value })));
  for (const { source, value } of caches) {
    assert.doesNotMatch(value, /immutable/, `${source} pins a module`);
    assert.doesNotMatch(value, /stale-while-revalidate/, `${source} serves stale past the window`);
  }
  const moduleRule = caches.find((c) => c.source !== '/(.*)' && !c.source.startsWith('/api/'));
  assert.ok(moduleRule, 'no module cache rule');
  const age = Number(/max-age=(\d+)/.exec(moduleRule.value)?.[1]);
  assert.ok(Number.isInteger(age) && age <= 300, `module max-age ${age} is over 300 s`);
});

test('robots.txt lets everyone in except the weather function, and neither the page nor vercel.json asks to stay out', () => {
  assert.match(read('src/robots.txt'), /^User-agent: \*\nAllow: \/\nDisallow: \/api\/\n?$/);
  const html = read('src/index.html');
  assert.ok(!html.includes('name="robots"'), 'a robots meta');
  assert.ok(!/noindex/i.test(html), 'noindex in the page');
  assert.ok(!/X-Robots-Tag/i.test(read('vercel.json')), 'X-Robots-Tag in vercel.json');
});

const once = (html, needle) => assert.equal(html.split(needle).length - 1, 1, needle);
const pngSize = (file) => {
  const b = readFileSync(join(ROOT, file));
  assert.deepEqual([...b.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${file}: PNG signature`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

test('the page introduces itself for a link preview', () => {
  const html = read('src/index.html');
  const description = JSON.parse(read('package.json')).description;
  once(html, '<meta name="description"');
  once(html, `<meta name="description" content="${description}">`);
  once(html, 'rel="canonical"');
  once(html, `<link rel="canonical" href="${LIVE}/">`);
  once(html, `<meta property="og:url" content="${LIVE}/">`);
  once(html, `<meta property="og:image" content="${LIVE}/share.jpg">`);
  once(html, '<meta property="og:title" content="Jars">');
  once(html, '<meta property="og:type" content="website">');
  once(html, `<meta property="og:description" content="${description}">`);
  once(html, '<meta name="twitter:card" content="summary_large_image">');
  // The declared size is the picture's own: read it from the JPEG's SOF marker.
  const jpg = readFileSync(join(ROOT, 'src/share.jpg'));
  let at = 2;
  while (at < jpg.length && !(jpg[at + 1] >= 0xc0 && jpg[at + 1] <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(jpg[at + 1]))) at += 2 + jpg.readUInt16BE(at + 2);
  assert.ok(at < jpg.length, 'no SOF marker in share.jpg');
  const [jh, jw] = [jpg.readUInt16BE(at + 5), jpg.readUInt16BE(at + 7)];
  once(html, `<meta property="og:image:width" content="${jw}">`);
  once(html, `<meta property="og:image:height" content="${jh}">`);
  once(html, 'content="Three glowing glass jars on a wooden table in a dark shed: Warsaw, Nazaré and El Chaltén."');
  // Exactly three absolute addresses start with LIVE; the only other one allowed
  // is the existing Open-Meteo credit link.
  const urls = html.match(/https?:\/\/[^"' ]+/g) || [];
  assert.equal(urls.filter((u) => u.startsWith(LIVE)).length, 3, 'three live addresses');
  const others = urls.filter((u) => !u.startsWith(LIVE));
  assert.deepEqual(others, ['https://open-meteo.com/'], 'an unexpected absolute address');
  assert.deepEqual(readFileSync(join(ROOT, 'src/share.jpg')), readFileSync(join(ROOT, 'docs/images/table.jpg')));
});

test('the icons and the manifest are served from src/', () => {
  const html = read('src/index.html');
  once(html, '<link rel="icon" href="icons/jar.svg" type="image/svg+xml">');
  once(html, '<link rel="icon" href="icons/jar-192.png" type="image/png" sizes="192x192">');
  once(html, '<link rel="apple-touch-icon" href="icons/jar-180.png">');
  once(html, '<link rel="manifest" href="manifest.webmanifest">');
  assert.deepEqual(readFileSync(join(ROOT, 'src/icons/jar.svg')), readFileSync(join(ROOT, 'docs/images/jar-icon.svg')));
  assert.deepEqual(pngSize('src/icons/jar-180.png'), [180, 180]);
  assert.deepEqual(pngSize('src/icons/jar-192.png'), [192, 192]);
  assert.deepEqual(pngSize('src/icons/jar-512.png'), [512, 512]);
  const manifest = JSON.parse(read('src/manifest.webmanifest'));
  const page = '#' + PALETTE.page.map((c) => c.toString(16).padStart(2, '0')).join('');
  assert.equal(manifest.name, 'Jars');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, page);
  assert.equal(manifest.background_color, page);
  // the install manifest also carries a scalable SVG (see test/install.test.js); every PNG is the size it says
  const pngs = manifest.icons.filter((icon) => icon.type === 'image/png');
  assert.ok(pngs.length >= 2);
  for (const icon of pngs) {
    const [w, h] = pngSize(`src/${icon.src.replace(/^\//, '')}`);
    assert.equal(icon.sizes, `${w}x${h}`, icon.src);
  }
  // the root .gitignore drops *.png; src/icons/ takes its PNGs back
  assert.ok(read('.gitignore').split('\n').includes('*.png') && read('src/icons/.gitignore').split('\n').includes('!*.png'), '.gitignore swallows the icons');
  const c = headersFor('/manifest.webmanifest')['content-security-policy'];
  assert.ok(c.startsWith("default-src 'self'"));
  // the install card names manifest-src explicitly; it may only ever be the page's own origin
  assert.ok(!c.includes('manifest-src') || c.includes("manifest-src 'self';"));
});

test('the page credits Open-Meteo with one outbound link and the chrome\'s own lettering', () => {
  const html = read('src/index.html');
  assert.equal(html.split('id="credit"').length - 1, 1);
  const tag = /<a\b[^>]*id="credit"[^>]*>([^<]*)<\/a>/.exec(html);
  assert.ok(tag, 'no #credit link');
  assert.ok(tag[0].includes('href="https://open-meteo.com/"'));
  assert.ok(tag[0].includes('target="_blank"'));
  assert.ok(tag[0].includes('rel="noopener noreferrer"'));
  assert.ok(!/\bhidden\b/.test(tag[0].slice(0, tag[0].indexOf('>'))), 'the credit is never hidden');
  assert.equal(tag[1], 'Weather data by Open-Meteo');
  assert.ok(!/\bfetch\s*\(\s*['"`]\s*(https?:|\/\/)/.test(html), 'the href is navigation, not a fetch');
  const css = read('src/style.css');
  const rule = /^#credit \{([^}]*)\}/m.exec(css);
  assert.ok(rule, 'no #credit rule');
  for (const want of ['position: fixed', 'env(safe-area-inset-top', 'env(safe-area-inset-right', 'var(--tag-ink']) assert.ok(rule[1].includes(want), want);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(rule[1]), 'colour literal in #credit');
  assert.equal((css.match(/ui-monospace/g) || []).length, 3);
});

test('the dev server serves the production headers on every path', () => {
  for (const p of ['/', '/main.js', '/api/weather', '/cities/warsaw/index.js', '/robots.txt']) {
    const h = headersFor(p);
    assert.ok((h['content-security-policy'] || '').startsWith("default-src 'self'"), `${p}: no CSP`);
    assert.equal(h['x-robots-tag'], undefined, `${p}: robots header`);
  }
});

// The lines under a top-level YAML key, up to the next unindented line.
const topBlock = (text, key) => {
  const m = text.match(new RegExp('^' + key + ':\\n((?:[ \\t].*\\n|\\n)*)', 'm'));
  return m ? m[1] : '';
};

test('Deploy waits on the gates and publishes previews and production with the CLI', () => {
  const d = read('.github/workflows/deploy.yml');
  for (const want of ['vercel deploy --prebuilt --prod', 'environment: production', 'needs: gates',
    'uses: ./.github/workflows/ci.yml', 'VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID',
    'head.repo.full_name == github.repository']) {
    assert.ok(d.includes(want), `deploy.yml lacks ${want}`);
  }
  for (const bad of ['neon', 'pnpm', 'db:migrate']) assert.ok(!d.toLowerCase().includes(bad), `deploy.yml mentions ${bad}`);
});

test('ci.yml starts only when Deploy calls it, so the gates run once per push', () => {
  const ci = read('.github/workflows/ci.yml');
  const on = topBlock(ci, 'on');
  assert.match(on, /^\s+workflow_call:/m);
  assert.doesNotMatch(on, /pull_request|push:/, 'ci.yml must not start on its own');
  assert.equal(topBlock(ci, 'concurrency'), '');
  assert.ok(!/^concurrency:/m.test(ci), 'the only concurrency rule belongs to deploy.yml');
});

test('Deploy is the one run per push: it starts on PRs and main, and cancels only superseded PR runs', () => {
  const d = read('.github/workflows/deploy.yml');
  const on = topBlock(d, 'on');
  assert.match(on, /^\s+pull_request:/m);
  assert.match(on, /^\s+push:\n\s+branches: \[main\]/m);
  const c = topBlock(d, 'concurrency');
  assert.match(c, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  const gates = d.slice(d.indexOf('  gates:'), d.indexOf('  preview:'));
  assert.match(gates, /uses: \.\/\.github\/workflows\/ci\.yml/);
  assert.doesNotMatch(gates, /^\s+if:/m, 'the gates must run for fork PRs too');
});

test('the Vercel CLI that sees the token comes from a lockfile, installed in a step without the token', () => {
  const d = read('.github/workflows/deploy.yml');
  assert.doesNotMatch(d, /npm i(?:nstall)? -g vercel/, 'a global install pins only the top package');
  assert.ok(!d.includes('vercel@latest'), 'deploy.yml installs vercel@latest');
  const pkg = JSON.parse(read('.github/vercel-cli/package.json'));
  assert.match(pkg.dependencies.vercel, /^\d+\.\d+\.\d+$/, 'the CLI version is not exact');
  const lock = JSON.parse(read('.github/vercel-cli/package-lock.json'));
  assert.equal(lock.packages['node_modules/vercel'].version, pkg.dependencies.vercel);
  assert.ok(Object.values(lock.packages).filter((p) => p.version).every((p) => p.integrity), 'a locked package has no hash');
  const steps = d.split(/\n      - /);
  const installs = steps.filter((s) => s.includes('npm ci --prefix .github/vercel-cli'));
  assert.equal(installs.length, 2, 'expected one CLI install per deploy job');
  for (const s of installs) assert.ok(!s.includes('VERCEL_TOKEN'), 'the install step sees the token');
});

test('only the preview job may write to pull requests', () => {
  const d = read('.github/workflows/deploy.yml');
  assert.doesNotMatch(topBlock(d, 'permissions'), /write/, 'the workflow-wide permissions grant a write');
  const preview = d.slice(d.indexOf('  preview:'), d.indexOf('  production:'));
  const production = d.slice(d.indexOf('  production:'));
  assert.match(preview, /pull-requests: write/);
  assert.doesNotMatch(production, /write/);
});

test('the preview link is one comment per PR, updated in place', () => {
  const d = read('.github/workflows/deploy.yml');
  assert.ok(d.includes('<!-- jar-preview -->'), 'no hidden marker on the preview comment');
  for (const call of ['listComments', 'updateComment', 'createComment']) assert.ok(d.includes(call), `no ${call}`);
  assert.ok(d.includes("c.user.login === 'github-actions[bot]'"), 'the finder must only reuse the Actions bot\'s own comment');
  assert.equal(d.split('Preview: ').length - 1, 1, 'the comment body should say Preview: once');
  assert.ok(d.includes('PREVIEW_URL: ${{ steps.vercel.outputs.url }}') && !d.includes('Preview: ${{'),
    'the URL reaches the script through env, never an inline expression');
});

test('the headers never deny fullscreen or the screen wake lock', () => {
  // Frame mode needs both; with no Permissions-Policy the default allowlist
  // is the page itself. A future policy must not switch either off.
  const pp = header('Permissions-Policy');
  if (pp) {
    assert.doesNotMatch(pp, /fullscreen=\(\)/);
    assert.doesNotMatch(pp, /screen-wake-lock=\(\)/);
  }
  assert.deepEqual(csp()['connect-src'], ["'self'"]);
  assert.deepEqual(csp()['manifest-src'], ["'self'"], 'the install manifest is read from the page\'s own address');
  assert.ok(header('Content-Security-Policy').startsWith("default-src 'self'"));
});

test('every path pins HTTPS and switches off the device features the page never uses', () => {
  assert.match(header('Strict-Transport-Security') || '', /^max-age=(\d{8,})/, 'no HSTS of a year or more');
  const pp = header('Permissions-Policy') || '';
  for (const f of ['camera', 'microphone', 'geolocation']) assert.ok(pp.includes(`${f}=()`), `${f} is not switched off`);
});

test('the gates file runs the page gates', () => {
  const ci = read('.github/workflows/ci.yml');
  for (const want of ['npm ci', 'npm run lint', 'npm test', 'npm run smoke', 'SMOKE_TIMING', 'workflow_call']) {
    assert.ok(ci.includes(want), `ci.yml lacks ${want}`);
  }
  for (const bad of ['pnpm', 'typecheck', 'db:migrate', 'DATABASE_URL']) assert.ok(!ci.includes(bad), `ci.yml mentions ${bad}`);
});
