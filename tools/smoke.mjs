// Adapted from Memory Lane (vir-sunset) tools/smoke.mjs, 2026-10-18
// Smoke check: the real page in headless Chromium. Starts tools/serve.mjs on a
// free port with a stub standing in for the weather vendor, and routes
// /api/weather in the browser to a fixture, so nothing touches the network.
// Checks the table, the label (temperature and Warsaw's own time), the lift,
// Escape and Back, the deep link, determinism, the light on the table, the
// degraded page (weather failing), and a phone held upright and sideways and
// a tablet, and the five-day forecast card of the lifted jar (beside the jar on
// a laptop, below it on a phone, absent on the table, dashes without a daily
// block). Writes screenshots to test-output/.
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';
import { localTimeText, localDate } from '../src/placeclock.js';
import { normalise } from '../api/weather.js';
import { dayName, nextFlashPeak, cloudDrift } from '../src/weather.js';
import { PLACES } from '../src/cities/places.js';

const OUT = 'test-output';
const failures = [];

function check(ok, what) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
}

// A frame-time budget. SMOKE_TIMING=off logs it as `skip` and never fails.
function timed(ok, what) {
  if (process.env.SMOKE_TIMING === 'off') console.log(`skip  ${what}`);
  else check(ok, what);
}

async function launch() {
  try {
    return await chromium.launch();
  } catch (first) {
    try {
      return await chromium.launch({ channel: 'chrome' });
    } catch {
      throw new Error(`No Chromium for playwright-core. Run: npx playwright-core install chromium-headless-shell\n${first.message}`);
    }
  }
}

const fixtureText = await readFile(new URL('../test/fixtures/weather.json', import.meta.url), 'utf8');
const fixture = JSON.parse(fixtureText);

// The browser-side route: the tidy body the real function would send, built
// from the vendor fixture by the real normaliser so the smoke sees its shape.
// The fixture's five days, re-dated to start on Warsaw's today so the card's
// first row is always the fixture's first row, whenever the smoke runs.
// Stepped on the calendar (UTC arithmetic on y/m/d), so DST and the runner's
// zone cannot repeat or skip a date.
const [y0, m0, d0] = localDate(Date.now(), 'Europe/Warsaw').split('-').map(Number);
const days = [0, 1, 2, 3, 4].map((i) => new Date(Date.UTC(y0, m0 - 1, d0 + i)).toISOString().slice(0, 10));
const dated = { ...fixture, daily: { ...fixture.daily, time: days } };
const cloudyWind = JSON.parse(await readFile(new URL('../test/fixtures/weather-cloudy-wind.json', import.meta.url), 'utf8'));
const routeWeather = (page, mode = 'fixture') => page.route('**/api/weather', (route) => {
  if (mode === 'fail') return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
  let payload = dated;
  if (mode === 'clear') payload = { ...dated, current: { ...fixture.current, temperature_2m: 21.4, weather_code: 0, cloud_cover: 5 } };
  if (mode === 'cloudwind') payload = cloudyWind;
  if (mode === 'cloudcalm') payload = { ...cloudyWind, current: { ...cloudyWind.current, wind_speed_10m: 0 } };
  if (mode === 'nodaily') payload = { ...dated, daily: undefined };
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(normalise(payload, PLACES)) });
});

// A weather fixture file (vendor shape) served through the real normaliser.
const fixtureFile = async (name) => JSON.parse(await readFile(new URL(`../test/fixtures/${name}`, import.meta.url), 'utf8'));
const routeFile = async (page, name) => {
  const payload = await fixtureFile(name);
  return page.route('**/api/weather', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(normalise(payload, PLACES)) }));
};
// A tidy body for one Warsaw answer, as __jar.applyWeather takes it.
const tidy = (code, cover, temperature = 9) => ({ v: 1, cities: { warsaw: { temperature, code, cloudCover: cover, isDay: 1, windSpeed: 3, windDir: 180 } } });
// Mean luminance of the jar's body on the table, and of the strip under its foot.
const jarLum = async (page) => {
  const d = await page.evaluate(() => window.__jar.dpr);
  const c = await jarCentre(page);
  return strip(page, (c.x - 20) * d, (c.y - 30) * d, 40 * d, 60 * d);
};
const footLum = async (page) => {
  const f = await page.evaluate(() => window.__jar.foot('warsaw'));
  return strip(page, f.x - 20, f.y + 4, 40, 12);
};

