import { test } from 'node:test';
import assert from 'node:assert/strict';
import elChalten from '../src/cities/el-chalten/index.js';
import {
  sunWindow, hikerAt, visitorAt, shoreFolk, inView, PLACES, SEAT, WALK_SPEED, WALK_TICK_MS, HIKER_STANDS, HIKER_GONE, HIKER_SPAN_MS,
  VISITORS_AFTER, VISITORS_BEFORE,
} from '../src/cities/el-chalten/tourists.js';
import { buildPlates, ROCK, GRAVEL } from '../src/cities/el-chalten/scene.js';
import { EL_CHALTEN as EC } from '../src/cities/el-chalten/palette.js';
import { SCRUB_STEP_MIN } from '../src/scrub.js';
import { EMPTY } from '../src/weather.js';
import { css, tint } from '../src/look/index.js';
import { sample, LAMP_THRESHOLD } from '../src/clock.js';
import { therePhase } from '../src/placeclock.js';
import { LABEL } from '../src/jar-geometry.js';
import { bodyRect } from '../src/jar.js';

const location = elChalten.location;
const MIN = 60000;
const T_NOON = Date.UTC(2026, 0, 21, 16, 0); // 13:00 there, midsummer
const T_JULY = Date.UTC(2026, 6, 15, 16, 0);
const sun = sunWindow(T_NOON, location);
const still = { ...EMPTY, known: true, temperature: 8, code: 0, kind: 'clear', cloudCover: 10, windSpeed: 4, windDir: 225 };
const rect = { x: 0, y: 0, w: 340, h: 396 };
const plates = buildPlates(rect.w, rect.h);

function paintAt(nowMs) {
  const fills = new Set();
  const target = { createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) };
  const ctx = new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : () => {}),
    set(t, k, v) { if (k === 'fillStyle' && typeof v === 'string') fills.add(v); t[k] = v; return true; },
  });
  const phase = therePhase(nowMs, location, null);
  const tn = tint(sample(phase));
  return { out: elChalten.paint(ctx, rect, phase, tn, still, plates, nowMs), fills, light: tn.light };
}

test('the sun window: this day\'s rise and set in order, null for an unknown zone or moment', () => {
  assert.ok(sun.rise < T_NOON && T_NOON < sun.set);
  assert.equal(sunWindow(T_NOON, { ...location, zone: 'Nowhere/Nope' }), null);
  assert.equal(sunWindow(undefined, location), null);
  assert.equal(sunWindow(T_NOON, null), null);
  assert.deepEqual(shoreFolk(undefined, location), []);
  // after midnight the window is still the day that ended, so nobody is out
  assert.deepEqual(sunWindow(sun.set + 4 * 60 * MIN, location), sun);
});

test('nobody appears or vanishes in view: from before sunrise to after dark every figure walks in and walks out', () => {
  const step = 1000;
  const reach = WALK_SPEED * (step / 1000) * 1.2 + 1e-6;
  for (const [from, to, season] of [[sun.rise - 60 * MIN, sun.set + 90 * MIN, 'summer'], [T_JULY - 5 * 60 * MIN, T_JULY + 6 * 60 * MIN, 'winter']]) {
    let before = new Map();
    for (let t = from; t <= to; t += step) {
      const now = new Map(shoreFolk(t, location, season).map((f) => [f.id, f]));
      for (const [id, f] of now) {
        const was = before.get(id);
        if (was) assert.ok(Math.hypot(f.x - was.x, f.y - was.y) <= reach, `figure ${id} jumped at ${new Date(t).toISOString()}`);
        else assert.ok(!inView(f), `figure ${id} appeared in view at ${new Date(t).toISOString()}`);
      }
      for (const [id, was] of before) if (!now.has(id)) assert.ok(!inView(was), `figure ${id} vanished in view at ${new Date(t).toISOString()}`);
      before = now;
    }
    assert.equal(before.size, 0, 'the shore is empty at the end');
  }
});

