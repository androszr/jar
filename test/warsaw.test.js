import { test } from 'node:test';
import assert from 'node:assert/strict';
import warsaw from '../src/cities/warsaw/index.js';
import { SKYLINE, MERMAID, GROUND, buildPlates } from '../src/cities/warsaw/scene.js';
import { WARSAW } from '../src/cities/warsaw/palette.js';
import { EMPTY } from '../src/weather.js';
import { css, tint } from '../src/look/index.js';
import { sample } from '../src/clock.js';

const rect = { x: 0, y: 0, w: 340, h: 396 };

// A 2D context that does nothing but remember the fill styles it was given.
function recordingCtx() {
  const fills = new Set();
  const calls = [];
  const target = {
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  return new Proxy(target, {
    get(t, k) {
      if (k === 'fills') return fills;
      if (k === 'calls') return calls;
      if (k in t) return t[k];
      return (...a) => { calls.push(String(k)); return a; };
    },
    set(t, k, v) {
      if (k === 'fillStyle' && typeof v === 'string') fills.add(v);
      t[k] = v;
      return true;
    },
  });
}

function paint(noon, weather = EMPTY) {
  const ctx = recordingCtx();
  const real = Math.random;
  Math.random = () => { throw new Error('Math.random in a draw function'); };
  try {
    warsaw.paint(ctx, rect, noon ? 0.5 : 0.02, tint(sample(noon ? 0.5 : 0.02)), weather, buildPlates(rect.w, rect.h), 0);
  } finally {
    Math.random = real;
  }
  return ctx;
}

test('the skyline has the five landmarks, left to right, Varso tallest, the Palace central', () => {
  assert.deepEqual(SKYLINE.map((t) => t.id), ['varso', 'pkin', 'spire', 'zlota', 'intercontinental']);
  const xs = SKYLINE.map((t) => t.x);
  assert.deepEqual([...xs].sort((a, b) => a - b), xs);
  const tallest = SKYLINE.reduce((a, b) => (b.top > a.top ? b : a));
  assert.equal(tallest.id, 'varso');
  const nearest = SKYLINE.reduce((a, b) => (Math.abs(b.x - 0.5) < Math.abs(a.x - 0.5) ? b : a));
  assert.equal(nearest.id, 'pkin');
  for (const t of SKYLINE) assert.ok(t.top < 0.8 && t.top <= GROUND, t.id);
});

test('the Mermaid stands on the quay', () => {
  assert.ok(MERMAID.x > 0.1 && MERMAID.x < 0.9);
  assert.ok(MERMAID.h > 0 && MERMAID.plinth.h > 0);
});

test('painting never touches Math.random, at noon or at night, with EMPTY weather', () => {
  paint(true);
  paint(false);
});

test('windows light at night and not at noon', () => {
  assert.ok(paint(false).fills.has(css(WARSAW.windowGlow, 0.9)));
  assert.ok(!paint(true).fills.has(css(WARSAW.windowGlow, 0.9)));
});

test('snow caps appear in snow only', () => {
  assert.ok(paint(true, { ...EMPTY, kind: 'snow' }).fills.has(css(WARSAW.snowCap)));
  assert.ok(!paint(true).fills.has(css(WARSAW.snowCap)));
});

test('buildPlates is deterministic', () => {
  assert.deepEqual(buildPlates(340, 396), buildPlates(340, 396));
});
