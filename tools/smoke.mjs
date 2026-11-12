// Adapted from Memory Lane (vir-sunset) tools/smoke.mjs, 2026-10-18
// Smoke check: the real page in headless Chromium. Starts tools/serve.mjs on a
// free port with a stub standing in for the weather vendor, and routes
// /api/weather in the browser to a fixture, so nothing touches the network.
// Checks the table, the label (temperature and Warsaw's own time), the lift,
// Escape and Back, the deep link, determinism, the light on the table, the
// degraded page (weather failing), and a phone held upright and sideways and
// a tablet, and the five-day forecast card of the lifted jar (beside the jar on
// a laptop, below it on a phone, absent on the table, dashes without a daily
// block), with today marked (and named today for screen readers) and the sunrise and sunset, with a sun arc under the sunrise
// and sunset line, and a polite live region that announces a refreshed forecast while a jar is lifted. Two jars stand on the
// table, Warsaw and Nazare (Lisbon time, its wave sized by a stub sea reading):
// both labels, both lifts, the arrow and a phone swipe reaching the second, the
// four swell bands and their surfers, the lighthouse beam at night, and the real moon phase (a new moon and a full
// moon night over Nazare: the moon reported, its brightness on the glass and
// the spoken sentence), and the chalk hint ("tap a jar" / "click a jar") on the table until the first lift.
// The lamplit shed: found by __jar.ambient, the wall is warm at
// the darkest hour and much less by day, the sky in the pane is untinted, the curtain
// covers the pane's left edge, the shelf board and the table front have lit edges,
// the phone sees the same warm wall, and a pinned night draws the same pixels twice.
// Writes screenshots to test-output/.
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';
import { localTimeText, localDate, sunFraction, dayFraction, wallToMs } from '../src/placeclock.js';
import { normalise } from '../api/weather.js';
import { dayName, nextFlashPeak, cloudDrift, cloudTravel } from '../src/weather.js';
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
// The hourly block re-dated the same way: 24 rows on today's local date at HH:00
// and one at tomorrow 00:00, each keeping its own values.
const hourlyOn = (h, day0, day1) => ({ ...h, time: [...Array.from({ length: 24 }, (_, i) => `${day0}T${String(i).padStart(2, '0')}:00`), `${day1}T00:00`] });
const dated = { ...fixture, daily: { ...fixture.daily, time: days }, hourly: hourlyOn(fixture.hourly, days[0], days[1]) };
// Nazare's stand-in answer and the sea reading (4.2 m: a big day), re-dated to Lisbon's today.
const nazareFixture = JSON.parse(await readFile(new URL('../test/fixtures/weather-nazare.json', import.meta.url), 'utf8'));
const marineFixture = JSON.parse(await readFile(new URL('../test/fixtures/marine.json', import.meta.url), 'utf8'));
const [yl, ml, dl] = localDate(Date.now(), 'Europe/Lisbon').split('-').map(Number);
const lisbonDays = [0, 1, 2, 3, 4].map((i) => new Date(Date.UTC(yl, ml - 1, dl + i)).toISOString().slice(0, 10));
// The hourly sea (wave height and sea level) is re-dated the same way: each hour keeps its clock time and
// takes Lisbon's date for its day index in the fixture's own date list. The reading's own hour is
// pinned to 09:00 today, so the 25 scrub rows run from 09:00 (indices 0, 5, 6 -> 4.2, 1.2, 6.5 m).
const marineDated = {
  ...marineFixture,
  current: { ...marineFixture.current, time: `${lisbonDays[0]}T09:00` },
  daily: { ...marineFixture.daily, time: lisbonDays },
  hourly: { ...marineFixture.hourly, time: marineFixture.hourly.time.map((t) => `${lisbonDays[marineFixture.daily.time.indexOf(t.slice(0, 10))]}${t.slice(10)}`) },
};
const nazareDated = { ...nazareFixture, daily: { ...nazareFixture.daily, time: lisbonDays }, hourly: hourlyOn(nazareFixture.hourly, lisbonDays[0], lisbonDays[1]) };
// El Chalten's stand-in answer (cloud 20, 30 km/h from the south-west: a smoking day), re-dated to Rio Gallegos's today.
const chaltenFixture = JSON.parse(await readFile(new URL('../test/fixtures/weather-el-chalten.json', import.meta.url), 'utf8'));
const CHALTEN_ZONE = 'America/Argentina/Rio_Gallegos';
const [yc, mc, dc] = localDate(Date.now(), CHALTEN_ZONE).split('-').map(Number);
const chaltenDays = [0, 1, 2, 3, 4].map((i) => new Date(Date.UTC(yc, mc - 1, dc + i)).toISOString().slice(0, 10));
const chaltenDated = { ...chaltenFixture, daily: { ...chaltenFixture.daily, time: chaltenDays }, hourly: hourlyOn(chaltenFixture.hourly, chaltenDays[0], chaltenDays[1]) };
const nazareCalm = { ...nazareDated, current: { ...nazareFixture.current, wind_speed_10m: 0, cloud_cover: 0, weather_code: 0 } };
// The vendor's three-city answer through the real normaliser, as the function would send it:
// one body per place, in registry order (a missing body leaves its city at EMPTY).
const chaltenCalm = { ...chaltenDated, current: { ...chaltenFixture.current, wind_speed_10m: 0, cloud_cover: 0, weather_code: 0 } };
const threeCity = (payload, nazare = nazareDated, chalten = chaltenDated) => [payload, nazare, chalten];
// Every stubbed answer carries this one fetch time, so the answer is the same on every run.
const FETCHED = Date.UTC(2026, 5, 15, 10, 20);
const bodyOf = (payload, { nazare = nazareDated, marine = marineDated, chalten = chaltenDated } = {}) => JSON.stringify(normalise(threeCity(payload, nazare, chalten), PLACES, FETCHED, marine));
const cloudyWind = JSON.parse(await readFile(new URL('../test/fixtures/weather-cloudy-wind.json', import.meta.url), 'utf8'));
const routeWeather = (page, mode = 'fixture') => page.route('**/api/weather', (route) => {
  if (mode === 'fail') return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
  let payload = dated;
  if (mode === 'clear') payload = { ...dated, current: { ...fixture.current, temperature_2m: 21.4, weather_code: 0, cloud_cover: 5 } };
  if (mode === 'cloudwind') payload = cloudyWind;
  if (mode === 'cloudcalm') payload = { ...cloudyWind, current: { ...cloudyWind.current, wind_speed_10m: 0 } };
  // the page's calm modes keep Nazare calm too, so a still page is still
  const calm = mode === 'cloudcalm';
  if (mode === 'nosun') payload = { ...dated, daily: { ...dated.daily, sunrise: undefined, sunset: undefined } };
  if (mode === 'nodaily') payload = { ...dated, daily: undefined };
  return route.fulfill({ status: 200, contentType: 'application/json', body: bodyOf(payload, { nazare: calm ? nazareCalm : nazareDated, chalten: calm ? chaltenCalm : chaltenDated, marine: mode === 'nosea' ? null : marineDated }) });
});

// A weather fixture file (vendor shape) served through the real normaliser.
const fixtureFile = async (name) => JSON.parse(await readFile(new URL(`../test/fixtures/${name}`, import.meta.url), 'utf8'));
const routeFile = async (page, name) => {
  const payload = await fixtureFile(name);
  return page.route('**/api/weather', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: bodyOf(payload) }));
};
// A tidy body for one Warsaw answer (and optionally Nazare's), as __jar.applyWeather takes it.
const tidy = (code, cover, temperature = 9, more = {}) => ({ v: 1, cities: { warsaw: { temperature, code, cloudCover: cover, isDay: 1, windSpeed: 3, windDir: 180 }, ...more } });
// Nazare, clear and light of wind, with a wave `h` metres high off the coast.
const seaBody = (h) => tidy(0, 5, 9, { nazare: { temperature: 18, code: 0, cloudCover: 5, isDay: 1, windSpeed: 5, windDir: 300, sea: { waveHeight: h, wavePeriod: 12, waveDir: 300 } } });
// El Chalten, as __jar.applyWeather takes it: cloud %, wind km/h from `dir` degrees, a vendor code, a temperature.
const chaltenBody = ({ cloud = 10, wind = 5, dir = 225, code = 0, temperature = 8 } = {}) => tidy(0, 5, 9, { 'el-chalten': { temperature, code, cloudCover: cloud, isDay: 1, windSpeed: wind, windDir: dir } });
// Mean luminance of the jar's body on the table, and of the strip under its foot.
const jarLum = async (page) => {
  const d = await page.evaluate(() => window.__jar.dpr);
  const c = await jarCentre(page);
  return strip(page, (c.x - 20) * d, (c.y - 30) * d, 40 * d, 60 * d);
};
const footLum = async (page, id = 'warsaw') => {
  const f = await page.evaluate((c) => window.__jar.foot(c), id);
  return strip(page, f.x - 20, f.y + 4, 40, 12);
};

const DASHES = (cells) => cells.length === 5 && cells.every((c) => c.day === '—' && c.high === '—°' && c.low === '—°');
const inside = (r, w, h) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h;
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// The Open-Meteo credit: visible, inside the screen, clear of every visible control and, lifted, of the jar and its card.
async function creditClear(page, label) {
  const s = await page.evaluate(() => {
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    const credit = document.getElementById('credit');
    const controls = ['back', 'prev', 'next', 'scrubrow'].map((id) => document.getElementById(id)).filter((el) => el && !el.hidden).map(box);
    let jar = null;
    let card = null;
    if (window.__jar.view === 'jar') {
      const d = window.__jar.dpr;
      const id = ['warsaw', 'nazare', 'el-chalten'][window.__jar.index];
      const j = window.__jar.jarBox(id);
      jar = { x: j.x / d, y: j.y / d, w: j.w / d, h: j.h / d };
      const c = window.__jar.forecast.rect;
      card = { x: c.x / d, y: c.y / d, w: c.w / d, h: c.h / d };
    }
    return { box: box(credit), hidden: credit.hidden, opacity: getComputedStyle(credit).opacity, controls, jar, card, w: innerWidth, h: innerHeight };
  });
  const ok = !s.hidden && s.box.w > 0 && s.box.h > 0 && Number(s.opacity) > 0 && inside(s.box, s.w, s.h)
    && s.controls.every((c) => !overlaps(s.box, c)) && (!s.jar || (!overlaps(s.box, s.jar) && !overlaps(s.box, s.card)));
  check(ok, `${label.includes('small') ? label + ' credit' : 'credit ' + label}: visible, in view, clear of controls, jar and card`);
}

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
const live = (pg) => pg.evaluate(() => document.getElementById('announce').textContent);
const twoFrames = (pg) => pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const viewIs = (page, view, timeout = 3000) =>
  page.waitForFunction((v) => window.__jar.view === v && !window.__jar.lifting, view, { timeout }).then(() => true, () => false);
const settled = (page, timeout = 3000) =>
  page.waitForFunction(() => !window.__jar.lifting, null, { timeout }).then(() => true, () => false);
const labelIs = (page, i, value, id = 'warsaw', timeout = 5000) =>
  page.waitForFunction(([k, v, c]) => window.__jar.labels[c] && window.__jar.labels[c][k] === v, [i, value, id], { timeout }).then(() => true, () => false);