test('the hiker sits on the rock through the day and is away at night', () => {
  const noon = hikerAt(T_NOON, sun);
  assert.deepEqual([noon.pose, noon.x, noon.y], ['sit', SEAT.x, SEAT.y]);
  assert.ok(SEAT.x > ROCK.x0 && SEAT.x < ROCK.x1);
  assert.equal(hikerAt(sun.rise - MIN, sun), null);
  assert.equal(hikerAt(sun.set + (HIKER_GONE + 1) * MIN, sun), null);
  assert.equal(hikerAt(T_NOON, null), null);
});

test('before dark the hiker stands, climbs down and walks off to the right, looking back on the way', () => {
  assert.equal(hikerAt(sun.set - (HIKER_STANDS + 1) * MIN, sun).pose, 'sit');
  const up = hikerAt(sun.set - (HIKER_STANDS - 1) * MIN, sun);
  assert.deepEqual([up.pose, up.x], ['stand', SEAT.x], 'on their feet on the rock first');
  let last = SEAT.x;
  let walked = 0;
  let stood = 0;
  let t = sun.set - HIKER_STANDS * MIN;
  for (; hikerAt(t, sun); t += 1000) {
    const h = hikerAt(t, sun);
    assert.ok(h.x >= last - 1e-9, 'never back towards the rock');
    if (h.pose === 'walk') { walked += 1; assert.equal(h.dir, 1); }
    if (h.pose === 'stand' && h.x > ROCK.x1) { stood += 1; assert.ok(h.y > ROCK.y + ROCK.h, 'down on the gravel'); }
    last = h.x;
  }
  assert.ok(last > 1, 'the last step is past the glass');
  assert.ok(walked > 20 && stood > 600, 'walks in stages and looks back for minutes');
  assert.ok(t <= sun.set + HIKER_GONE * MIN);
});

test('a preview stepped through the evening always catches the hiker on the way out', () => {
  assert.ok(HIKER_SPAN_MS > SCRUB_STEP_MIN * MIN);
  for (let k = 0; k < SCRUB_STEP_MIN; k++) {
    let caught = false;
    for (let t = sun.set - 60 * MIN + k * MIN; t < sun.set + 60 * MIN; t += SCRUB_STEP_MIN * MIN) {
      const h = hikerAt(t, sun);
      if (h && h.pose !== 'sit' && inView(h)) caught = true;
    }
    assert.ok(caught, `offset ${k}`);
  }
});

test('the morning is the evening backwards: the hiker walks in from the right after sunrise', () => {
  const early = hikerAt(sun.rise + 10 * MIN, sun);
  assert.ok(early && early.x > ROCK.x1 && early.pose === 'stand');
  let t = sun.rise;
  while (!hikerAt(t, sun) || hikerAt(t, sun).pose !== 'walk') t += 1000;
  assert.equal(hikerAt(t, sun).dir, -1, 'heading for the rock');
  assert.equal(hikerAt(sun.rise + HIKER_SPAN_MS + MIN, sun).pose, 'sit');
});

test('visitors keep to the middle of the day, and each place stands clear of the label and the lake', () => {
  const plateShare = (LABEL.y - bodyRect().y) / 396;
  for (const p of PLACES) {
    if (!p.rock) assert.ok(p.y > GRAVEL.y0 + 0.03 && p.y < plateShare - 0.01, `feet on the gravel at ${p.x}`);
    assert.ok(p.x > 0.07 && p.x < 0.94, 'clear of the glass streaks');
  }
  const others = (t, season) => shoreFolk(t, location, season).filter((f) => f.id !== 'hiker');
  for (let t = sun.rise; t < sun.rise + VISITORS_AFTER * MIN; t += 20000) assert.equal(others(t).length, 0);
  for (let t = sun.set - VISITORS_BEFORE * MIN; t < sun.set + 60 * MIN; t += 20000) assert.equal(others(t).length, 0);
  assert.equal(visitorAt(99, T_NOON, sun), null);
  assert.equal(visitorAt(0, T_NOON, null), null);
});

