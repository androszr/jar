// The models behind what moves when the viewer does something (a lift, a
// shake, the opening, a new reading, a pressed day) and the small effects in
// the room and the sky. All pure: an age or a moment in, numbers out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liftRise, LIFT_RISE } from '../src/lift.js';
import { shakeAt, SHAKE_MS } from '../src/shake.js';
import { introLevels, introMs, INTRO } from '../src/intro.js';
import { FADE_MS, skyChanged, fadeAmount } from '../src/fade.js';
import { clampPreview, offsetLabel, dayPreviewMin, PREVIEW_MAX_MIN } from '../src/scrub.js';
import { interiorQuality, interiorShift, lanternFlicker, bodyRect, QUALITY, QUALITY_MAX, PARALLAX } from '../src/jar.js';
import { shootingStar, SHOOT_EVERY_MS, SHOOT_MS, rainRings, drawSplashes, drawRainOnGlass, drawFlurry, FLURRY } from '../src/skyweather.js';
import * as look from '../src/look/index.js';
import { findCity } from '../src/cities/index.js';
import { wallToMs } from '../src/placeclock.js';

const recorder = () => {
  const calls = [];
  const target = { createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) };
  const ctx = new Proxy(target, {
    get: (t, k) => (k === 'calls' ? calls : k in t ? t[k] : (...a) => { calls.push([String(k), a]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  return ctx;
};
const count = (ctx, name) => ctx.calls.filter(([k]) => k === name).length;

test('liftRise: on the table at 0, LIFT_RISE when up, a little past it on the way', () => {
  assert.equal(liftRise(0), 0);
  assert.ok(Math.abs(liftRise(1) - LIFT_RISE) < 1e-9);
  assert.equal(liftRise(-1), 0);
  assert.ok(Math.abs(liftRise(2) - LIFT_RISE) < 1e-9);
  let peak = 0;
  for (let i = 0; i <= 100; i++) peak = Math.max(peak, liftRise(i / 100));
  assert.ok(peak > LIFT_RISE * 1.03 && peak < LIFT_RISE * 1.2, `it overshoots a little (${peak})`);
});

test('shakeAt: nothing before, after or under reduced motion; it leans, sloshes and settles', () => {
  for (const age of [-1, SHAKE_MS, SHAKE_MS + 1, NaN, undefined]) assert.equal(shakeAt(age), null, String(age));
  assert.equal(shakeAt(200, true), null, 'reduced motion never shakes');
  const early = shakeAt(110);
  assert.ok(Math.abs(early.tilt) > 0.01 && Math.abs(early.tilt) < 0.06);
  assert.ok(early.swirl > 0 && early.swirl < 1);
  const late = shakeAt(SHAKE_MS - 50);
  assert.ok(Math.abs(late.tilt) < 0.001 && Math.abs(late.slosh) < 0.1 && late.swirl < 0.01, 'it has settled by the end');
  let top = 0;
  for (let a = 0; a < SHAKE_MS; a += 20) top = Math.max(top, shakeAt(a).swirl);
  assert.ok(top > 0.95 && top <= 1);
  assert.deepEqual(shakeAt(700), shakeAt(700), 'the same age is the same shake');
});

test('introLevels: the room comes up first, the jars one after another, then it is over', () => {
  const start = introLevels(0, 3);
  assert.deepEqual(start, { room: 0, jars: [0, 0, 0] });
  const mid = introLevels(INTRO.first + INTRO.gap + 10, 3);
  assert.ok(mid.room > 0.9);
  assert.ok(mid.jars[0] > mid.jars[1] && mid.jars[1] > 0 && mid.jars[2] === 0, 'left to right');
  const nearly = introLevels(introMs(3) - 1, 3);
  assert.ok(nearly.room === 1 && nearly.jars.every((j) => j > 0.99));
  assert.equal(introLevels(introMs(3), 3), null);
  assert.equal(introLevels(-5, 3), null);
  assert.equal(introLevels(NaN, 3), null);
  assert.equal(introMs(1), INTRO.first + INTRO.wake);
});

test('a reading fades in only when it changes the sky; fadeAmount eases 0..1 over FADE_MS', () => {
  const a = { known: true, kind: 'clear', cloudCover: 10 };
  assert.equal(skyChanged(a, { ...a, temperature: 3 }), false, 'a new temperature is not a new sky');
  assert.equal(skyChanged(a, { ...a, kind: 'rain' }), true);
  assert.equal(skyChanged(a, { ...a, cloudCover: 60 }), true);
  assert.equal(skyChanged({ known: false, kind: 'cloud', cloudCover: null }, a), true, 'the first reading');
  assert.equal(skyChanged(null, a), false);
  assert.equal(fadeAmount(0), 0);
  assert.equal(fadeAmount(FADE_MS), 1);
  assert.equal(fadeAmount(NaN), 1);
  assert.ok(fadeAmount(FADE_MS / 2) === 0.5 && fadeAmount(FADE_MS / 4) < 0.25);
});

test('a preview may reach five days: clampPreview, offsetLabel, dayPreviewMin', () => {
  assert.equal(clampPreview(-5), 0);
  assert.equal(clampPreview('x'), 0);
  assert.equal(clampPreview(1e9), PREVIEW_MAX_MIN);
  assert.equal(clampPreview(100.4), 100);
  assert.equal(offsetLabel(0), 'now');
  assert.equal(offsetLabel(300), '+5 h');
  assert.equal(offsetLabel(1440), '+24 h');
  assert.equal(offsetLabel(2 * 1440), '+2 d');
  assert.equal(offsetLabel(2 * 1440 + 180), '+2 d 3 h');
  assert.equal(offsetLabel(2 * 1440 + 1439), '+3 d');
  const zone = 'Europe/Warsaw';
  const now = wallToMs('2026-10-18T09:00', zone);
  assert.equal(dayPreviewMin(now, '2026-10-20', zone), 2 * 1440 + 4 * 60, '13:00 two days on');
  assert.equal(dayPreviewMin(now, '2026-10-18', zone), 4 * 60, 'today, while 13:00 is still ahead');
  assert.equal(dayPreviewMin(wallToMs('2026-10-18T15:00', zone), '2026-10-18', zone), 0, 'not ahead of now');
  for (const bad of [null, '', 'tomorrow', 20261020]) assert.equal(dayPreviewMin(now, bad, zone), 0);
});

test('interiorQuality: never under QUALITY, half steps, capped; a dense lifted jar gets its own pixels', () => {
  assert.equal(interiorQuality(0.8), QUALITY);
  assert.equal(interiorQuality(1.73), QUALITY);
  assert.equal(interiorQuality(2), QUALITY);
  assert.equal(interiorQuality(2.1), 2.5);
  assert.equal(interiorQuality(3.46), 3.5);
  assert.equal(interiorQuality(9), QUALITY_MAX);
  assert.equal(interiorQuality(NaN), QUALITY);
  const body = bodyRect();
  for (const q of [2, 2.5, 3, 3.5, 4]) assert.ok(Number.isInteger(body.w * q) && Number.isInteger(body.h * q), `whole pixels at ${q}`);
});

test('interiorShift: nothing at rest, a few px with the viewer, scaled by exactly what the slide needs', () => {
  assert.deepEqual(interiorShift({ x: 0, y: 0 }), { dx: 0, dy: 0, scale: 1 });
  assert.deepEqual(interiorShift(null), { dx: 0, dy: 0, scale: 1 });
  const s = interiorShift({ x: 1, y: -1 }, 2);
  assert.equal(s.dx, PARALLAX.x + 2);
  assert.equal(s.dy, -PARALLAX.y);
  const body = bodyRect();
  // the scaled picture still covers the glass on the side it slid away from
  assert.ok((body.w / 2) * s.scale - Math.abs(s.dx) >= body.w / 2 - 1e-9);
  assert.ok((body.h / 2) * s.scale - Math.abs(s.dy) >= body.h / 2 - 1e-9);
});

test('lanternFlicker stays near 1, is steady when still, and repeats for the same moment', () => {
  assert.equal(lanternFlicker(12345, 3, true), 1);
  for (let t = 0; t < 20000; t += 137) {
    const f = lanternFlicker(t, 7);
    assert.ok(f > 0.8 && f < 1.2);
  }
  assert.equal(lanternFlicker(5000, 7), lanternFlicker(5000, 7));
  assert.notEqual(lanternFlicker(5000, 7), lanternFlicker(5000, 8), 'each jar has its own');
});

test('a shooting star is rare, short and the same for the same moment', () => {
  let on = 0;
  const windows = 400;
  for (let t = 0; t < windows * SHOOT_EVERY_MS; t += 300) {
    const s = shootingStar(t);
    if (s) {
      on += 1;
      assert.ok(s.t >= 0 && s.t <= 1 && s.x >= 0.2 && s.x <= 0.8 && s.y < 0.3 && Math.abs(s.dir) === 1);
    }
  }
  const share = (on * 300) / (windows * SHOOT_EVERY_MS);
  assert.ok(share > 0 && share < SHOOT_MS / SHOOT_EVERY_MS, `on for ${share} of the time`);
  assert.equal(shootingStar(NaN), null);
  const t = [...Array(4000).keys()].map((i) => i * 250).find((x) => shootingStar(x));
  assert.deepEqual(shootingStar(t), shootingStar(t));
});

test('rain rings: none in the dry, some in drizzle, more in rain; they land inside the water', () => {
  const w = (kind) => ({ known: true, kind });
  assert.equal(rainRings(w('clear'), 1000).length, 0);
  assert.equal(rainRings({ known: false, kind: 'rain' }, 1000).length, 0);
  assert.ok(rainRings(w('drizzle'), 1000).length > 0);
  assert.ok(rainRings(w('rain'), 1000).length > rainRings(w('drizzle'), 1000).length);
  assert.equal(rainRings(w('storm'), 1000).length, rainRings(w('rain'), 1000).length);
  for (const r of rainRings(w('rain'), 4321)) assert.ok(r.t >= 0 && r.t < 1 && r.x >= 0 && r.x <= 1 && r.y >= 0 && r.y <= 1);
  assert.deepEqual(rainRings(w('rain'), 4321), rainRings(w('rain'), 4321));
  const ctx = recorder();
  const water = { x: 10, y: 200, w: 300, h: 40 };
  assert.equal(drawSplashes(ctx, null, w('rain'), 1000), 0, 'no water, no rings');
  assert.equal(drawSplashes(ctx, water, w('clear'), 1000), 0);
  const n = drawSplashes(ctx, water, w('rain'), 1000);
  assert.equal(count(ctx, 'ellipse'), n);
  for (const [k, a] of ctx.calls) if (k === 'ellipse') assert.ok(a[0] >= water.x && a[0] <= water.x + water.w && a[1] >= water.y && a[1] <= water.y + water.h);
});

test('rain beads on the glass only when it rains; a shaken jar throws up its flurry', () => {
  const rect = { x: 0, y: 0, w: 340, h: 396 };
  assert.equal(drawRainOnGlass(recorder(), rect, { known: true, kind: 'clear' }, 5000), 0);
  assert.equal(drawRainOnGlass(recorder(), rect, { known: false, kind: 'rain' }, 5000), 0);
  assert.ok(drawRainOnGlass(recorder(), rect, { known: true, kind: 'rain' }, 5000) > drawRainOnGlass(recorder(), rect, { known: true, kind: 'drizzle' }, 5000));
  assert.equal(drawFlurry(recorder(), rect, 0, 100, null), 0);
  const ctx = recorder();
  assert.equal(drawFlurry(ctx, rect, 0.8, 400, { known: true, kind: 'clear', temperature: 20 }), FLURRY);
  assert.equal(count(ctx, 'arc'), FLURRY);
  for (const [k, a] of ctx.calls) if (k === 'arc') assert.ok(a[0] >= rect.x && a[0] <= rect.w && a[1] >= rect.y && a[1] <= rect.h, 'every speck stays in the jar');
});

test('a cloud is one filled shape inside its documented span', () => {
  const ctx = recorder();
  look.cloud(ctx, 100, 60, 40, [200, 200, 200], 0.7);
  assert.equal(count(ctx, 'fill'), 1, 'one fill, so the lobes never show a seam');
  assert.equal(count(ctx, 'ellipse'), look.CLOUD_LOBES.length);
  for (const [dx, , rx] of look.CLOUD_LOBES) assert.ok(dx - rx >= -1.6 - 1e-9 && dx + rx <= 1.8 + 1e-9);
  const none = recorder();
  look.cloud(none, 100, 60, 40, [200, 200, 200], 0);
  assert.equal(none.calls.length, 0);
});

test('the room: dust always, a moth only after dark, both still under reduced motion', () => {
  const a = recorder();
  look.motes(a, 0.1, 1000);
  assert.equal(count(a, 'arc'), look.MOTES);
  const still1 = recorder();
  const still2 = recorder();
  look.motes(still1, 0.1, 1000, true);
  look.motes(still2, 0.1, 999999, true);
  assert.deepEqual(still1.calls, still2.calls, 'reduced motion: the dust hangs where it is');
  assert.equal(look.moth(recorder(), 0.6, 1000), false, 'no moth by day');
  assert.equal(look.moth(recorder(), 0.08, 1000), true);
  assert.equal(look.moth(recorder(), 0.08, 1000, true), false);
  assert.deepEqual(look.mothAt(5000), look.mothAt(5000));
  for (let t = 0; t < 60000; t += 500) {
    const m = look.mothAt(t);
    assert.ok(Math.abs(m.x - look.LAMP_HIGH.x) < 200 && m.y > 0 && m.y < 260, 'it keeps to the lamp');
  }
});

test('forecast cells: five rows in a column, five columns in a row, clear of the strips', () => {
  const rect = { x: 100, y: 50, w: 200, h: 440 };
  const plain = look.forecastCellRects(rect, 5, 'column');
  assert.equal(plain.length, 5);
  assert.ok(Math.abs(plain[4].y + plain[4].h - (rect.y + rect.h)) < 1e-9);
  const sun = look.forecastCellRects(rect, 5, 'column', { sunrise: '07:00', sunset: '17:00' });
  assert.ok(sun[4].y + sun[4].h < rect.y + rect.h, 'the sun strip is not a day');
  const row = look.forecastCellRects({ x: 0, y: 0, w: 380, h: 250 }, 5, 'row');
  assert.deepEqual(row.map((c) => c.x), [0, 76, 152, 228, 304]);
  assert.ok(row.every((c) => c.w === 76 && c.y === 0));
});

test('the glass takes a shift and a glint without changing its outline', () => {
  const rect = { x: 0, y: 44, w: 340, h: 396 };
  const a = recorder();
  const b = recorder();
  look.glassHighlights(a, rect, 0.22);
  look.glassHighlights(b, rect, 0.22, { shift: 3, glint: 1 });
  assert.equal(a.calls.length, b.calls.length);
  assert.notDeepEqual(a.calls, b.calls, 'the highlights slide');
  const outline = (c) => c.calls.filter(([k]) => k === 'bezierCurveTo').slice(0, 2);
  assert.deepEqual(outline(a), outline(b));
});

test('every city with water hands back a band inside the jar; a frozen lake hands back none', () => {
  const rect = { x: 0, y: 0, w: 340, h: 396 };
  for (const id of ['warsaw', 'nazare', 'el-chalten']) {
    const city = findCity(id);
    assert.equal(typeof city.water, 'function', id);
    const w = city.water(rect, null);
    assert.ok(w.w > 0 && w.h > 0 && w.x >= rect.x && w.y >= rect.y && w.x + w.w <= rect.w + 1e-9 && w.y + w.h <= rect.h + 1e-9, id);
  }
  assert.equal(findCity('el-chalten').water(rect, { frozen: true }), null);
});