const DASHES = (cells) => cells.length === 5 && cells.every((c) => c.day === '—' && c.high === '—°' && c.low === '—°');
const inside = (r, w, h) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h;

function watch(page, origin) {
  const errors = [];
  const off = [];
  const all = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    all.push(r.url());
    if (!r.url().startsWith(origin) && !r.url().startsWith('data:')) off.push(r.url());
  });
  return { errors, off, all };
}

const ready = (page) => page.waitForFunction(() => window.__jar && window.__jar.ready, null, { timeout: 15000 });
const viewIs = (page, view, timeout = 3000) =>
  page.waitForFunction((v) => window.__jar.view === v && !window.__jar.lifting, view, { timeout }).then(() => true, () => false);
const settled = (page, timeout = 3000) =>
  page.waitForFunction(() => !window.__jar.lifting, null, { timeout }).then(() => true, () => false);
const labelIs = (page, i, value, timeout = 5000) =>
  page.waitForFunction(([k, v]) => window.__jar.labels.warsaw && window.__jar.labels.warsaw[k] === v, [i, value], { timeout }).then(() => true, () => false);

// CSS-px centre of the jar's body, from its foot.
const jarCentre = (page) => page.evaluate(() => {
  const f = window.__jar.foot('warsaw');
  return { x: f.x / window.__jar.dpr, y: f.y / window.__jar.dpr - 150 };
});

// Mean luminance of a w x h strip with its top-left at canvas px (x, y).
const strip = (page, x, y, w, h) => page.evaluate(([sx, sy, sw, sh]) => {
  const c = document.getElementById('view');
  const d = c.getContext('2d').getImageData(Math.round(sx), Math.round(sy), sw, sh).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  return sum / (d.length / 4);
}, [x, y, w, h]);

// The (2r+1)^2 canvas px around a body-share point of a jar, as [r, g, b] rows.
const patch = (page, id, bx, by, r) => page.evaluate(([jar, x, y, rad]) => {
  const c = document.getElementById('view');
  const p = window.__jar.bodyPx(jar, x, y);
  const d = c.getContext('2d').getImageData(Math.round(p.x) - rad, Math.round(p.y) - rad, rad * 2 + 1, rad * 2 + 1).data;
  const rows = [];
  for (let i = 0; i < d.length; i += 4) rows.push([d[i], d[i + 1], d[i + 2]]);
  return rows;
}, [id, bx, by, r]);
const some = (rows, f) => rows.some(([r, g, b]) => f(r, g, b));
const all = (rows, f) => rows.every(([r, g, b]) => f(r, g, b));
const luma = (rows) => rows.reduce((s, [r, g, b]) => s + 0.2126 * r + 0.7152 * g + 0.0722 * b, 0) / rows.length;

const medianFrameMs = (page) => page.evaluate(() => {
  const t = [];
  for (let i = 0; i < 9; i++) { window.__jar.pin(Date.now() + i * 60000); t.push(window.__jar.lastFrameMs); }
  t.sort((a, b) => a - b);
  return t[4];
});

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, 'phone'), { recursive: true });

const vendorCalls = [];
const { server, port } = await startServer({ port: 0, fetchImpl: async (u) => { vendorCalls.push(String(u)); return { ok: true, json: async () => fixture }; } });
const origin = `http://127.0.0.1:${port}`;
const browser = await launch();