test('through a summer day people sit, stand, walk both ways and take the seat on the rock; winter is quieter', () => {
  const seen = { sit: 0, stand: 0, left: 0, right: 0, rock: 0, most: 0, total: 0, n: 0 };
  let winter = 0;
  const wsun = sunWindow(T_JULY, location);
  for (let t = sun.rise; t < sun.set; t += 15000) {
    const folk = shoreFolk(t, location, 'summer').filter((f) => f.id !== 'hiker' && inView(f));
    for (const f of folk) {
      if (f.pose === 'sit') seen.sit += 1;
      if (f.pose === 'stand') seen.stand += 1;
      if (f.pose === 'walk') seen[f.dir < 0 ? 'left' : 'right'] += 1;
      if (f.pose === 'sit' && f.rock) seen.rock += 1;
    }
    seen.most = Math.max(seen.most, folk.length);
    seen.total += folk.length;
    seen.n += 1;
  }
  for (let t = wsun.rise; t < wsun.set; t += 15000) winter += shoreFolk(t, location, 'winter').filter((f) => f.id !== 'hiker' && inView(f)).length;
  assert.ok(seen.sit > 0 && seen.stand > 0 && seen.left > 0 && seen.right > 0 && seen.rock > 0, JSON.stringify(seen));
  const mean = seen.total / seen.n;
  assert.ok(mean > 1.5 && mean < 5.5 && seen.most <= PLACES.length, `a few at a time (${mean.toFixed(2)}, at most ${seen.most})`);
  assert.ok(winter / ((wsun.set - wsun.rise) / 15000) < mean / 2, 'fewer in winter');
  assert.deepEqual(shoreFolk(T_NOON, location), shoreFolk(T_NOON, location), 'the same moment, the same people');
});

test('paint reports the hiker and counts the visitors in view; a walker asks for a quick tick', () => {
  let walking = null;
  let resting = null;
  for (let t = T_NOON; t < T_NOON + 40 * MIN && !(walking && resting); t += 5000) {
    const folk = shoreFolk(t, location, 'summer');
    if (folk.some((f) => f.pose === 'walk')) walking ??= t;
    else resting ??= t;
  }
  const { out } = paintAt(walking);
  assert.equal(out.hiker, true);
  assert.equal(out.tourists, shoreFolk(walking, location, 'summer').filter((f) => f.id !== 'hiker' && inView(f)).length);
  assert.ok(out.tourists >= 1);
  assert.equal(elChalten.cadenceMs(still, { nowMs: walking }), WALK_TICK_MS);
  assert.equal(elChalten.cadenceMs(still, { nowMs: walking, reduced: true }), WALK_TICK_MS * 2);
  assert.equal(elChalten.cadenceMs({ ...still, windSpeed: 30 }, { nowMs: walking }), WALK_TICK_MS, 'the smallest wins');
  assert.equal(elChalten.cadenceMs(still, { nowMs: resting }), 0, 'everybody sitting or standing in dead still air: no tick');
  // any air that moves gives the day its own tick (the condor circling, the water at the shore); the night has none
  const light = { ...still, windSpeed: 6 };
  assert.equal(elChalten.cadenceMs(light, { nowMs: resting }), 250);
  assert.equal(elChalten.cadenceMs(light, { nowMs: resting, reduced: true }), 500);
  assert.equal(elChalten.cadenceMs(light, { nowMs: sun.set + 3 * 60 * MIN }), 0, 'a calm night is still');
  assert.equal(elChalten.cadenceMs(still, {}), 0);
});

test('at dusk the hiker is still in the picture on the way out, with a headlamp once the light is low', () => {
  const leaving = paintAt(sun.set + 10 * MIN);
  assert.equal(leaving.out.hiker, true);
  assert.equal(leaving.out.tourists, 0);
  let t = sun.set;
  while (paintAt(t).light >= LAMP_THRESHOLD) t += MIN;
  assert.ok(hikerAt(t + MIN, sun), 'still on the shore when the lamps come on');
  assert.ok(paintAt(t + MIN).fills.has(css(EC.headlamp)), 'a headlamp on the way out');
  assert.ok(!paintAt(sun.set - 30 * MIN).fills.has(css(EC.headlamp)), 'none by day');
  const dark = paintAt(sun.set + (HIKER_GONE + 5) * MIN);
  assert.equal(dark.out.hiker, false);
  assert.equal(dark.out.tourists, 0);
});