// CSS-px centre of the jar's body, from its foot.
const jarCentre = (page, id = 'warsaw') => page.evaluate((c) => {
  const f = window.__jar.foot(c);
  return { x: f.x / window.__jar.dpr, y: f.y / window.__jar.dpr - 150 };
}, id);

// Mean luminance of a w x h strip with its top-left at canvas px (x, y).
const strip = (page, x, y, w, h) => page.evaluate(([sx, sy, sw, sh]) => {
  const c = document.getElementById('view');
  const d = c.getContext('2d').getImageData(Math.round(sx), Math.round(sy), sw, sh).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  return sum / (d.length / 4);
}, [x, y, w, h]);

// How far the brightest pixels of a canvas box stand above its median: lettering on a ground, whatever the font.
const standsOut = (page, x, y, w, h) => page.evaluate(([sx, sy, sw, sh]) => {
  const c = document.getElementById('view');
  const d = c.getContext('2d').getImageData(Math.round(sx), Math.round(sy), sw, sh).data;
  const l = [];
  for (let i = 0; i < d.length; i += 4) l.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
  l.sort((a, b) => a - b);
  return l[Math.floor(l.length * 0.98)] - l[Math.floor(l.length / 2)];
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

// Mean [r, g, b] of the (2 rad + 1)^2 canvas px around a scene point (5 x 5 by default; rad 0 is one px).
const rgbAt = (pg, sx, sy, rad = 2) => pg.evaluate(([x, y, r]) => {
  const p = window.__jar.toCanvas(x, y);
  const d = document.getElementById('view').getContext('2d').getImageData(Math.round(p.x) - r, Math.round(p.y) - r, 2 * r + 1, 2 * r + 1).data;
  const n = d.length / 4;
  const m = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) { m[0] += d[i]; m[1] += d[i + 1]; m[2] += d[i + 2]; }
  return { r: m[0] / n, g: m[1] / n, b: m[2] / n };
}, [sx, sy, rad]);
const lumaOf = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
let hours = null; // { darkest, brightest } as pin times, found once by __jar.ambient
async function findHours(pg) {
  const found = [];
  for (let h = 0; h < 24; h++) {
    const t = Date.UTC(2026, 5, 15, h, 30);
    await pg.evaluate((ms) => window.__jar.pin(ms), t);
    found.push({ t, ambient: await pg.evaluate(() => window.__jar.ambient) });
  }
  found.sort((a, b) => a.ambient - b.ambient);
  return { darkest: found[0], brightest: found[found.length - 1] };
}

const pinAt = (pg, ms) => pg.evaluate((t) => window.__jar.pin(t), ms);
const jarHash = (pg) => pg.evaluate(() => window.__jar.hash());
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
  await creditClear(page, 'desktop table');
  check(await labelIs(page, 1, '12°'), 'warsaw label shows fixture temperature');
  const time = await page.evaluate(() => window.__jar.labels.warsaw[2]);
  const okTimes = new Set([-1, 0, 1].flatMap((m) => [localTimeText(before + m * 60000, 'Europe/Warsaw'), localTimeText(Date.now() + m * 60000, 'Europe/Warsaw')]));
  check(/^\d\d:\d\d$/.test(time) && okTimes.has(time), `warsaw label shows a Warsaw time (${time})`);
  check(await page.evaluate(() => window.__jar.labels.warsaw[0] === 'WARSAW, POLAND'), 'warsaw label carries the city and country');
  // the second jar: Nazare, in Lisbon time
  check(await page.evaluate(() => Object.keys(window.__jar.labels).length === 3), 'table shows three jars');
  check(await labelIs(page, 1, '18°', 'nazare'), 'nazare label shows fixture temperature');
  const lisbonTime = await page.evaluate(() => window.__jar.labels.nazare[2]);
  const okLisbon = new Set([-1, 0, 1].flatMap((m) => [localTimeText(before + m * 60000, 'Europe/Lisbon'), localTimeText(Date.now() + m * 60000, 'Europe/Lisbon')]));
  check(/^\d\d:\d\d$/.test(lisbonTime) && okLisbon.has(lisbonTime) && (await page.evaluate(() => window.__jar.labels.nazare[0] === 'NAZARÉ, PORTUGAL')), `nazare label shows a Lisbon time (${lisbonTime})`);
  check(await page.evaluate(() => { const l = window.__jar.labels; return l.nazare.length === 4 && l.nazare[3] === '4.2 m · 14 s'; }), 'nazare label shows the swell');
  check(await page.evaluate(() => window.__jar.labels.warsaw.length === 3), 'warsaw label keeps three lines');
  check(await page.evaluate(() => { const l = window.__jar.labels; return l.warsaw[0] !== l.nazare[0] && l.warsaw[1] !== l.nazare[1]; }), 'two labels differ');
  await page.screenshot({ path: join(OUT, 'table.png') });

  // the chalk hint: worded for the pointer, spoken, drawn on the wood
  const hintDesk = await page.evaluate(() => [window.__jar.hint, document.getElementById('view').getAttribute('aria-label')]);
  check(!!hintDesk[0] && hintDesk[0].text === 'click a jar' && hintDesk[0].alpha === 1 && hintDesk[1].endsWith('Click a jar to lift it.'), 'chalk hint reads click a jar on the laptop and in the accessible name');
  const hr = hintDesk[0] ? hintDesk[0].rect : { x: 0, y: 0, w: 1, h: 1 };
  const bareAt = await page.evaluate(() => window.__jar.toCanvas(1380, 834));
  // the lettering against its own slate, and the same box of bare wood: a comparison of means would depend on how heavy the machine's font is
  const onChalk = await standsOut(page, hr.x, hr.y, Math.max(1, Math.round(hr.w)), Math.max(1, Math.round(hr.h)));
  const bareWood = await standsOut(page, bareAt.x, bareAt.y - hr.h / 2, Math.max(1, Math.round(hr.w)), Math.max(1, Math.round(hr.h)));
  check(onChalk > 25 && onChalk > bareWood + 15, `chalk hint is drawn on the table (lettering ${onChalk.toFixed(1)} above its slate, bare wood ${bareWood.toFixed(1)})`);

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

  // the lamplit shed
  hours = await findHours(page);
  check(hours.brightest.ambient - hours.darkest.ambient >= 0.3, 'a day has a dark and a bright hour');
  await pinAt(page, hours.darkest.t);
  const wallN = await rgbAt(page, 800, 160);
  check(wallN.r - wallN.b >= 8, 'the lamp warms the wall at the darkest hour');
  // (560, 200): open pane right of the moon's track (disc centre x 328..520, radius 14, so 26 px clear of the disc's
  // edge) and clear of both cross-bars (x 394..406, y 294..306), the frame and the cloth (right edge x 294..306). It
  // sits under the lamp's high glow, so a wash painted after the cut shows here: r - b rises well above the threshold,
  // against about -21 for the real night sky. Further down the jar's glow bleeds into the pane (y 440 reads r 167)
  // and the wash is too faint to separate.
  const openSky = await rgbAt(page, 560, 200);
  check(openSky.r - openSky.b <= -15, 'the sky through the pane is not tinted by the lamp');
  // (250, 220): the same pane under the cloth, off both cross-bars
  const paneUnderCloth = await rgbAt(page, 250, 220);
  check(paneUnderCloth.r >= paneUnderCloth.b + 4 && Math.abs(paneUnderCloth.r - openSky.r) + Math.abs(paneUnderCloth.b - openSky.b) >= 20, 'the curtain covers the left edge of the pane');
  // the lip is 3 scene px (about 2 canvas px): one pixel row, against bare table just above and the face below
  const lip = lumaOf(await rgbAt(page, 1380, 939, 0));
  const top = lumaOf(await rgbAt(page, 1380, 930, 0));
  const face = lumaOf(await rgbAt(page, 1380, 965, 0));
  check(lip > face + 6 && lip > top + 6, 'the table front has a lit lip over a darker face');
  // x 1492 is bare board right of the last vessel and clear of the third jar (1080..1420); the strip is scene y 418..420, one canvas px row
  const board = lumaOf(await rgbAt(page, 1492, 419, 0));
  const below = lumaOf(await rgbAt(page, 1492, 421, 0));
  check(board > below + 12, `the shelf board has a lit top edge (${board.toFixed(0)} over ${below.toFixed(0)})`);
  const n1 = await jarHash(page);
  await pinAt(page, hours.darkest.t);
  check(n1 === (await jarHash(page)), 'the lamplit night draws the same pixels');
  await pinAt(page, hours.brightest.t);
  const wallD = await rgbAt(page, 800, 160);
  check((wallN.r - wallN.b) - (wallD.r - wallD.b) >= 6, 'the lamp is barely there by day');
  await page.reload();
  await ready(page);
  await labelIs(page, 1, '12°');

  // lift on click, Escape, Back
  const c = await jarCentre(page);
  await page.mouse.click(c.x, c.y);
  check((await viewIs(page, 'jar')) && page.url().includes('?jar=warsaw'), 'jar lifts on click');
  await settled(page);
  const afterLift = await page.evaluate(() => [window.__jar.hint, document.getElementById('view').getAttribute('aria-label')]);
  check(afterLift[0] === null && !afterLift[1].includes('to lift it.'), 'chalk hint fades out with the first lift');
  await creditClear(page, 'desktop lifted');
  await page.screenshot({ path: join(OUT, 'warsaw-rain.png') });
  // The page's own clock, read beside the card: a Warsaw midnight between the
  // route and the check drops the first fixture row, exactly as the page does.
  const [fc, pageNow, aria] = await page.evaluate(() => [window.__jar.forecast, Date.now(), document.getElementById('view').getAttribute('aria-label')]);
  const todayThere = localDate(pageNow, 'Europe/Warsaw');
  const rows = [['14°', '9°', 'rain'], ['12°', '5°', 'cloud'], ['9°', '2°', 'clear'], ['2°', '-2°', 'snow'], ['8°', '3°', 'storm']];
  const want = days.map((d, i) => [dayName(d), ...rows[i]]).filter((_, i) => days[i] >= todayThere);
  while (want.length < 5) want.push(['—', '—°', '—°', 'cloud']);
  check(!!fc && JSON.stringify(fc.cells.map((k) => [k.day, k.high, k.low, k.kind])) === JSON.stringify(want), 'forecast card shows five fixture days when lifted');
  check(!!fc && fc.cells[0].today === days.includes(todayThere) && fc.cells.slice(1).every((k) => !k.today), 'forecast card marks today and only today');
  check(!!fc && typeof aria === 'string' && aria.includes('Next five days: ') && (aria.match(/today /g) || []).length === (fc.cells[0].today ? 1 : 0) && (!fc.cells[0].today || aria.includes(`Next five days: today ${fc.cells[0].day} `)), 'forecast card names today for screen readers');
  const sunRow = Math.max(0, days.findIndex((d) => d >= todayThere));
  const hm = (s) => s.slice(11, 16);
  const wantSun = { sunrise: hm(fixture.daily.sunrise[sunRow]), sunset: hm(fixture.daily.sunset[sunRow]) };
  check(!!fc && !!fc.sun && /^\d\d:\d\d$/.test(fc.sun.sunrise) && /^\d\d:\d\d$/.test(fc.sun.sunset) && JSON.stringify(fc.sun) === JSON.stringify(wantSun), 'forecast card shows sunrise and sunset');
  const real = fc ? fc.cells.filter((k) => k.day !== '—') : [];
  check(!!fc && real.length > 0 && real.every((k) => k.rain !== null && k.wind !== null) && real.some((k) => k.windArrow === null) && real.some((k) => k.windArrow !== null) && aria.includes(' rain ') && aria.includes(' wind '), 'rain and wind per day, one arrow omitted');
  check(!!fc && Array.isArray(fc.tides) && fc.tides.length === 0 && !aria.includes('tide'), 'warsaw card has no tides');
  const dfoot = await page.evaluate(() => window.__jar.foot('warsaw'));
  const dcanvas = await page.evaluate(() => [document.getElementById('view').width, document.getElementById('view').height]);
  check(!!fc && fc.rect.x > dfoot.x && inside(fc.rect, dcanvas[0], dcanvas[1]), 'desktop forecast card sits beside the jar and fits');
  // a refreshed answer while lifted is announced; the lift itself and a same-forecast refresh are not
  check((await live(page)) === '', 'live region is silent on the lift itself');
  const hotter = JSON.parse(bodyOf(dated)); hotter.cities.warsaw.temperature = 30.2;
  await page.evaluate((b) => window.__jar.applyWeather(b), hotter);
  await labelIs(page, 1, '30°');
  await twoFrames(page);
  check((await live(page)) === '', 'live region stays quiet when only the current temperature changes');
  const bumped = JSON.parse(bodyOf(dated));
  bumped.cities.warsaw.daily = bumped.cities.warsaw.daily.map((r) => ({ ...r, high: r.high + 1 }));
  await page.evaluate((b) => window.__jar.applyWeather(b), bumped);
  const heard = await page.waitForFunction(() => document.getElementById('announce').textContent.startsWith('Weather updated. '), null, { timeout: 3000 }).then(() => true, () => false);
  const [live1, aria1] = await page.evaluate(() => [document.getElementById('announce').textContent, document.getElementById('view').getAttribute('aria-label')]);
  const spokenOf = (a) => a.slice(a.indexOf('Next five days: '), a.indexOf(' Press Escape'));
  check(heard && live1 === `Weather updated. ${spokenOf(aria1)}` && spokenOf(aria1) !== spokenOf(aria) && live1.includes('Sunrise '), 'live region announces a refreshed forecast while lifted');
  await page.evaluate((b) => window.__jar.applyWeather(b), bumped);
  await twoFrames(page);
  check((await live(page)) === live1, 'live region stays quiet on an identical refresh');
  await page.keyboard.press('Escape');
  check((await viewIs(page, 'table')) && !page.url().includes('jar='), 'escape lowers the jar');
  await twoFrames(page);
  check((await page.evaluate(() => window.__jar.hint)) === null, 'chalk hint stays gone after the jar is set down');
  await twoFrames(page);
  check((await live(page)) === '', 'live region is cleared on the table');
  check(await page.evaluate(() => window.__jar.forecast === null), 'forecast card is absent on the table');
  await page.mouse.click(c.x, c.y);
  await viewIs(page, 'jar');
  await twoFrames(page);
  check((await live(page)) === '', 'live region is silent on a second lift');
  await page.goBack();
  check(await viewIs(page, 'table'), 'browser back lowers the jar');
  await settled(page);
  // the second jar lifts and lowers like the first; the arrow reaches it
  const nc = await jarCentre(page, 'nazare');
  await page.mouse.click(nc.x, nc.y);
  check((await viewIs(page, 'jar')) && page.url().includes('?jar=nazare'), 'nazare jar lifts on click');
  await settled(page);
  await page.keyboard.press('Escape');
  check((await viewIs(page, 'table')) && !page.url().includes('jar='), 'escape lowers the nazare jar');
  await settled(page);
  // a click beside the lifted jar, off the jar and its card, puts it back too
  await page.mouse.click(nc.x, nc.y);
  await viewIs(page, 'jar');
  await settled(page);
  const vp = page.viewportSize();
  await page.mouse.click(8, Math.round(vp.height / 2), { button: 'right' });
  await page.waitForTimeout(300); // a lowering goes through history.back, so give popstate its turn
  check((await viewIs(page, 'jar')) && page.url().includes('jar='), 'a right-click outside the lifted jar leaves it up');
  await page.mouse.click(8, Math.round(vp.height / 2));
  check((await viewIs(page, 'table')) && !page.url().includes('jar='), 'a click outside the lifted jar lowers it');
  await settled(page);
  await page.click('#prev');
  await page.waitForFunction(() => window.__jar.index === 0, null, { timeout: 3000 }).catch(() => {});
  await page.click('#next');
  check(await page.waitForFunction(() => window.__jar.index === 1, null, { timeout: 3000 }).then(() => true, () => false), 'next arrow focuses the second jar');
  timed(await medianFrameMs(page) < 33, 'desktop frame time under 33 ms');

  const deep = await desk.newPage();
  const deepSeen = watch(deep, origin);
  await routeWeather(deep, 'clear');
  await deep.goto(`${origin}/?jar=warsaw`);
  await ready(deep);
  check(await deep.evaluate(() => window.__jar.view === 'jar'), '?jar=warsaw opens lifted');
  check((await deep.evaluate(() => window.__jar.hint)) === null, 'chalk hint is absent on a deep link');
  await labelIs(deep, 1, '21°');
  await settled(deep);
  await deep.screenshot({ path: join(OUT, 'warsaw-lifted.png') });
  // ---- Nazare opened by its link: lifted, with its own five-day card -----------
  const deepN = await desk.newPage();
  const deepNSeen = watch(deepN, origin);
  await routeWeather(deepN);
  await deepN.goto(`${origin}/?jar=nazare`);
  await ready(deepN);
  await labelIs(deepN, 1, '18°', 'nazare');
  await settled(deepN);
  const nf0 = await deepN.evaluate(() => ({ view: window.__jar.view, title: document.title, forecast: window.__jar.forecast }));
  check(nf0.view === 'jar' && nf0.title === 'Nazaré, Portugal, in a jar' && !!nf0.forecast && nf0.forecast.cells.length === 5 && nf0.forecast.cells[0].day !== '—' && nf0.forecast.cells[0].high === '20°', '?jar=nazare opens lifted');
  await deepN.screenshot({ path: join(OUT, 'nazare-lifted.png') });
  const wantSwell = ['2.1 m', '4.2 m', '3.8 m', '5.2 m', '1.6 m'];
  check(JSON.stringify(nf0.forecast.cells.map((c) => c.swell && c.swell.height)) === JSON.stringify(wantSwell), 'nazare card shows a swell per day');
  await deepN.screenshot({ path: join(OUT, 'nazare-swell-card.png') });
  const nAria = await deepN.evaluate(() => document.getElementById('view').getAttribute('aria-label'));
  check(JSON.stringify(nf0.forecast.tides.map((t) => t.kind)) === JSON.stringify(['high', 'low', 'high', 'low']) && nAria.includes('High tide ') && nAria.includes(' wind '), "nazare card shows today's tides and speaks them");
  check(nf0.forecast.tides.length > 0 && nf0.forecast.tides.every((t) => Number.isFinite(t.height)) && nAria.includes(' metres'), 'nazare card prints and speaks tide heights');
  check(nAria.includes('swell '), "nazare's spoken description still names the swell");
  const [dayTNow, lisbonNow] = await deepN.evaluate(() => [window.__jar.forecast.dayT, Date.now()]);
  check(Number.isFinite(dayTNow) && Math.abs(dayTNow - dayFraction(lisbonNow, 'Europe/Lisbon')) < 0.01, 'nazare tide curve dot follows the Lisbon clock');
  check(!!(await deepN.evaluate(() => window.__jar.forecast)), 'nazare swell card is lifted');
  check(deepNSeen.errors.length === 0 && deepNSeen.off.length === 0, `no console errors or off-origin requests on the nazare link${deepNSeen.errors.length ? `: ${deepNSeen.errors.join(' | ')}` : ''}`);

  // ---- Nazare's sea: the four bands, the surfers, the beam ----------------------
  const T_NOON = Date.UTC(2026, 5, 15, 13, 0); // 14:00 in Lisbon, full day
  const T_DARK = Date.UTC(2026, 5, 15, 23, 30); // 00:30 in Lisbon, deep night
  const sea = await desk.newPage();
  const seaSeen = watch(sea, origin);
  await routeWeather(sea);
  await sea.goto(`${origin}/`);
  await ready(sea);
  await labelIs(sea, 1, '18°', 'nazare');
  await sea.evaluate(() => window.__jar.lift('nazare'));
  await viewIs(sea, 'jar');
  await settled(sea);
  await pinAt(sea, T_NOON);
  const sceneOf = (pg) => pg.evaluate(() => window.__jar.scene('nazare'));
  const atSea = async (h) => {
    await sea.evaluate((b) => window.__jar.applyWeather(b), seaBody(h));
    return sceneOf(sea);
  };
  const flat = await atSea(0.5);
  check(!!flat && flat.band === 'calm' && flat.surfers === 0, 'calm sea, no surfers');
  await pinAt(sea, T_NOON);
  await sea.screenshot({ path: join(OUT, 'nazare-calm.png') });
  const mod = await atSea(2);
  check(!!mod && mod.band === 'moderate', 'moderate swell draws a moderate wave');
  check(!!mod && mod.band === 'moderate' && mod.surfers === 3, 'moderate sea carries three surfers');
  const big = await atSea(4);
  check(!!big && big.band === 'big' && big.surfers === 3, 'big sea carries three surfers');
  const giant = await atSea(8);
  check(!!giant && giant.band === 'giant' && giant.surfers === 2, 'giant sea carries the tow-in pair');
  check(!!giant && !!flat && giant.waveSize > flat.waveSize, 'giant swell draws a taller wave than calm');
  await sea.screenshot({ path: join(OUT, 'nazare-giant.png') });
  // the sea rolls with the clock, and the same moment is the same picture
  await pinAt(sea, T_NOON);
  const rollA = await jarHash(sea);
  await pinAt(sea, T_NOON + 3000);
  const rollB = await jarHash(sea);
  await pinAt(sea, T_NOON);
  const rollC = await jarHash(sea);
  check(rollA !== rollB, 'the sea rolls');
  check(rollA === rollC, 'nazare draws the same pixels at the same moment');
  // the scrub: the wave follows the hour's forecast swell (fixture: 09:00 4.2 m, 14:00 1.2 m, 15:00 6.5 m)
  // pin first: the feed counts staleness from the pinned moment, and the fixture is dated today
  await pinAt(sea, wallToMs(`${lisbonDays[0]}T09:00`, 'Europe/Lisbon'));
  await sea.evaluate((b) => window.__jar.applyWeather(b), JSON.parse(bodyOf(dated)));
  await settled(sea);
  const scrubAt = async (min) => sea.evaluate((m) => { window.__jar.scrub(m); return { scene: window.__jar.scene('nazare'), swell: window.__jar.labels.nazare[3] }; }, min);
  const s0 = await scrubAt(0);
  check(!!s0.scene && s0.scene.band === 'big' && s0.swell === '4.2 m · 14 s', `scrub at now keeps the big wave (${s0.scene && s0.scene.band} ${s0.swell})`);
  const s5 = await scrubAt(300);
  check(!!s5.scene && s5.scene.band === 'moderate' && s5.scene.waveSize < s0.scene.waveSize && s5.swell === '1.2 m · 14 s', `scrub +5 h shrinks the wave to the hourly swell (${s5.scene && s5.scene.band} ${s5.swell})`);
  const s5Hash = await jarHash(sea);
  const s6 = await scrubAt(360);
  check(!!s6.scene && s6.scene.band === 'giant' && s6.scene.surfers === 2, `scrub +6 h makes the wave giant with the tow-in pair (${s6.scene && s6.scene.band})`);
  const s6HashA = await jarHash(sea);
  const s6HashB = await jarHash(sea);
  check(s6HashA === s6HashB && s6HashA !== s5Hash, 'scrub draws the same wave at the same moment');
  const sBack = await scrubAt(0);
  check(!!sBack.scene && sBack.scene.band === 'big' && sBack.swell === '4.2 m · 14 s', `scrub back to now restores the wave (${sBack.scene && sBack.scene.band} ${sBack.swell})`);
  await sea.evaluate((b) => window.__jar.applyWeather(b), seaBody(4.2));
  const n0 = await scrubAt(0);
  const n5 = await scrubAt(300);
  check(!!n5.scene && n5.scene.band === 'big' && n5.scene.waveSize === n0.scene.waveSize, 'no hourly sea: the wave ignores the scrub');
  await sea.evaluate(() => window.__jar.scrub(0));
  await pinAt(sea, T_NOON);
  // the lighthouse: dark glass by day, a lit lantern by night
  const sky = [0.7, 0.12];
  const lanternBy = async () => luma(await patch(sea, 'nazare', 0.78, 0.165, 2)) - luma(await patch(sea, 'nazare', sky[0], sky[1], 2));
  check((await lanternBy()) <= 0, 'the lantern is dark by day');
  await sea.evaluate((b) => window.__jar.applyWeather(b), seaBody(4.2));
  await pinAt(sea, T_DARK);
  check((await lanternBy()) > 10, 'the lighthouse lantern glows at night');
  const dark = await sceneOf(sea);
  await pinAt(sea, T_NOON);
  const noonScene = await sceneOf(sea);
  check(!!dark && !!noonScene && dark.surfers === 0 && noonScene.surfers === 3, 'surfers go home at night');
  await pinAt(sea, T_DARK);
  await sea.screenshot({ path: join(OUT, 'nazare-night.png') });

  // the real moon phase: T_DARK is a new moon, T_FULL (two weeks on) a full one
  const T_FULL = Date.UTC(2026, 5, 29, 23, 30); // 00:30 in Lisbon, a full moon
  const newMoon = await sea.evaluate(() => window.__jar.moon('nazare'));
  check(!!newMoon && newMoon.name === 'new' && newMoon.illumination < 0.02, 'a new moon night reports a new moon');
  const dimSky = luma(await patch(sea, 'nazare', newMoon.x, newMoon.y, 3));
  await pinAt(sea, T_FULL);
  const fullMoon = await sea.evaluate(() => window.__jar.moon('nazare'));
  check(!!fullMoon && fullMoon.name === 'full' && fullMoon.illumination > 0.98, 'a full moon night reports a full moon');
  const brightSky = luma(await patch(sea, 'nazare', fullMoon.x, fullMoon.y, 3));
  check(brightSky > dimSky + 15, `the full moon is brighter on the glass than the new moon (${brightSky.toFixed(0)} vs ${dimSky.toFixed(0)})`);
  // the accessible name is synced on the next frame after a pin, so wait for it
  const namesFull = await sea.waitForFunction(() => /A full moon\./.test(document.getElementById('view').getAttribute('aria-label') || ''), null, { timeout: 3000 }).then(() => true, () => false);
  check(namesFull, 'the lifted sentence names the full moon');
  await sea.screenshot({ path: join(OUT, 'nazare-full-moon.png') });
  await pinAt(sea, T_DARK);
  check(seaSeen.errors.length === 0 && seaSeen.off.length === 0, `no console errors or off-origin requests in the sea run${seaSeen.errors.length ? `: ${seaSeen.errors.join(' | ')}` : ''}`);

  // no sea reading at all: the 2 m default, and nothing errors
  const nos2 = await desk.newPage();
  const nos2Seen = watch(nos2, origin);
  await routeWeather(nos2, 'nosea');
  await nos2.goto(`${origin}/`);
  await ready(nos2);
  await labelIs(nos2, 1, '18°', 'nazare');
  await pinAt(nos2, T_NOON);
  check(await nos2.evaluate(() => window.__jar.labels.nazare.length === 3), 'missing sea leaves the label plain');
  await nos2.evaluate(() => window.__jar.lift('nazare'));
  await viewIs(nos2, 'jar');
  await settled(nos2);
  check(await nos2.evaluate(() => window.__jar.forecast.cells.every((c) => c.swell === null)) && nos2Seen.errors.length === 0, 'missing sea leaves the label and card plain');
  check(await nos2.evaluate(() => window.__jar.forecast.tides.length === 0 && window.__jar.forecast.dayT !== undefined && !document.getElementById('view').getAttribute('aria-label').includes('tide')) && nos2Seen.errors.length === 0, 'missing sea leaves no tide line');
  const dflt = await sceneOf(nos2);
  check(!!dflt && dflt.band === 'moderate' && nos2Seen.errors.length === 0, 'missing sea draws the default swell');

  // ---- El Chalten, the third jar: Fitz Roy over Laguna de los Tres ----------------
  const deepC = await desk.newPage();
  const deepCSeen = watch(deepC, origin);
  await routeWeather(deepC);
  await deepC.goto(`${origin}/?jar=el-chalten`);
  await ready(deepC);
  await labelIs(deepC, 1, '8°', 'el-chalten');
  await settled(deepC);
  const cf0 = await deepC.evaluate(() => ({ view: window.__jar.view, title: document.title, forecast: window.__jar.forecast }));
  check(cf0.view === 'jar' && cf0.title === 'El Chaltén, Argentina, in a jar' && !!cf0.forecast && cf0.forecast.cells.length === 5 && !!cf0.forecast.sun, '?jar=el-chalten opens lifted with a five-day card and the sunrise strip');
  const cAria = await deepC.evaluate(() => document.getElementById('view').getAttribute('aria-label'));
  check(cAria.includes('FITZ ROY · SMOKING') && !cAria.includes('swell'), 'the spoken description reads El Chaltén\'s fourth line without calling it a swell');
  await deepC.screenshot({ path: join(OUT, 'el-chalten-lifted.png') });
  check(deepCSeen.errors.length === 0 && deepCSeen.off.length === 0, `no console errors or off-origin requests on the el-chalten link${deepCSeen.errors.length ? `: ${deepCSeen.errors.join(' | ') }` : ''}`);
  await deepC.close();

  // the bands, the clock, the seasons and the rock, with pixels sampled
  // Share pairs read from buildPlates: Fitz Roy's fin has a left-facing face at (0.465, 0.33) and a right-facing one at (0.61, 0.2), both clear of snow, gullies, ridges and facet edges;
  // the summit tip is (0.566, 0.111); the bivouac light (0.57, 0.25); the first headlamp (0.16, 0.668); open lake at (0.2, 0.62).
  // Moments are in January (summer) and July, in the past: a pin ahead of the real clock would age the stub answer to stale.
  const T_NOON_C = Date.UTC(2026, 0, 21, 16, 0); // 13:00 in El Chaltén, midsummer
  const T_GLOW = Date.UTC(2026, 0, 21, 9, 34); // 06:34 local, 19 minutes after the 06:15 sunrise
  const T_LAMPS = Date.UTC(2026, 0, 21, 8, 5); // 05:05 local, 70 minutes before sunrise
  const T_NIGHT_C = Date.UTC(2026, 0, 22, 3, 0); // midnight local
  const T_CHALTEN_WINTER = Date.UTC(2026, 6, 15, 16, 0); // July, 13:00 local
  const cp = await desk.newPage();
  const cpSeen = watch(cp, origin);
  await routeWeather(cp);
  await cp.goto(`${origin}/`);
  await ready(cp);
  await labelIs(cp, 1, '8°', 'el-chalten');
  const chaltenLabel = await cp.evaluate(() => window.__jar.labels['el-chalten']);
  check(chaltenLabel[0] === 'EL CHALTÉN, ARGENTINA' && chaltenLabel[1] === '8°', 'el-chalten label carries the city, country and fixture temperature');
  const okChalten = new Set([-1, 0, 1].flatMap((m) => [localTimeText(before + m * 60000, CHALTEN_ZONE), localTimeText(Date.now() + m * 60000, CHALTEN_ZONE)]));
  check(okChalten.has(chaltenLabel[2]), `el-chalten label shows an El Chaltén time (${chaltenLabel[2]})`);
  check(chaltenLabel[3] === 'FITZ ROY · SMOKING', `the fixture (cloud 20, 30 km/h from 225) reads smoking (${chaltenLabel[3]})`);
  await cp.evaluate(() => window.__jar.lift('el-chalten'));
  await viewIs(cp, 'jar');
  await settled(cp);
  const cs = () => cp.evaluate(() => window.__jar.scene('el-chalten'));
  const at = async (ms, body) => {
    // pin first, so a reading applied next is fresh at the pinned moment and the label keeps its fourth line
    if (body) { await pinAt(cp, ms); await cp.evaluate((b) => window.__jar.applyWeather(b), body); }
    await pinAt(cp, ms);
    return cs();
  };
  const lineOf = () => cp.evaluate(() => window.__jar.labels['el-chalten'][3]);
  const turquoise = (r, g, b) => g > r + 30 && b > r + 30;
  const warmer = (r, g, b) => r > b + 40;
  const clear = await at(T_NOON_C, chaltenBody({ cloud: 10, wind: 5 }));
  check(clear.band === 'clear' && clear.plume === 0 && clear.condor === true && clear.hiker === true && clear.season === 'summer' && clear.frozen === false, 'a clear midsummer noon: the wall stands, a condor and a hiker, no plume');
  check((await lineOf()) === 'FITZ ROY · CLEAR', 'the label reads FITZ ROY · CLEAR');
  check(all(await patch(cp, 'el-chalten', 0.2, 0.62, 2), turquoise), 'the lake is turquoise at noon');
  await cp.screenshot({ path: join(OUT, 'el-chalten-noon.png') });
  // the rock is lit by the hour, not painted on
  const left = luma(await patch(cp, 'el-chalten', 0.465, 0.33, 1));
  const right = luma(await patch(cp, 'el-chalten', 0.61, 0.2, 1));
  await at(T_NIGHT_C);
  const nLeft = luma(await patch(cp, 'el-chalten', 0.465, 0.33, 1));
  const nRight = luma(await patch(cp, 'el-chalten', 0.61, 0.2, 1));
  check(Math.abs(right - left) >= 12 && Math.abs(nRight - nLeft) <= 6, `El Chaltén facets differ by the hour (noon ${Math.abs(right - left).toFixed(0)}, night ${Math.abs(nRight - nLeft).toFixed(0)})`);
  const smoking = await at(T_NOON_C, chaltenBody({ cloud: 20, wind: 60, dir: 225 }));
  check(smoking.band === 'smoking' && smoking.plume > 0.2 && (await lineOf()) === 'FITZ ROY · SMOKING', 'a strong south-westerly smokes the summit');
  check(await cp.evaluate(() => window.__jar.cadence.cities['el-chalten'] === 250), 'the plume asks for a 250 ms tick');
  check(some(await patch(cp, 'el-chalten', 0.66, 0.135, 3), (r, g, b) => r > 150 && g > 150 && b > 150), 'the banner cloud streams to the right of the summit');
  await cp.screenshot({ path: join(OUT, 'el-chalten-smoking.png') });
  await at(T_NOON_C);
  const smokeA = await jarHash(cp);
  await at(T_NOON_C);
  check(smokeA === (await jarHash(cp)), 'el-chalten draws the same pixels at the same moment');
  const capped = await at(T_NOON_C, chaltenBody({ cloud: 70, wind: 10 }));
  check(capped.band === 'capped' && (await lineOf()) === 'FITZ ROY · CAPPED' && all(await patch(cp, 'el-chalten', 0.566, 0.15, 2), (r, g, b) => Math.abs(r - b) < 25), 'a cloud deck caps the peak');
  const hidden = await at(T_NOON_C, chaltenBody({ cloud: 95, code: 61, wind: 40, dir: 315 }));
  check(hidden.band === 'hidden' && (await lineOf()) === 'FITZ ROY · HIDDEN', 'rain hides the peak');
  check(all(await patch(cp, 'el-chalten', 0.566, 0.15, 2), (r, g, b) => !warmer(r, g, b) && !turquoise(r, g, b)), 'the summit is neither warm rock nor lake colour when hidden');
  await cp.screenshot({ path: join(OUT, 'el-chalten-hidden.png') });
  const glowing = await at(T_GLOW, chaltenBody({ cloud: 10, wind: 4 }));
  check(glowing.glow > 0 && glowing.mirror > 0.8, 'first light glows and the still lake mirrors');
  check(some(await patch(cp, 'el-chalten', 0.56, 0.16, 2), warmer), 'the top of the wall is red at sunrise');
  const mirrorWarm = (rows) => rows.reduce((s, [r, , b]) => s + r - b, 0) / rows.length;
  check(mirrorWarm(await patch(cp, 'el-chalten', 0.56, 0.63, 2)) > mirrorWarm(await patch(cp, 'el-chalten', 0.2, 0.62, 2)), 'the lake carries the red below the wall');
  await cp.screenshot({ path: join(OUT, 'el-chalten-alpenglow.png') });
  const lamps = await at(T_LAMPS, chaltenBody({ cloud: 10, wind: 4 }));
  check(lamps.headlamps >= 2 && (await cp.evaluate(() => window.__jar.cadence.cities['el-chalten'] === 400)), 'headlamps wait on the shore before dawn');
  check(some(await patch(cp, 'el-chalten', 0.16, 0.668, 4), (r, g, b) => r > 170 && r >= b + 40), 'a headlamp shows warm on the shore');
  await cp.screenshot({ path: join(OUT, 'el-chalten-headlamps.png') });
  const night = await at(T_NIGHT_C, chaltenBody({ cloud: 10, wind: 4 }));
  check(night.headlamps === 0 && night.hiker === false && night.condor === false, 'at midnight no headlamps, hiker or condor');
  check((await lineOf()) === 'FITZ ROY · CLEAR', 'the midnight reading is fresh: the label keeps its fourth line');
  check(luma(await patch(cp, 'el-chalten', 0.57, 0.25, 1)) > luma(await patch(cp, 'el-chalten', 0.525, 0.25, 1)) + 20, 'one bivouac light shows on the wall at night');
  await cp.screenshot({ path: join(OUT, 'el-chalten-night.png') });
  const winter = await at(T_CHALTEN_WINTER, chaltenBody({ cloud: 10, wind: 4 }));
  check(winter.season === 'winter' && winter.frozen === true && winter.mirror === 0, 'in July the lake is frozen and mirrors nothing');
  check(luma(await patch(cp, 'el-chalten', 0.2, 0.62, 2)) > 150, 'the frozen lake is pale ice');
  await cp.screenshot({ path: join(OUT, 'el-chalten-winter.png') });
  check(cpSeen.errors.length === 0 && cpSeen.off.length === 0, `no console errors or off-origin requests in the el-chalten run${cpSeen.errors.length ? `: ${cpSeen.errors.join(' | ')}` : ''}`);
  await cp.close();

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
  const fn = await noct.evaluate(() => window.__jar.forecast);
  check(!!fn && !!fn.sun && fn.sunT < 0, 'forecast card sun arc has no dot at 01:30 in Warsaw');
  const gold = (r, g, b) => r >= 140 && r >= g + 20 && r >= b + 60;
  const blue = (r, g, b) => b >= 180 && b >= r + 40;
  const red = (r, g, b) => r >= 180 && r >= g + 60 && r >= b + 60;
  const warm = (r, g, b) => r >= b + 30 && r >= 90;
  const bluish = (r, g, b) => b >= r + 30 && b >= 90;
  const rim = (r, g, b) => r >= 200 && g >= 140 && g <= 210 && b <= 130;
  check(all(await patch(noct, 'warsaw', 0.4, 0.4, 2), gold), 'Palace glows gold at night');
  check(some(await patch(noct, 'warsaw', 0.235, 0.17, 2), blue), 'Varso crown glows blue');
  check(some(await patch(noct, 'warsaw', 0.235, 0.045, 4), red), 'red aviation light at the needle tip');
  const needle = luma(await patch(noct, 'warsaw', 0.235, 0.085, 1));
  const besideNeedle = luma(await patch(noct, 'warsaw', 0.275, 0.085, 1));
  check(needle > besideNeedle + 15, `Varso's needle is lit at night (${needle} vs ${besideNeedle})`);
  check(some(await patch(noct, 'warsaw', 0.4, 0.665, 3), warm), 'the Palace reflects in the river above the label');
  check(some(await patch(noct, 'warsaw', 0.235, 0.665, 3), bluish), 'Varso reflects in the river');
  check(some(await patch(noct, 'warsaw', 0.8, 0.296, 3), red), 'red light on the bridge pylon');
  // the deck's top edge in body shares, mirroring deckY in src/cities/warsaw/bridge.js
  const deckShare = (x) => {
    const y0 = 0.64 - 2 / 396;
    const y1 = 0.702;
    const t = (x - 0.3) / 0.7;
    return y0 + (y1 - y0) * t - (Math.sin(t * Math.PI) * 4) / 396;
  };
  // stops short of the right glass streak (0.945-0.975), which is white by day too
  // every pixel along both traffic lanes (the lights are 1.6 px tall, lanes 0.6 and 2.2 px below the top edge)
  const deckScan = async (page) => {
    const rows = [];
    for (let x = 0.33; x <= 0.93; x += 0.01) rows.push(...(await patch(page, 'warsaw', x, deckShare(x) + 1.4 / 396, 2)));
    return rows;
  };
  // the headlight is (255, 248, 226): warm, so pure white (a streak or a glint, b = 255) and cool near-whites (b > g) do not match
  const headlight = (r, g, b) => r >= 240 && g >= 235 && g <= 252 && b >= 200 && b <= 240 && b < g - 8;
  const nightDeck = await deckScan(noct);
  check(some(nightDeck, headlight) && some(nightDeck, red), 'headlights and tail lights run along the bridge deck at night');
  check(some(await patch(noct, 'warsaw', 0.156, 0.596, 3), rim), 'the Mermaid stands rim-lit on the far quay');
  check(some(await patch(noct, 'warsaw', 0.141, 0.596, 3), rim), 'the Mermaid is outlined on her left too');
  check(all(await patch(noct, 'warsaw', 0.12, 0.675, 1), (r, g, b) => b >= r + 15 && b >= 40), 'the river is blue water at night, unlike the wall below it');
  const edge = luma(await patch(noct, 'warsaw', 0.0425, 0.4, 1));
  const oldSpot = luma(await patch(noct, 'warsaw', 0.15, 0.4, 1)); // where the left streak used to sit
  check(edge > oldSpot + 10, 'the streaks hug the glass edges');
  const hashA = await noct.evaluate((t) => { window.__jar.pin(t); return window.__jar.hash(); }, T_NIGHT);
  const hashB = await noct.evaluate((t) => { window.__jar.pin(t); return window.__jar.hash(); }, T_NIGHT);
  check(hashA === hashB, 'the nocturne draws the same pixels at the same moment');
  await noct.screenshot({ path: join(OUT, 'warsaw-night.png') });
  await noct.evaluate((t) => window.__jar.pin(t), T_DAY);
  const fd = await noct.evaluate(() => window.__jar.forecast);
  check(!!fd && !!fd.sun && Math.abs(fd.sunT - 0.327) < 0.01, 'forecast card sun arc puts the dot a third of the way at 10:30 in Warsaw');
  check(all(await patch(noct, 'warsaw', 0.4, 0.4, 2), (r, g, b) => r >= b + 30), 'Palace is warm sandstone by day');
  check(!some(await patch(noct, 'warsaw', 0.235, 0.045, 4), red), 'no aviation light by day');
  const dayDeck = await deckScan(noct);
  check(!some(dayDeck, headlight) && !some(dayDeck, red), 'no traffic lights on the deck by day');
  const dayNeedle = luma(await patch(noct, 'warsaw', 0.235, 0.085, 1));
  const dayBeside = luma(await patch(noct, 'warsaw', 0.275, 0.085, 1));
  check(!(dayNeedle > dayBeside + 15), `no lit needle by day (${dayNeedle} vs ${dayBeside})`);
  const bronze = (r, g, b) => r >= 110 && r >= g + 15 && g >= b + 15;
  const sunlit = (r, g, b) => r >= 225 && g >= 195 && b <= 180 && r >= b + 50;
  check(some(await patch(noct, 'warsaw', 0.15, 0.597, 3), bronze), 'the Mermaid is bronze by day');
  // the shield's outline sits at bx - 0.28u; probe a pixel outside it on each side, at shield-centre height
  const grid = await noct.evaluate(() => { const a = window.__jar.bodyPx('warsaw', 0, 0); const b = window.__jar.bodyPx('warsaw', 1, 1); return { w: b.x - a.x, h: b.y - a.y }; });
  const uFrac = 0.055 * grid.h / grid.w; // the figure's unit as a share of the body width
  const edgeY = 0.626 - 0.55 * 0.055;
  check(some(await patch(noct, 'warsaw', 0.15 - 0.28 * uFrac - 1.5 / grid.w, edgeY, 1), sunlit), 'the Mermaid has a sunlit edge on her left in the morning');
  // her right flank (the torso's edge, clear of the arms) is where a flipped sunlit pass would show
  check(!some(await patch(noct, 'warsaw', 0.15 + 0.075 * uFrac + 1.5 / grid.w, 0.626 - 0.5 * 0.055, 1), sunlit), 'the Mermaid has no sunlit edge on her right in the morning');
  // she stays mostly bronze: in a box round the figure the pale pixels are a clear minority
  const figBox = await noct.evaluate(([jar, x0, x1, y0, y1]) => {
    const c = document.getElementById('view');
    const a = window.__jar.bodyPx(jar, x0, y0);
    const b = window.__jar.bodyPx(jar, x1, y1);
    const d = c.getContext('2d').getImageData(Math.round(a.x), Math.round(a.y), Math.round(b.x - a.x), Math.round(b.y - a.y)).data;
    const rows = [];
    for (let i = 0; i < d.length; i += 4) rows.push([d[i], d[i + 1], d[i + 2]]);
    return rows;
  }, ['warsaw', 0.15 - 0.28 * uFrac, 0.15 + 0.31 * uFrac, 0.626 - 1.07 * 0.055, 0.626 + 0.06 * 0.055]);
  const nPale = figBox.filter(([r, g, b]) => sunlit(r, g, b)).length;
  const nBronze = figBox.filter(([r, g, b]) => bronze(r, g, b)).length;
  check(nBronze > 0 && nPale < 0.45 * nBronze, `the Mermaid is mostly bronze by day (${nPale} pale vs ${nBronze} bronze)`);
  const sunFace = luma(await patch(noct, 'warsaw', 0.4 - 0.035, 0.4, 2));
  const shadeFace = luma(await patch(noct, 'warsaw', 0.4 + 0.035, 0.4, 2));
  check(sunFace - shadeFace >= 20, `the Palace's sun side is brighter than its shade side in the morning (${sunFace} vs ${shadeFace})`);
  check(all(await patch(noct, 'warsaw', 0.2, 0.668, 2), (r, g, b) => b >= r + 20), 'river shows blue left of the bridge, above the label, by day');
  // bare water is about -62 in red minus blue; a faint sandstone sliver lifts it well past -45
  check(some(await patch(noct, 'warsaw', 0.4, 0.662, 2), (r, g, b) => r - b >= -45), 'the Palace leaves a warm reflection on the river by day');
  await noct.screenshot({ path: join(OUT, 'warsaw-morning.png') });
  // the near-bank forest follows Warsaw's seasons (clear midday pins; summer is the deep green of T_DAY)
  const T_SPRING = Date.UTC(2026, 3, 20, 10);
  const T_AUTUMN = Date.UTC(2026, 9, 20, 10);
  const T_WINTER = Date.UTC(2026, 0, 15, 11);
  const forest = (pg) => patch(pg, 'warsaw', 0.12, 0.715, 2);
  const summerForest = await forest(noct);
  check(all(summerForest, (r, g, b) => g >= r + 10), 'the forest is deep green in summer');
  await noct.evaluate((t) => window.__jar.pin(t), T_AUTUMN);
  await twoFrames(noct);
  check(all(await forest(noct), (r, g, b) => r >= g + 10 && r >= b + 40), 'the forest is gold and rust in autumn');
  await noct.screenshot({ path: join(OUT, 'warsaw-autumn.png') });
  await noct.evaluate((t) => window.__jar.pin(t), T_WINTER);
  await twoFrames(noct);
  check(all(await forest(noct), (r, g, b) => Math.abs(r - g) <= 30 && g <= r + 8), 'the forest is bare grey-brown in winter');
  await noct.screenshot({ path: join(OUT, 'warsaw-winter.png') });
  await noct.evaluate((t) => window.__jar.pin(t), T_SPRING);
  await twoFrames(noct);
  const springForest = await forest(noct);
  check(all(springForest, (r, g, b) => g >= r + 15) && luma(springForest) >= luma(summerForest) + 20, 'the forest is a fresh lighter green in spring');
  await noct.evaluate((t) => window.__jar.pin(t), T_DAY);
  await twoFrames(noct);
  // ice on the river in a hard frost, none above the threshold
  const pale = (r, g, b) => r >= 190 && g >= 200 && b >= 205;
  const iceSeen = async () => {
    for (let x = 0.05; x <= 0.28; x += 0.01) if (some(await patch(noct, 'warsaw', x, 0.66, 2), pale)) return true;
    return false;
  };
  await noct.evaluate((b) => window.__jar.applyWeather(b), tidy(0, 5, -8));
  await twoFrames(noct);
  check(await iceSeen(), 'ice drifts on the river in a hard frost');
  check(await noct.evaluate(() => window.__jar.cadence.cities.warsaw > 0 && window.__jar.cadence.cities.warsaw <= 250), 'a frozen river asks for a tick');
  await noct.evaluate((b) => window.__jar.applyWeather(b), tidy(0, 5, 21.4));
  await twoFrames(noct);
  check(!(await iceSeen()), 'no ice above the threshold');
  check(await noct.evaluate(() => window.__jar.cadence.cities.warsaw === 200), 'a thawed river asks for no more than the traffic tick');
  const T_FLAG = Date.UTC(2026, 10, 11, 20, 0); // 21:00 in Warsaw on 11 November
  await noct.evaluate((t) => window.__jar.pin(t), T_FLAG);
  const white = (r, g, b) => r >= 200 && g >= 190 && b >= 180;
  const flagRed = (r, g, b) => r >= 160 && r >= g + 80 && r >= b + 80;
  check(all(await patch(noct, 'warsaw', 0.4, 0.32, 2), white) && all(await patch(noct, 'warsaw', 0.4, 0.47, 2), flagRed), 'the Palace is floodlit white over red on 11 November');
  await noct.screenshot({ path: join(OUT, 'warsaw-flag.png') });
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
  check(await labelIs(bp, 1, '—°', 'warsaw', 2000), 'label degrades to a dash');
  const hashes = await bp.evaluate(() => [window.__jar.hash(), window.__jar.blankHash()]);
  check(hashes[0] !== hashes[1], 'jar still draws');
  await bp.screenshot({ path: join(OUT, 'warsaw-no-weather.png') });
  check(await bp.evaluate(() => window.__jar.labels['el-chalten'].length === 3), 'missing weather leaves the El Chaltén label at three lines');
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
  check(!!nf && DASHES(nf.cells) && nf.sun === null && nf.sunT === null && nSeen.errors.length === 0 && !(await np.evaluate(() => document.getElementById('view').getAttribute('aria-label'))).includes('today'), 'forecast card shows dashes without a daily block');
  await nod.close();

  // ---- a daily block without sun times: five days, no strip -------------------
  const nos = await browser.newContext({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 });
  const xp = await nos.newPage();
  const xSeen = watch(xp, origin);
  await routeWeather(xp, 'nosun');
  await xp.goto(`${origin}/`);
  await ready(xp);
  await labelIs(xp, 1, '12°');
  await xp.evaluate(() => window.__jar.lift('warsaw'));
  await viewIs(xp, 'jar');
  await settled(xp);
  const xf = await xp.evaluate(() => window.__jar.forecast);
  check(!!xf && xf.sun === null && xf.sunT === null && xf.cells.length === 5 && xf.cells[0].high !== '—°' && xSeen.errors.length === 0, 'forecast card omits the sun strip without sun times');
  {
    const wp0 = await nos.newPage();
    await routeWeather(wp0);
    await wp0.goto(`${origin}/?jar=warsaw`);
    await ready(wp0);
    await labelIs(wp0, 1, '12°');
    await settled(wp0);
    check(await wp0.evaluate(() => window.__jar.forecast.cells.every((c) => c.swell === null)), 'warsaw card has no swell');
    await wp0.close();
  }
  await nos.close();

  // ---- phone held upright ---------------------------------------------------
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const pp = await phone.newPage();
  const pSeen = watch(pp, origin);
  await routeWeather(pp);
  await pp.goto(`${origin}/`);
  await ready(pp);
  await labelIs(pp, 1, '12°');
  const hintPhone = await pp.evaluate(() => [window.__jar.hint, document.getElementById('view').getAttribute('aria-label')]);
  check(!!hintPhone[0] && hintPhone[0].text === 'tap a jar' && hintPhone[1].endsWith('Tap a jar to lift it.'), 'chalk hint reads tap a jar on the phone');
  const fit = await pp.evaluate(() => {
    const r = document.getElementById('view').getBoundingClientRect();
    const el = document.scrollingElement;
    return { w: r.width, h: r.height, scrollW: el.scrollWidth, scrollH: el.scrollHeight, iw: innerWidth, ih: innerHeight, portrait: window.__jar.framing.portrait };
  });
  check(fit.w === fit.iw && fit.h === fit.ih && fit.scrollW <= fit.iw && fit.scrollH <= fit.ih && fit.portrait, 'phone fits (no scroll)');
  await creditClear(pp, 'phone table');
  await pp.screenshot({ path: join(OUT, 'phone', 'table.png') });

  // swipe: drag the row with real touch input and watch it follow, then settle
  const cdp = await phone.newCDPSession(pp);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', 300, 500);
  for (let i = 1; i <= 6; i++) await touch('touchMove', 300 - i * 20, 500);
  const mid = await pp.evaluate(() => window.__jar.pos);
  await touch('touchEnd', 180, 500);
  const back = await pp.waitForFunction(() => Number.isInteger(window.__jar.pos), null, { timeout: 3000 }).then(() => true, () => false);
  check(mid > 0.02 && back && (await pp.evaluate(() => window.__jar.view)) === 'table', `phone swipe settles (followed to ${mid.toFixed(2)}, then on a whole jar)`);

  // a flick may carry the row on to Nazare; a swipe back brings Warsaw to the middle again
  if ((await pp.evaluate(() => window.__jar.index)) !== 0) {
    await touch('touchStart', 50, 500);
    for (let i = 1; i <= 6; i++) await touch('touchMove', 50 + i * 50, 500);
    await touch('touchEnd', 350, 500);
    await pp.waitForFunction(() => window.__jar.index === 0 && Number.isInteger(window.__jar.pos), null, { timeout: 3000 }).catch(() => {});
  }
  check((await pp.evaluate(() => window.__jar.hint)) !== null, 'chalk hint survives a swipe');
  const pc = await jarCentre(pp);
  await pp.touchscreen.tap(pc.x, pc.y);
  check(await viewIs(pp, 'jar'), 'phone tap lifts');
  await settled(pp);
  check((await pp.evaluate(() => window.__jar.hint)) === null, 'chalk hint fades on the phone too');
  await creditClear(pp, 'phone lifted');
  await pp.screenshot({ path: join(OUT, 'phone', 'lifted.png') });
  const [pf, pNow, paria] = await pp.evaluate(() => [window.__jar.forecast, Date.now(), document.getElementById('view').getAttribute('aria-label')]);
  const pfoot = await pp.evaluate(() => window.__jar.foot('warsaw'));
  const pcanvas = await pp.evaluate(() => [document.getElementById('view').width, document.getElementById('view').height]);
  check(!!pf && pf.rect.y > pfoot.y && inside(pf.rect, pcanvas[0], pcanvas[1]), 'phone forecast card sits below the jar and fits');
  check(!!pf && pf.cells.slice(1).every((k) => !k.today) && pf.sun !== null && pf.sun.sunrise === wantSun.sunrise, 'phone forecast card marks today and shows the sun strip');
  check(!!pf && pf.sun !== null && Number.isFinite(pf.sunT) && Math.abs(pf.sunT - sunFraction(pNow, 'Europe/Warsaw', pf.sun)) < 0.01, 'phone forecast card sun arc follows the Warsaw clock');
  check(!!pf && typeof paria === 'string' && (paria.match(/today /g) || []).length === (pf.cells[0].today ? 1 : 0), 'phone forecast card names today for screen readers');
  await pp.evaluate((b) => window.__jar.applyWeather(b), bumped);
  const pheard = await pp.waitForFunction(() => document.getElementById('announce').textContent.startsWith('Weather updated. '), null, { timeout: 3000 }).then(() => true, () => false);
  check(pheard && (await live(pp)).includes('Next five days: '), 'phone live region announces a refreshed forecast while lifted');
  const box = await pp.evaluate(() => { const r = document.getElementById('back').getBoundingClientRect(); return { w: r.width, h: r.height, vis: !document.getElementById('back').hidden }; });
  check(box.vis && box.w >= 44 && box.h >= 44, `phone targets are 44px (back ${box.w}x${box.h})`);
  await pp.touchscreen.tap(30, 30);
  check(await viewIs(pp, 'table'), 'phone back button lowers the jar');
  // a real swipe slides from Warsaw to Nazare and settles there; a tap lifts it
  await pp.waitForFunction(() => Number.isInteger(window.__jar.pos), null, { timeout: 3000 }).catch(() => {});
  await pp.evaluate(() => window.__jar.pin(Date.now()));
  await touch('touchStart', 350, 500);
  for (let i = 1; i <= 4; i++) { await touch('touchMove', 350 - i * 30, 500); await pp.waitForTimeout(60); }
  await touch('touchEnd', 230, 500);
  check(await pp.waitForFunction(() => window.__jar.index === 1 && Number.isInteger(window.__jar.pos), null, { timeout: 3000 }).then(() => true, () => false), 'phone swipe reaches the second jar');
  const pn = await jarCentre(pp, 'nazare');
  await pp.touchscreen.tap(pn.x, pn.y);
  check(await viewIs(pp, 'jar'), 'phone tap lifts the second jar');
  await settled(pp);
  await pp.screenshot({ path: join(OUT, 'phone', 'nazare-lifted.png') });
  const pnf = await pp.evaluate(() => window.__jar.forecast);
  check(!!pnf && pnf.tides.length === 4 && pnf.cells.some((k) => k.rain !== null && k.wind !== null) && inside(pnf.rect, pcanvas[0], pcanvas[1]), 'phone forecast card fits with rain, wind and tides');
  check(!!pnf && pnf.tides.length === 4 && pnf.tides.every((t) => Number.isFinite(t.height)) && inside(pnf.rect, pcanvas[0], pcanvas[1]), 'phone card fits with tide heights and curve');
  await pp.touchscreen.tap(30, 30);
  await viewIs(pp, 'table');
  timed(await medianFrameMs(pp) < 25, 'phone frame time under 25 ms');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  timed(await medianFrameMs(pp) < 66, 'phone frame time under 66 ms at 4x throttle');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  check(pSeen.errors.length === 0 && pSeen.off.length === 0, `no console errors or off-origin requests on the phone${pSeen.errors.length ? `: ${pSeen.errors.join(' | ')}` : ''}`);
  {
    const pn2 = await phone.newPage();
    const pn2Seen = watch(pn2, origin);
    await routeWeather(pn2);
    await pn2.goto(`${origin}/?jar=nazare`);
    await ready(pn2);
    await labelIs(pn2, 1, '18°', 'nazare');
    await settled(pn2);
    const f = await pn2.evaluate(() => ({ f: window.__jar.forecast, cv: [document.getElementById('view').width, document.getElementById('view').height] }));
    check(!!f.f && JSON.stringify(f.f.cells.map((c) => c.swell && c.swell.height)) === JSON.stringify(['2.1 m', '4.2 m', '3.8 m', '5.2 m', '1.6 m']) && inside(f.f.rect, f.cv[0], f.cv[1]), 'phone nazare card shows the swell');
    await pn2.screenshot({ path: join(OUT, 'nazare-swell-card-phone.png') });
    check(pn2Seen.errors.length === 0 && pn2Seen.off.length === 0, 'no console errors on the phone nazare card');
    await pn2.close();
  }
  {
    const pw = await phone.newPage();
    await routeWeather(pw);
    await pw.goto(`${origin}/`);
    await ready(pw);
    await pinAt(pw, hours.darkest.t);
    const pcx = await pw.evaluate(() => window.__jar.framing.cx);
    // y 60 is plank wall above the window (120..480): with three jars the first one stands in front of the pane
    const pwall = await rgbAt(pw, pcx, 60);
    check(pwall.r - pwall.b >= 8, `the phone sees the warm wall too (red over blue ${(pwall.r - pwall.b).toFixed(0)})`);
    await pw.close();
  }
  {
    const pc = await phone.newPage();
    const pcSeen = watch(pc, origin);
    await routeWeather(pc);
    await pc.goto(`${origin}/?jar=el-chalten`);
    await ready(pc);
    await labelIs(pc, 1, '8°', 'el-chalten');
    await settled(pc);
    const cv = await pc.evaluate(() => [window.__jar.forecast, document.getElementById('view').width, document.getElementById('view').height]);
    check(!!cv[0] && cv[0].cells.length === 5 && inside(cv[0].rect, cv[1], cv[2]), 'phone el-chalten card fits');
    await pc.screenshot({ path: join(OUT, 'phone', 'el-chalten-lifted.png') });
    check(pcSeen.errors.length === 0 && pcSeen.off.length === 0, 'no console errors on the phone el-chalten link');
    await pc.close();
  }
  await phone.close();

  // ---- the credit at the sizes where the corner is tightest ------------------
  for (const [w, h, touch] of [[1024, 768, false], [667, 375, true], [740, 360, true], [375, 667, true], [360, 740, true], [390, 844, true]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: touch, hasTouch: touch });
    const sp = await ctx.newPage();
    await routeWeather(sp);
    await sp.goto(`${origin}/`);
    await ready(sp);
    await creditClear(sp, `small ${w}x${h} table`);
    if (w === 390) {
      const one = await sp.evaluate(() => { const r = document.getElementById('credit').getBoundingClientRect(); return r.height; });
      check(one < 30, `small 390x844 credit is on one line (${one.toFixed(0)} px tall)`);
    }
    for (const id of ['warsaw', 'nazare']) {
      await sp.evaluate((c) => window.__jar.lift(c), id);
      await settled(sp);
      await creditClear(sp, `small ${w}x${h} lifted ${id}`);
      const sr = await sp.evaluate((c) => ({ top: document.getElementById('scrubrow').getBoundingClientRect().top, foot: window.__jar.foot(c).y / window.__jar.dpr, card: (window.__jar.forecast.rect.y + window.__jar.forecast.rect.h) / window.__jar.dpr }), id);
      check(sr.top >= sr.foot && sr.top >= sr.card, `small ${w}x${h} ${id} scrub row clears the jar foot and the card (row top ${sr.top.toFixed(0)}, foot ${sr.foot.toFixed(0)}, card ${sr.card.toFixed(0)})`);
      await sp.evaluate(() => window.__jar.lower());
      await settled(sp);
    }
    await ctx.close();
  }

  // ---- phone held sideways --------------------------------------------------
  const land = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const lp = await land.newPage();
  await routeWeather(lp);
  await lp.goto(`${origin}/`);
  await ready(lp);
  const lf = await lp.evaluate(() => ({ f: window.__jar.framing, sw: document.scrollingElement.scrollWidth, iw: innerWidth }));
  check(!lf.f.portrait && lf.f.slice.w === 1600 && lf.sw <= lf.iw, 'landscape letterboxes');
  await creditClear(lp, 'landscape table');
  await lp.evaluate(() => window.__jar.lift('warsaw'));
  await settled(lp);
  await creditClear(lp, 'landscape lifted');
  await lp.evaluate(() => window.__jar.lower());
  await settled(lp);
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
  const pin = pinAt;

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
  // The first reading starts from the shared origin, and CT is a whole number of drift widths
  // from it, so nine seconds on the wind term's fractional part is 0.075 and calm and windy
  // differ. FETCHED only makes the stubbed answer identical across runs.
  const windHash = await jarHash(cw.pg);
  const cc = await cloudPage(deskOpts, 'cloudcalm');
  await pin(cc.pg, CT + CD);
  const calmHash = await jarHash(cc.pg);
  check(Math.abs(windDelta - wantDelta) < 1e-9 && windHash !== calmHash, `wind moves the clouds (${windDelta.toFixed(4)} jar widths in ${CD} ms)`);
  check((await cw.pg.evaluate(() => window.__jar.cadence.weather)) === 250, 'windy clouds redraw four times a second at most');
  await cw.pg.screenshot({ path: join(OUT, 'warsaw-clouds-wind.png') });
  const readDrift = (pg) => pg.evaluate(() => window.__jar.drift('warsaw'));
  // Only Warsaw's wind changes; Nazare keeps the answer it was served, so the
  // whole-canvas hash sees Warsaw's clouds alone.
  const cwNazare = JSON.parse(bodyOf(cloudyWind)).cities.nazare;
  const cwChalten = JSON.parse(bodyOf(cloudyWind)).cities['el-chalten'];
  const eastBody = (speed, nazare = cwNazare, chalten = cwChalten) => ({ v: 1, cities: { warsaw: { temperature: 14, code: 3, cloudCover: 85, isDay: 1, windSpeed: speed, windDir: 90 }, nazare, 'el-chalten': chalten } });
  await pin(cw.pg, CT + CD);
  const wh1 = await jarHash(cw.pg);
  const wd1 = await readDrift(cw.pg);
  check(Math.abs(wd1 - cloudTravel(30, 270, CT + CD)) < 1e-9, 'the first reading draws where every fresh page draws it');
  await cw.pg.evaluate((b) => window.__jar.applyWeather(b), eastBody(12));
  const wd2 = await readDrift(cw.pg);
  const wh2 = await jarHash(cw.pg);
  check(Math.abs(wd2 - wd1) < 1e-9 && wh1 === wh2, 'a new wind reading keeps the clouds where they are');
  await pin(cw.pg, CT + 2 * CD);
  const wd3 = await readDrift(cw.pg);
  check(Math.abs(wd3 - wd2 - cloudDrift(12, 90, CD)) < 1e-7 && wd3 < wd2, 'the new reading sets the pace from then on');
  await cw.pg.evaluate((b) => window.__jar.applyWeather(b), eastBody(0, { ...cwNazare, windSpeed: 0 }, { ...cwChalten, windSpeed: 0, cloudCover: 0 }));
  // (Nazare calms too, so no wind anywhere asks the weather for a redraw.)
  const wd4 = await readDrift(cw.pg);
  await pin(cw.pg, CT + 3 * CD);
  const wd5 = await readDrift(cw.pg);
  check(Math.abs(wd4 - wd3) < 1e-9 && wd5 === wd4 && (await cw.pg.evaluate(() => window.__jar.cadence.weather)) === 0, 'a dropped wind leaves the clouds resting');
  const calmDelta = await driftDelta(cc.pg);
  check(calmDelta === 0 && (await cc.pg.evaluate(() => window.__jar.drift('warsaw'))) === 0 && (await cc.pg.evaluate(() => window.__jar.cadence.weather)) === 0, "calm clouds keep today's pace");
  // ... while Nazare's rolling sea asks for ten redraws a second on its own
  check(await cc.pg.evaluate(() => window.__jar.cadence.cities.nazare === 100 && window.__jar.cadenceMs === 100), 'the sea keeps a ten-a-second cadence');
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
  check(await cr.pg.evaluate(() => window.__jar.cadence.cities.nazare === 250), 'reduced motion slows the sea');
  await cr.cx.close();

  const cpn = await cloudPage(phoneOpts, 'cloudwind');
  const phoneDelta = await driftDelta(cpn.pg);
  check(Math.abs(phoneDelta - wantDelta) < 1e-9, `phone clouds drift with the wind (${phoneDelta.toFixed(4)})`);
  await pin(cpn.pg, CT + CD);
  check(Math.abs((await readDrift(cpn.pg)) - wd1) < 1e-9, 'phone and desktop place the clouds alike from the same answer');
  await cpn.cx.close();

  // ---- the scrub: a lifted jar previewed up to a day ahead ----------------------
  const T9 = wallToMs(`${days[0]}T09:00`, 'Europe/Warsaw'); // 09:00 in Warsaw today
  const scrubPage = async (opts, label) => {
    const cx = await browser.newContext(opts);
    const pg = await cx.newPage();
    const sSeen = watch(pg, origin);
    await routeWeather(pg);
    await pg.goto(`${origin}/`);
    await ready(pg);
    await labelIs(pg, 1, '12°');
    return { cx, pg, sSeen, label };
  };
  const liftWarsaw = async (pg) => {
    await pinAt(pg, T9);
    // The feed measures staleness against the pinned clock, so an answer fetched at the
    // real time of day (say 00:06) is 45+ minutes old once the clock is pinned to 09:00.
    // Hand it the same answer again, accepted now at the pinned moment.
    await pg.evaluate((b) => window.__jar.applyWeather(b), JSON.parse(bodyOf(dated)));
    await pg.evaluate(() => window.__jar.lift('warsaw'));
    await viewIs(pg, 'jar');
    await settled(pg);
    await pg.waitForFunction(() => !document.getElementById('scrubrow').hidden, null, { timeout: 3000 }).catch(() => {});
  };
  const sc = await scrubPage({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 }, 'desktop');
  const sp2 = sc.pg;
  check(await sp2.evaluate(() => document.getElementById('scrubrow').hidden), 'scrub row hidden on the table');
  await liftWarsaw(sp2);
  check(await sp2.evaluate(() => !document.getElementById('scrubrow').hidden), 'scrub row shows when a jar is lifted');
  const lab0 = await sp2.evaluate(() => window.__jar.labels.warsaw.slice());
  const nazare0 = await sp2.evaluate(() => window.__jar.labels.nazare.slice());
  // Re-pin and hash in one step: the pin forces a render of the settled lift, so the
  // hash is of the finished frame and not of whichever frame the loop last got to.
  const hashNowAt = () => sp2.evaluate((t) => { window.__jar.pin(t); return window.__jar.hash(); }, T9);
  const hNow = await hashNowAt();
  const got5 = await sp2.evaluate(() => { window.__jar.scrub(300); return { l: window.__jar.labels.warsaw.slice(), p: window.__jar.preview, n: window.__jar.labels.nazare.slice() }; });
  check(got5.l[1] === '18°' && got5.l[2] === '14:00 (+5 h)', `scrub +5 h shows the hourly temperature and the preview mark (${got5.l[1]} ${got5.l[2]})`);
  check(JSON.stringify(got5.n) === JSON.stringify(nazare0), 'shed and the other jar stay on now while scrubbing');
  await sp2.waitForFunction(() => document.getElementById('scrub').getAttribute('aria-valuetext') === '+5 h, 14:00, 18°' && document.getElementById('view').getAttribute('aria-label').startsWith('Previewing +5 h'), null, { timeout: 3000 }).catch(() => {});
  const spoken = await sp2.evaluate(() => [document.getElementById('scrub').getAttribute('aria-valuetext'), document.getElementById('view').getAttribute('aria-label')]);
  check(spoken[0].includes('+5 h') && spoken[0].includes('14:00') && spoken[1].startsWith('Previewing +5 h'), `scrub speaks its value (${spoken[0]})`);
  const six = await sp2.evaluate(() => { window.__jar.scrub(360); return { l: window.__jar.labels.warsaw.slice(), p: window.__jar.preview }; });
  check(six.p !== null && six.p.kind === 'rain' && six.l[1] === '16°' && six.l[2] === '15:00 (+6 h)', `scrub to 15:00 previews rain (${six.p && six.p.kind} ${six.l[1]} ${six.l[2]})`);
  const hA = await jarHash(sp2);
  await sp2.evaluate(() => window.__jar.scrub(360));
  const hB = await jarHash(sp2);
  check(hA === hB && hA !== hNow, 'scrub draws the same pixels at the same moment');
  const snapped = await sp2.evaluate(() => { window.__jar.scrub(0); return { l: window.__jar.labels.warsaw.slice(), p: window.__jar.preview }; });
  check(JSON.stringify(snapped.l) === JSON.stringify(lab0) && snapped.p === null, 'scrub snaps back to now');
  check((await hashNowAt()) === hNow, 'scrub back at now draws the picture it started from');
  await sp2.focus('#scrub');
  await sp2.keyboard.press('ArrowRight');
  const afterArrow = await sp2.evaluate(() => window.__jar.scrubMin);
  await sp2.keyboard.press('Home');
  const afterHome = await sp2.evaluate(() => window.__jar.scrubMin);
  check(afterArrow === 30 && afterHome === 0, `scrub keyboard: arrow steps half an hour, Home returns (${afterArrow}, ${afterHome})`);
  await sp2.keyboard.press('End');
  check((await sp2.evaluate(() => window.__jar.scrubMin)) === 1440, 'scrub keyboard: End jumps a day ahead');
  await sp2.click('#now');
  check((await sp2.evaluate(() => window.__jar.scrubMin)) === 0, 'scrub now button returns to the present');
  // the spoken value is right at once, straight after a programmatic input event
  const vt = await sp2.evaluate(() => {
    const el = document.getElementById('scrub');
    el.value = '420';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return el.getAttribute('aria-valuetext');
  });
  check(vt === '+7 h, 16:00, 16°', `scrub value text is consistent straight after an input event (${vt})`);
  await sp2.evaluate(() => window.__jar.scrub(0));
  // a real drag and release: mouse down on the slider, move right, up outside it
  const sbox = await sp2.evaluate(() => { const r = document.getElementById('scrub').getBoundingClientRect(); return { x: r.x, y: r.y + r.height / 2, w: r.width }; });
  await sp2.mouse.move(sbox.x + 8, sbox.y);
  await sp2.mouse.down();
  await sp2.mouse.move(sbox.x + sbox.w * 0.6, sbox.y, { steps: 6 });
  const midDrag = await sp2.evaluate(() => window.__jar.scrubMin);
  await sp2.mouse.move(sbox.x + sbox.w * 0.6, sbox.y - 200, { steps: 3 });
  await sp2.mouse.up();
  const afterDrag = await sp2.evaluate(() => [window.__jar.scrubMin, window.__jar.preview]);
  check(midDrag > 0 && afterDrag[0] === 0 && afterDrag[1] === null, `scrub drag previews, and letting go (even off the slider) snaps back (${midDrag} then ${afterDrag[0]})`);
  await sp2.evaluate(() => window.__jar.scrub(300));
  await sp2.focus('#scrub');
  await sp2.keyboard.press('Escape');
  const afterEsc1 = await sp2.evaluate(() => [window.__jar.scrubMin, window.__jar.view]);
  await sp2.keyboard.press('Escape');
  const afterEsc2 = await viewIs(sp2, 'table');
  check(afterEsc1[0] === 0 && afterEsc1[1] === 'jar' && afterEsc2, 'escape first resets the scrub, then lowers');
  check(await sp2.evaluate(() => document.activeElement === document.getElementById('view')), 'focus returns to the canvas when the jar is put down from the slider');
  check(await sp2.evaluate(() => document.getElementById('scrubrow').hidden), 'scrub row hides when the jar is put down');
  check(sc.sSeen.errors.length === 0 && sc.sSeen.off.length === 0, `no console errors or off-origin requests while scrubbing${sc.sSeen.errors.length ? `: ${sc.sSeen.errors.join(' | ')}` : ''}`);
  await sc.cx.close();

  // the phone, upright: the row sits below the card and inside the screen
  const spp = await scrubPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 'phone');
  await liftWarsaw(spp.pg);
  const pg5 = await spp.pg.evaluate(() => {
    const r = document.getElementById('scrubrow').getBoundingClientRect();
    const f = window.__jar.forecast;
    const sb = document.getElementById('scrub').getBoundingClientRect();
    const nb = document.getElementById('now').getBoundingClientRect();
    return { row: { top: r.top, bottom: r.bottom, left: r.left, right: r.right }, cardBottom: f.rect.y + f.rect.h, dpr: window.__jar.dpr, vw: innerWidth, vh: innerHeight, sh: sb.height, nh: nb.height };
  });
  check(pg5.row.top >= pg5.cardBottom / pg5.dpr && pg5.row.bottom <= pg5.vh && pg5.row.left >= 0 && pg5.row.right <= pg5.vw, `phone scrub row sits below the card and inside the viewport (row top ${pg5.row.top.toFixed(0)}, card bottom ${(pg5.cardBottom / pg5.dpr).toFixed(0)})`);
  check(pg5.sh >= 44 && pg5.nh >= 44, `phone scrub targets are 44px (${pg5.sh}, ${pg5.nh})`);
  const p5 = await spp.pg.evaluate(() => { window.__jar.scrub(300); return window.__jar.labels.warsaw.slice(); });
  check(p5[1] === '18°' && p5[2] === '14:00 (+5 h)', 'phone scrub +5 h shows the preview mark');
  await spp.pg.evaluate(() => window.__jar.scrub(0));
  // a tap on the canvas just beside the row (inside its band) does not lower the jar
  const bandTap = await spp.pg.evaluate(() => { const r = document.getElementById('scrubrow').getBoundingClientRect(); return { x: Math.max(4, r.left - 12), y: r.top + r.height / 2 }; });
  await spp.pg.touchscreen.tap(bandTap.x, bandTap.y);
  await twoFrames(spp.pg);
  check((await spp.pg.evaluate(() => window.__jar.view)) === 'jar', 'phone tap beside the scrub row leaves the jar lifted');
  // a real touch drag on the slider, then release
  const tb = await spp.pg.evaluate(() => { const r = document.getElementById('scrub').getBoundingClientRect(); return { x: r.x, y: r.y + r.height / 2, w: r.width }; });
  const tcdp = await spp.cx.newCDPSession(spp.pg);
  const tch = (type, x) => tcdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: tb.y }] });
  await tch('touchStart', tb.x + 10);
  for (let i = 1; i <= 6; i++) await tch('touchMove', tb.x + 10 + (tb.w * 0.5 * i) / 6);
  const tMid = await spp.pg.evaluate(() => window.__jar.scrubMin);
  await tch('touchEnd', 0);
  await twoFrames(spp.pg);
  const tEnd = await spp.pg.evaluate(() => [window.__jar.scrubMin, window.__jar.preview, window.__jar.view]);
  check(tMid > 0 && tEnd[0] === 0 && tEnd[1] === null && tEnd[2] === 'jar', `phone scrub drag previews, and letting go snaps back (${tMid} then ${tEnd[0]})`);
  check(spp.sSeen.errors.length === 0, 'no console errors while scrubbing on the phone');
  await spp.cx.close();

  // the phone, sideways: the row clears the foot of the jar
  const sl = await scrubPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 'landscape');
  await liftWarsaw(sl.pg);
  const lg = await sl.pg.evaluate(() => ({ top: document.getElementById('scrubrow').getBoundingClientRect().top, foot: window.__jar.foot('warsaw').y / window.__jar.dpr }));
  check(lg.top >= lg.foot, `landscape scrub row clears the jar foot (row top ${lg.top.toFixed(0)}, foot ${lg.foot.toFixed(0)})`);
  await sl.cx.close();

  // reduced motion: the same preview, no animation to lean on
  const sr = await scrubPage({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1, reducedMotion: 'reduce' }, 'reduced');
  await liftWarsaw(sr.pg);
  const r5 = await sr.pg.evaluate(() => { window.__jar.scrub(300); return window.__jar.labels.warsaw.slice(); });
  check(r5[1] === '18°' && r5[2] === '14:00 (+5 h)', 'reduced motion: scrub previews the same label');
  await sr.cx.close();

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
