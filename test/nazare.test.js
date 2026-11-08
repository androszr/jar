import { test } from 'node:test';
import assert from 'node:assert/strict';
import nazare from '../src/cities/nazare/index.js';
import {
  HORIZON, CLIFF, FORT, TOWER, LANTERN, WAVE, BEACH, STREAK_CLEAR, buildPlates, nightAmount, sunSide, layout, waveState, surferSpots,
} from '../src/cities/nazare/scene.js';
import { NAZARE } from '../src/cities/nazare/palette.js';
import { EMPTY } from '../src/weather.js';
import { css, tint, STREAKS } from '../src/look/index.js';
import { sample } from '../src/clock.js';
import { surferPlan } from '../src/cities/nazare/sea.js';
import { LABEL } from '../src/jar-geometry.js';
import { bodyRect } from '../src/jar.js';

const rect = { x: 0, y: 0, w: 340, h: 396 };
const PHASE = { noon: 0.4, dusk: 0.84, night: 0.92 };
const plateShare = (LABEL.y - bodyRect().y) / 396; // 292 / 396

function recordingCtx() {
  const fills = new Set();
  const strokes = new Set();
  const calls = [];
  const target = {
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  return new Proxy(target, {
    get(t, k) {
      if (k === 'fills') return fills;
      if (k === 'strokes') return strokes;
      if (k === 'calls') return calls;
      if (k in t) return t[k];
      return (...a) => { calls.push([String(k), a]); return a; };
    },
    set(t, k, v) {
      if (k === 'fillStyle' && typeof v === 'string') fills.add(v);
      if (k === 'strokeStyle' && typeof v === 'string') strokes.add(v);
      t[k] = v;
      return true;
    },
  });
}

function noRandom(fn) {
  const real = Math.random;
  Math.random = () => { throw new Error('Math.random in a draw function'); };
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

function paint(phase, weather = EMPTY, nowMs = 0) {
  const ctx = recordingCtx();
  const out = noRandom(() => nazare.paint(ctx, rect, phase, tint(sample(phase)), weather, buildPlates(rect.w, rect.h), nowMs));
  return Object.assign(ctx, { out });
}

test('the geometry: horizon above the plate, cliff on the right, fort and tower on the cliff top', () => {
  assert.ok(HORIZON < plateShare);
  assert.ok(CLIFF.foot.x > 0.5 && CLIFF.top.x0 > CLIFF.foot.x);
  assert.ok(FORT.x0 >= CLIFF.top.x0 && FORT.x1 <= CLIFF.top.x1);
  assert.equal(FORT.y1, CLIFF.top.y);
  assert.ok(TOWER.x0 >= FORT.x0 && TOWER.x1 <= FORT.x1);
  assert.equal(TOWER.y1, FORT.y0);
  assert.ok(LANTERN.y < TOWER.y0 + 0.01 && LANTERN.roof.y0 < LANTERN.y);
});

test('the tower and the fort keep clear of both glass streaks, which agree with the look', () => {
  for (const [a, b] of STREAK_CLEAR) {
    for (const part of [TOWER, FORT]) assert.ok(part.x1 <= a || part.x0 >= b, 'a part sits under a streak');
  }
  assert.deepEqual(STREAK_CLEAR, STREAKS.map((s) => [s.x, s.x + s.w]));
});

test('the wave breaks below the horizon and above the beach, which ends at the plate', () => {
  assert.ok(WAVE.formY > HORIZON && WAVE.breakY > WAVE.formY);
  assert.ok(WAVE.breakY < BEACH.y0);
  assert.ok(BEACH.y0 < BEACH.y1 && BEACH.y1 <= plateShare + 1e-9);
  assert.ok(WAVE.shoulderX < WAVE.peakX && WAVE.peakX < WAVE.x1);
});

test('painting never touches Math.random: noon, dusk and night, clear, rain, fog and snow', () => {
  for (const phase of Object.values(PHASE)) {
    for (const kind of ['clear', 'rain', 'fog', 'snow']) {
      assert.doesNotThrow(() => paint(phase, { ...EMPTY, kind, known: true, cloudCover: 30, windSpeed: 20, windDir: 270 }, 12345));
    }
  }
});

test('paint reports a moderate sea with three surfers at noon and none at night', () => {
  const noon = paint(PHASE.noon).out;
  assert.equal(noon.band, 'moderate');
  assert.equal(noon.surfers, 3);
  assert.ok(noon.waveSize > 0);
  assert.equal(paint(PHASE.night).out.surfers, 0);
});

test('a giant sea draws the tow-in pair and a taller wave than a calm one', () => {
  const giant = paint(PHASE.noon, { ...EMPTY, sea: { waveHeight: 8, wavePeriod: null, waveDir: null } }).out;
  const calm = paint(PHASE.noon, { ...EMPTY, sea: { waveHeight: 0.5, wavePeriod: null, waveDir: null } }).out;
  assert.deepEqual([giant.band, giant.surfers], ['giant', 2]);
  assert.deepEqual([calm.band, calm.surfers], ['calm', 0]);
  assert.ok(giant.waveSize > calm.waveSize);
});

test('the same moment draws the same calls; a later one does not', () => {
  const a = paint(PHASE.noon, EMPTY, 5000).calls;
  const b = paint(PHASE.noon, EMPTY, 5000).calls;
  const c = paint(PHASE.noon, EMPTY, 8000).calls;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('the lantern glows at night and not at noon', () => {
  const lit = css(NAZARE.lanternLight, 1);
  assert.ok(paint(PHASE.night).fills.has(lit));
  assert.ok(![...paint(PHASE.noon).fills].some((f) => f.startsWith('rgba(255, 214, 120,')));
});

test('snow caps appear in snow only', () => {
  assert.ok(paint(PHASE.noon, { ...EMPTY, kind: 'snow' }).fills.has(css(NAZARE.snowCap)));
  assert.ok(!paint(PHASE.noon).fills.has(css(NAZARE.snowCap)));
});

test('nightAmount and sunSide', () => {
  assert.equal(nightAmount(1), 0);
  assert.equal(nightAmount(0), 1);
  assert.equal(sunSide(0.1), -1);
  assert.equal(sunSide(0.6), 1);
});

test('buildPlates is deterministic', () => {
  assert.deepEqual(buildPlates(340, 396), buildPlates(340, 396));
  assert.equal(buildPlates(340, 396).windows.length, 3);
});

test('every surfer stays on the wave face, at 8 m and 12 m', () => {
  const L = layout(340, 396);
  for (const metres of [8, 12]) {
    const weather = { ...EMPTY, sea: { waveHeight: metres, wavePeriod: null, waveDir: null } };
    for (let t = 0; t < 120000; t += 250) {
      const state = waveState(L, weather, t, false);
      const plan = surferPlan('giant', 1);
      for (const s of surferSpots(L, weather, state, plan, t)) {
        assert.ok(s.y <= L.Y(state.baseTop + WAVE.face), `${metres} m at ${t} ms: surfer below the face`);
      }
    }
  }
});