try {
  // ---- desktop ------------------------------------------------------------
  const desk = await browser.newContext({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 });
  const page = await desk.newPage();
  const seen = watch(page, origin);
  await routeWeather(page);
  const before = Date.now();
  await page.goto(`${origin}/`);
  await ready(page);
  check(await page.evaluate(() => window.__jar.view === 'table' && window.__jar.look === 'lantern'), 'table renders');
  check(await labelIs(page, 1, '12°'), 'warsaw label shows fixture temperature');
  const time = await page.evaluate(() => window.__jar.labels.warsaw[2]);
  const okTimes = new Set([-1, 0, 1].flatMap((m) => [localTimeText(before + m * 60000, 'Europe/Warsaw'), localTimeText(Date.now() + m * 60000, 'Europe/Warsaw')]));
  check(/^\d\d:\d\d$/.test(time) && okTimes.has(time), `warsaw label shows a Warsaw time (${time})`);
  check(await page.evaluate(() => window.__jar.labels.warsaw[0] === 'WARSAW'), 'warsaw label carries the city name');
  await page.screenshot({ path: join(OUT, 'table.png') });

  // light on the table: the strip just below the jar's foot is brighter than one far from any jar
  const foot = await page.evaluate(() => window.__jar.foot('warsaw'));
  const far = await page.evaluate(() => window.__jar.toCanvas(1380, 760));
  const near = await strip(page, foot.x - 20, foot.y + 4, 40, 12);
  const away = await strip(page, far.x - 20, far.y, 40, 12);
  check(near > away + 1, `jar lights the table (${near.toFixed(1)} vs ${away.toFixed(1)})`);

  // determinism
  const T = Date.UTC(2026, 5, 15, 10, 30);
  await page.evaluate((t) => window.__jar.pin(t), T);
  const h1 = await page.evaluate(() => window.__jar.hash());
  await page.evaluate((t) => window.__jar.pin(t), T);
  const h2 = await page.evaluate(() => window.__jar.hash());
  check(h1 === h2, 'same moment draws the same pixels');
  await page.reload();
  await ready(page);
  await labelIs(page, 1, '12°');

  // lift on click, Escape, Back
  const c = await jarCentre(page);
  await page.mouse.click(c.x, c.y);
  check((await viewIs(page, 'jar')) && page.url().includes('?jar=warsaw'), 'jar lifts on click');
  await settled(page);
  await page.screenshot({ path: join(OUT, 'warsaw-rain.png') });
  // The page's own clock, read beside the card: a Warsaw midnight between the
  // route and the check drops the first fixture row, exactly as the page does.
  const [fc, pageNow] = await page.evaluate(() => [window.__jar.forecast, Date.now()]);
  const todayThere = localDate(pageNow, 'Europe/Warsaw');
  const rows = [['14°', '9°', 'rain'], ['12°', '5°', 'cloud'], ['9°', '2°', 'clear'], ['2°', '-2°', 'snow'], ['8°', '3°', 'storm']];
  const want = days.map((d, i) => [dayName(d), ...rows[i]]).filter((_, i) => days[i] >= todayThere);
  while (want.length < 5) want.push(['—', '—°', '—°', 'cloud']);
  check(!!fc && JSON.stringify(fc.cells.map((k) => [k.day, k.high, k.low, k.kind])) === JSON.stringify(want), 'forecast card shows five fixture days when lifted');
  const dfoot = await page.evaluate(() => window.__jar.foot('warsaw'));
  const dcanvas = await page.evaluate(() => [document.getElementById('view').width, document.getElementById('view').height]);
  check(!!fc && fc.rect.x > dfoot.x && inside(fc.rect, dcanvas[0], dcanvas[1]), 'desktop forecast card sits beside the jar and fits');
  await page.keyboard.press('Escape');
  check((await viewIs(page, 'table')) && !page.url().includes('jar='), 'escape lowers the jar');
  check(await page.evaluate(() => window.__jar.forecast === null), 'forecast card is absent on the table');
  await page.mouse.click(c.x, c.y);
  await viewIs(page, 'jar');
  await page.goBack();
  check(await viewIs(page, 'table'), 'browser back lowers the jar');
  await settled(page);
  timed(await medianFrameMs(page) < 33, 'desktop frame time under 33 ms');

  const deep = await desk.newPage();
  const deepSeen = watch(deep, origin);
  await routeWeather(deep, 'clear');
  await deep.goto(`${origin}/?jar=warsaw`);
  await ready(deep);
  check(await deep.evaluate(() => window.__jar.view === 'jar'), '?jar=warsaw opens lifted');
  await labelIs(deep, 1, '21°');
  await settled(deep);
  await deep.screenshot({ path: join(OUT, 'warsaw-lifted.png') });
  // ---- Warsaw floodlit nocturne: pinned night and morning, pixels sampled ----
  const noct = await desk.newPage();
  const noctSeen = watch(noct, origin);
  await routeWeather(noct, 'clear');
  await noct.goto(`${origin}/?jar=warsaw`);
  await ready(noct);
  await settled(noct);
  const T_NIGHT = Date.UTC(2026, 5, 15, 23, 30); // 01:30 in Warsaw: deep night
  const T_DAY = Date.UTC(2026, 5, 15, 8, 30); // 10:30 in Warsaw: morning, the sun on the left
  await noct.evaluate((t) => window.__jar.pin(t), T_NIGHT);
  const gold = (r, g, b) => r >= 140 && r >= g + 20 && r >= b + 60;
  const blue = (r, g, b) => b >= 180 && b >= r + 40;
  const red = (r, g, b) => r >= 180 && r >= g + 60 && r >= b + 60;
  const warm = (r, g, b) => r >= b + 30 && r >= 90;
  const bluish = (r, g, b) => b >= r + 30 && b >= 90;
  const rim = (r, g, b) => r >= 200 && g >= 140 && g <= 210 && b <= 130;
  check(all(await patch(noct, 'warsaw', 0.5, 0.47, 2), gold), 'Palace glows gold at night');
  check(some(await patch(noct, 'warsaw', 0.271, 0.19, 2), blue), 'Varso crown glows blue');
  check(some(await patch(noct, 'warsaw', 0.271, 0.07, 4), red), 'red aviation light at the needle tip');
  check(some(await patch(noct, 'warsaw', 0.5, 0.66, 3), warm), 'the Palace reflects in the river above the label');
  check(some(await patch(noct, 'warsaw', 0.271, 0.66, 3), bluish), 'Varso reflects in the river');
  check(some(await patch(noct, 'warsaw', 0.147, 0.56, 8), rim), 'the Mermaid stands rim-lit left of the label');
  check(some(await patch(noct, 'warsaw', 0.112, 0.56, 6), rim), 'the Mermaid is outlined on her left too, against the tower behind her');
  const edge = luma(await patch(noct, 'warsaw', 0.0425, 0.4, 1));
  const oldSpot = luma(await patch(noct, 'warsaw', 0.15, 0.4, 1)); // where the left streak used to sit
  check(edge > oldSpot + 10, 'the streaks hug the glass edges');
  const hashA = await noct.evaluate((t) => { window.__jar.pin(t); return window.__jar.hash(); }, T_NIGHT);
  const hashB = await noct.evaluate((t) => { window.__jar.pin(t); return window.__jar.hash(); }, T_NIGHT);
  check(hashA === hashB, 'the nocturne draws the same pixels at the same moment');
  await noct.screenshot({ path: join(OUT, 'warsaw-night.png') });
  await noct.evaluate((t) => window.__jar.pin(t), T_DAY);
  check(all(await patch(noct, 'warsaw', 0.5, 0.47, 2), (r, g, b) => b >= r), 'Palace is a cool silhouette by day');
  check(!some(await patch(noct, 'warsaw', 0.271, 0.07, 4), red), 'no aviation light by day');
  const rimEdge = luma(await patch(noct, 'warsaw', 0.5 - 0.188 + 0.003, 0.57, 1));
  const rimBody = luma(await patch(noct, 'warsaw', 0.5, 0.57, 1));
  check(rimEdge - rimBody >= 40, 'rim light on the sun side in the morning');
  check(all(await patch(noct, 'warsaw', 0.5, 0.66, 3), (r, g, b) => b >= r + 20), 'river shows blue above the label by day');
  await noct.screenshot({ path: join(OUT, 'warsaw-morning.png') });
  check(noctSeen.errors.length === 0, `no console errors on the nocturne page${noctSeen.errors.length ? `: ${noctSeen.errors.join(' | ')}` : ''}`);

  check(deepSeen.errors.length === 0 && seen.errors.length === 0, `no console errors on the desktop pages${[...seen.errors, ...deepSeen.errors].length ? `: ${[...seen.errors, ...deepSeen.errors].join(' | ')}` : ''}`);
  check(seen.off.length === 0 && deepSeen.off.length === 0, `no off-origin request${seen.off.length ? `: ${seen.off.join(', ')}` : ''}`);
  check(seen.all.some((u) => u.endsWith('/api/weather')), 'the page asked its own /api/weather');
  await desk.close();

  // ---- degraded: the weather answer fails -----------------------------------
  const bad = await browser.newContext({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 });
  const bp = await bad.newPage();
  const badSeen = watch(bp, origin);
  await routeWeather(bp, 'fail');
  await bp.goto(`${origin}/`);
  await ready(bp);
  await bp.waitForTimeout(600);
  check(await labelIs(bp, 1, '—°', 2000), 'label degrades to a dash');
  const hashes = await bp.evaluate(() => [window.__jar.hash(), window.__jar.blankHash()]);
  check(hashes[0] !== hashes[1], 'jar still draws');
  await bp.screenshot({ path: join(OUT, 'warsaw-no-weather.png') });
  check(badSeen.off.length === 0, 'the degraded page stays on its own origin');
  await bp.evaluate(() => window.__jar.lift('warsaw'));
  await viewIs(bp, 'jar');
  check(await bp.evaluate((d) => { const f = window.__jar.forecast; return !!f && f.cells.length === 5 && f.cells.every((c) => c.day === d[0] && c.high === d[1]); }, ['—', '—°']), 'degraded page lifts with a card of dashes');
  await bad.close();

  // ---- no daily block: the card is dashes, nothing errors ---------------------
  const nod = await browser.newContext({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 });
  const np = await nod.newPage();
  const nSeen = watch(np, origin);
  await routeWeather(np, 'nodaily');
  await np.goto(`${origin}/`);
  await ready(np);
  await labelIs(np, 1, '12°');
  await np.evaluate(() => window.__jar.lift('warsaw'));
  await viewIs(np, 'jar');
  await settled(np);
  const nf = await np.evaluate(() => window.__jar.forecast);
  check(!!nf && DASHES(nf.cells) && nSeen.errors.length === 0, 'forecast card shows dashes without a daily block');
  await nod.close();

  // ---- phone held upright ---------------------------------------------------
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const pp = await phone.newPage();
  const pSeen = watch(pp, origin);
  await routeWeather(pp);
  await pp.goto(`${origin}/`);
  await ready(pp);
  await labelIs(pp, 1, '12°');
  const fit = await pp.evaluate(() => {
    const r = document.getElementById('view').getBoundingClientRect();
    const el = document.scrollingElement;
    return { w: r.width, h: r.height, scrollW: el.scrollWidth, scrollH: el.scrollHeight, iw: innerWidth, ih: innerHeight, portrait: window.__jar.framing.portrait };
  });
  check(fit.w === fit.iw && fit.h === fit.ih && fit.scrollW <= fit.iw && fit.scrollH <= fit.ih && fit.portrait, 'phone fits (no scroll)');
  await pp.screenshot({ path: join(OUT, 'phone', 'table.png') });

  // swipe: drag the row with real touch input and watch it follow, then settle
  const cdp = await phone.newCDPSession(pp);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', 300, 500);
  for (let i = 1; i <= 6; i++) await touch('touchMove', 300 - i * 20, 500);
  const mid = await pp.evaluate(() => window.__jar.pos);
  await touch('touchEnd', 180, 500);
  const back = await pp.waitForFunction(() => Math.abs(window.__jar.pos) < 0.001 && window.__jar.index === 0, null, { timeout: 3000 }).then(() => true, () => false);
  check(mid > 0.02 && back && (await pp.evaluate(() => window.__jar.view)) === 'table', `phone swipe settles (followed to ${mid.toFixed(2)}, then back)`);

  const pc = await jarCentre(pp);
  await pp.touchscreen.tap(pc.x, pc.y);
  check(await viewIs(pp, 'jar'), 'phone tap lifts');
  await settled(pp);
  await pp.screenshot({ path: join(OUT, 'phone', 'lifted.png') });
  const pf = await pp.evaluate(() => window.__jar.forecast);
  const pfoot = await pp.evaluate(() => window.__jar.foot('warsaw'));
  const pcanvas = await pp.evaluate(() => [document.getElementById('view').width, document.getElementById('view').height]);
  check(!!pf && pf.rect.y > pfoot.y && inside(pf.rect, pcanvas[0], pcanvas[1]), 'phone forecast card sits below the jar and fits');
  const box = await pp.evaluate(() => { const r = document.getElementById('back').getBoundingClientRect(); return { w: r.width, h: r.height, vis: !document.getElementById('back').hidden }; });
  check(box.vis && box.w >= 44 && box.h >= 44, `phone targets are 44px (back ${box.w}x${box.h})`);
  await pp.touchscreen.tap(30, 30);
  check(await viewIs(pp, 'table'), 'phone back button lowers the jar');
  timed(await medianFrameMs(pp) < 25, 'phone frame time under 25 ms');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  timed(await medianFrameMs(pp) < 66, 'phone frame time under 66 ms at 4x throttle');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  check(pSeen.errors.length === 0 && pSeen.off.length === 0, `no console errors or off-origin requests on the phone${pSeen.errors.length ? `: ${pSeen.errors.join(' | ')}` : ''}`);
  await phone.close();

  // ---- phone held sideways --------------------------------------------------
  const land = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const lp = await land.newPage();
  await routeWeather(lp);
  await lp.goto(`${origin}/`);
  await ready(lp);
  const lf = await lp.evaluate(() => ({ f: window.__jar.framing, sw: document.scrollingElement.scrollWidth, iw: innerWidth }));
  check(!lf.f.portrait && lf.f.slice.w === 1600 && lf.sw <= lf.iw, 'landscape letterboxes');
  await land.close();

  // ---- tablet upright --------------------------------------------------------
  const tab = await browser.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const tp = await tab.newPage();
  await routeWeather(tp);
  await tp.goto(`${origin}/`);
  await ready(tp);
  const tf = await tp.evaluate(() => window.__jar.framing);
  check(tf.portrait && Math.abs(tf.slice.w - 1000 * (820 / 1180)) < 1e-6, 'tablet slice');
  await tab.close();

  // ---- weather nuances: lightning, wind lean, dew ------------------------------
  const T0 = Date.UTC(2026, 5, 15, 22, 30);
  const PEAK = nextFlashPeak(95, T0);
  const pin = (pg, ms) => pg.evaluate((t) => window.__jar.pin(t), ms);
  const jarHash = (pg) => pg.evaluate(() => window.__jar.hash());

  const stormCtx = await browser.newContext({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 });
  const sp = await stormCtx.newPage();
  const stormSeen = watch(sp, origin);
  await routeFile(sp, 'weather-storm.json');
  await sp.goto(`${origin}/`);
  await ready(sp);
  await labelIs(sp, 1, '17°');
  await pin(sp, PEAK);
  const sa = await jarHash(sp);
  await pin(sp, PEAK);
  check(sa === (await jarHash(sp)), 'storm draws the same pixels at the same moment');
  const lumPeak = await jarLum(sp);
  const flashPeak = await sp.evaluate(() => window.__jar.flash('warsaw'));
  const footPeak = await footLum(sp);
  await pin(sp, PEAK + 5000);
  const lumCalm = await jarLum(sp);
  const flashCalm = await sp.evaluate(() => window.__jar.flash('warsaw'));
  const footCalm = await footLum(sp);
  check(lumPeak > lumCalm + 1 && flashPeak >= 0.99 && flashCalm === 0, `storm flash lights the jar (${lumPeak.toFixed(1)} vs ${lumCalm.toFixed(1)})`);
  check(footPeak > footCalm, `storm spills on the table (${footPeak.toFixed(1)} vs ${footCalm.toFixed(1)})`);
  await sp.emulateMedia({ reducedMotion: 'reduce' });
  await sp.reload();
  await ready(sp);
  await labelIs(sp, 1, '17°');
  await pin(sp, PEAK);
  const soft = await sp.evaluate(() => window.__jar.flash('warsaw'));
  check(soft > 0 && soft <= 0.5, `reduced motion softens the flash (${soft.toFixed(2)})`);
  await sp.emulateMedia({ reducedMotion: 'no-preference' });
  await sp.reload();
  await ready(sp);
  await labelIs(sp, 1, '17°');
  await sp.evaluate(() => window.__jar.lift('warsaw'));
  await viewIs(sp, 'jar');
  await settled(sp);
  await pin(sp, PEAK);
  await sp.screenshot({ path: join(OUT, 'warsaw-storm.png') });
  check(stormSeen.errors.length === 0 && stormSeen.off.length === 0, `no console errors or off-origin requests in the storm${stormSeen.errors.length ? `: ${stormSeen.errors.join(' | ')}` : ''}`);
  await stormCtx.close();

  const windCtx = await browser.newContext({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 });
  const wp = await windCtx.newPage();
  await routeFile(wp, 'weather.json');
  await wp.goto(`${origin}/`);
  await ready(wp);
  await labelIs(wp, 1, '12°');
  await pin(wp, T0);
  const windy = await jarHash(wp);
  await wp.evaluate(() => window.__jar.lift('warsaw'));
  await viewIs(wp, 'jar');
  await settled(wp);
  await pin(wp, T0);
  await wp.screenshot({ path: join(OUT, 'warsaw-wind.png') });
  await wp.evaluate(() => window.__jar.lower());
  await viewIs(wp, 'table');
  await wp.unroute('**/api/weather');
  await routeFile(wp, 'weather-nowind.json');
  await wp.reload();
  await ready(wp);
  await labelIs(wp, 1, '12°');
  await pin(wp, T0);
  check(windy !== (await jarHash(wp)), 'wind slants the rain');
  await windCtx.close();

  const dewCtx = await browser.newContext({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 });
  const dp = await dewCtx.newPage();
  const dewSeen = watch(dp, origin);
  await routeFile(dp, 'weather-fog.json');
  await dp.goto(`${origin}/`);
  await ready(dp);
  await labelIs(dp, 1, '6°');
  const dewBefore = await dp.evaluate(() => window.__jar.dew('warsaw'));
  await pin(dp, T0);
  await dp.evaluate((b) => window.__jar.applyWeather(b), tidy(0, 5));
  const dewFull = await dp.evaluate(() => window.__jar.dew('warsaw'));
  check(dewBefore === 0 && dewFull === 1, 'dew appears after fog clears');
  await pin(dp, T0 + 60000);
  const withDew = await jarHash(dp);
  await dp.evaluate(() => window.__jar.lift('warsaw'));
  await viewIs(dp, 'jar');
  await settled(dp);
  await pin(dp, T0 + 60000);
  await dp.screenshot({ path: join(OUT, 'warsaw-dew.png') });
  await dp.evaluate(() => window.__jar.lower());
  await viewIs(dp, 'table');
  await pin(dp, T0 + 20 * 60000);
  const dewMid = await dp.evaluate(() => window.__jar.dew('warsaw'));
  await pin(dp, T0 + 46 * 60000);
  const dewGone = await dp.evaluate(() => window.__jar.dew('warsaw'));
  check(dewMid > 0 && dewMid < 1 && dewGone === 0, `dew fades out after 45 minutes (${dewMid.toFixed(2)} then ${dewGone})`);
  await dp.evaluate((b) => window.__jar.applyWeather(b), tidy(45, 100, 6));
  await dp.evaluate((b) => window.__jar.applyWeather(b), tidy(0, 5));
  await pin(dp, T0 + 60000);
  check(withDew !== (await jarHash(dp)), 'dew changes the picture');
  check(dewSeen.errors.length === 0 && dewSeen.off.length === 0, 'no console errors or off-origin requests in the dew run');
  await dewCtx.close();

  const pStorm = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const psp = await pStorm.newPage();
  await routeFile(psp, 'weather-storm.json');
  await psp.goto(`${origin}/`);
  await ready(psp);
  await labelIs(psp, 1, '17°');
  await pin(psp, PEAK);
  const pLumPeak = await jarLum(psp);
  await pin(psp, PEAK + 5000);
  const pLumCalm = await jarLum(psp);
  check(pLumPeak > pLumCalm + 1, `phone storm flash lights the jar (${pLumPeak.toFixed(1)} vs ${pLumCalm.toFixed(1)})`);
  await pStorm.close();

  // ---- clouds drift with the wind ------------------------------------------
  const CT = Date.UTC(2026, 5, 15, 10, 30);
  const CD = 9000;
  const driftDelta = async (pg) => {
    await pin(pg, CT);
    const d1 = await pg.evaluate(() => window.__jar.drift('warsaw'));
    await pin(pg, CT + CD);
    const d2 = await pg.evaluate(() => window.__jar.drift('warsaw'));
    return d2 - d1;
  };
  const wantDelta = cloudDrift(30, 270, CT + CD) - cloudDrift(30, 270, CT);
  const cloudPage = async (ctxOpts, mode, reduced = false) => {
    const cx = await browser.newContext(ctxOpts);
    const pg = await cx.newPage();
    if (reduced) await pg.emulateMedia({ reducedMotion: 'reduce' });
    await routeWeather(pg, mode);
    await pg.goto(`${origin}/`);
    await ready(pg);
    await labelIs(pg, 1, '14°');
    return { cx, pg };
  };
  const deskOpts = { viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 };
  const phoneOpts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

  const cw = await cloudPage(deskOpts, 'cloudwind');
  await pin(cw.pg, CT + CD);
  const cwA = await jarHash(cw.pg);
  await pin(cw.pg, CT + CD);
  check(cwA === (await jarHash(cw.pg)), 'windy clouds draw the same pixels at the same moment');
  const windDelta = await driftDelta(cw.pg);
  // CT itself is a whole number of drift widths away from the origin, so the
  // calm-versus-windy picture is compared nine seconds on, where the wind term is 0.075.
  const windHash = await jarHash(cw.pg);
  const cc = await cloudPage(deskOpts, 'cloudcalm');
  await pin(cc.pg, CT + CD);
  const calmHash = await jarHash(cc.pg);
  check(Math.abs(windDelta - wantDelta) < 1e-9 && windHash !== calmHash, `wind moves the clouds (${windDelta.toFixed(4)} jar widths in ${CD} ms)`);
  check((await cw.pg.evaluate(() => window.__jar.cadenceMs)) === 250, 'windy clouds redraw four times a second at most');
  await cw.pg.screenshot({ path: join(OUT, 'warsaw-clouds-wind.png') });
  const calmDelta = await driftDelta(cc.pg);
  check(calmDelta === 0 && (await cc.pg.evaluate(() => window.__jar.drift('warsaw'))) === 0 && (await cc.pg.evaluate(() => window.__jar.cadenceMs)) === 0, "calm clouds keep today's pace");
  const rainCtx = await browser.newContext(deskOpts);
  const rainPg = await rainCtx.newPage();
  await routeWeather(rainPg);
  await rainPg.goto(`${origin}/`);
  await ready(rainPg);
  await labelIs(rainPg, 1, '12°');
  check((await rainPg.evaluate(() => window.__jar.cadenceMs)) === 50, 'rain keeps its own cadence');
  await rainCtx.close();
  await cw.cx.close();
  await cc.cx.close();

  const cr = await cloudPage(deskOpts, 'cloudwind', true);
  const redDelta = await driftDelta(cr.pg);
  check(redDelta > 0 && Math.abs(redDelta - 0.4 * wantDelta) < 1e-9, `reduced motion slows the drift (${redDelta.toFixed(4)})`);
  await cr.cx.close();

  const cpn = await cloudPage(phoneOpts, 'cloudwind');
  const phoneDelta = await driftDelta(cpn.pg);
  check(Math.abs(phoneDelta - wantDelta) < 1e-9, `phone clouds drift with the wind (${phoneDelta.toFixed(4)})`);
  await cpn.cx.close();

  check(vendorCalls.length === 0, 'the smoke never reached the vendor stub (the browser only asks its own route)');
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\nsmoke: ${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nsmoke: all checks passed');
