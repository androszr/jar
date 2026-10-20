import { test } from 'node:test';
import assert from 'node:assert/strict';
import warsaw from '../src/cities/warsaw/index.js';
import {
  SKYLINE, MERMAID, BACK_ROW, RIM_DX, FAR_BANK, STREAK_CLEAR, buildPlates, layout, nightAmount, sunSide, drawMermaid,
} from '../src/cities/warsaw/scene.js';
import { WARSAW } from '../src/cities/warsaw/palette.js';
import { EMPTY } from '../src/weather.js';
import { css, tint, STREAKS } from '../src/look/index.js';
import { sample } from '../src/clock.js';
import { LABEL } from '../src/jar-geometry.js';
import { bodyRect } from '../src/jar.js';

const rect = { x: 0, y: 0, w: 340, h: 396 };
const PHASE = { noon: 0.4, dusk: 0.84, night: 0.92 };
const plateTop = LABEL.y - bodyRect().y; // the label plate's top in body px (292)

// A 2D context that remembers the fill and stroke styles it was given and every call.
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
      if (k === 'fillRect') return (...a) => { calls.push(['fillRect', a, t.fillStyle]); return a; };
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

function paint(phase, weather = EMPTY) {
  const ctx = recordingCtx();
  noRandom(() => warsaw.paint(ctx, rect, phase, tint(sample(phase)), weather, buildPlates(rect.w, rect.h), 0));
  return ctx;
}

const startsWith = (set, prefix) => [...set].filter((s) => s.startsWith(prefix));
const AVIATION = 'rgba(255, 70, 60,';
const SPIRE_EDGE = 'rgba(235, 245, 255,';

test('the skyline has six landmarks, left to right, Varso tallest, the Palace central', () => {
  assert.deepEqual(SKYLINE.map((t) => t.id), ['cosmopolitan', 'varso', 'pkin', 'spire', 'zlota', 'intercontinental']);
  const xs = SKYLINE.map((t) => t.x);
  assert.deepEqual([...xs].sort((a, b) => a - b), xs);
  const top = (t) => t.top ?? t.mast ?? t.h;
  assert.equal(SKYLINE.reduce((a, b) => (top(b) > top(a) ? b : a)).id, 'varso');
  assert.equal(SKYLINE.reduce((a, b) => (Math.abs(b.x - 0.5) < Math.abs(a.x - 0.5) ? b : a)).id, 'pkin');
  for (const t of SKYLINE) assert.ok(top(t) <= FAR_BANK, t.id);
});

test('the river sits above the label plate and the Mermaid stands left of it', () => {
  const L = layout(340, 396);
  assert.ok(Math.abs(L.river.top - 237.6) < 1e-9);
  assert.ok(Math.abs(L.river.bottom - 277.2) < 1e-9);
  assert.equal(plateTop, 292);
  assert.ok(L.river.top < plateTop && L.river.bottom < plateTop);
  assert.ok(L.mermaid.x1 < LABEL.x);
  assert.ok(L.mermaid.top < plateTop && L.mermaid.bottom < plateTop);
  assert.ok(L.plinth.bottom <= 296);
});

test('no landmark sits under a glass streak, and the scene agrees with the look', () => {
  const L = layout(340, 396);
  for (const lm of L.landmarks) {
    for (const [a, b] of STREAK_CLEAR) assert.ok(lm.x1 / 340 <= a || lm.x0 / 340 >= b, `${lm.id} under a streak`);
  }
  assert.deepEqual(STREAK_CLEAR, STREAKS.map((s) => [s.x, s.x + s.w]));
});

test('the Mermaid is drawn left of the label plate, above its top', () => {
  const ctx = recordingCtx();
  drawMermaid(ctx, rect, PHASE.night, tint(sample(PHASE.night)), EMPTY);
  const pts = ctx.calls.filter(([m]) => m === 'moveTo' || m === 'lineTo' || m === 'arc');
  assert.ok(pts.length > 10);
  for (const [m, a] of ctx.calls.filter(([n]) => n === 'arc')) assert.ok(a[0] - a[2] >= 0.07 * 340, `arc left edge ${a[0] - a[2]}`);
  assert.ok(layout(340, 396).mermaid.x0 >= 0.07 * 340);
  for (const [m, a] of pts) {
    assert.ok(a[0] < LABEL.x && a[0] >= 20, `${m} x ${a[0]}`);
    assert.ok(a[1] >= 170 && a[1] <= 296, `${m} y ${a[1]}`);
  }
  assert.ok(MERMAID.x * 340 < LABEL.x);
});

test('nightAmount and sunSide', () => {
  assert.equal(nightAmount(1), 0);
  assert.equal(nightAmount(0.55), 0);
  assert.ok(Math.abs(nightAmount(0.4) - 0.5) < 1e-9);
  assert.equal(nightAmount(0.08), 1);
  assert.equal(sunSide(0.3), -1);
  assert.equal(sunSide(0.5), 1);
});

test('painting never touches Math.random, at noon, dusk or night, in clear or snow', () => {
  for (const p of Object.values(PHASE)) {
    paint(p);
    paint(p, { ...EMPTY, kind: 'snow' });
  }
});

test('the aviation light and the spire edge glow at night, dusk blends, noon has neither', () => {
  const night = paint(PHASE.night);
  assert.ok(startsWith(night.fills, AVIATION).length > 0);
  assert.ok(startsWith(night.strokes, SPIRE_EDGE).length > 0);
  const noon = paint(PHASE.noon);
  assert.equal(startsWith(noon.fills, AVIATION).length, 0);
  assert.equal(startsWith(noon.strokes, SPIRE_EDGE).length, 0);
  const dusk = paint(PHASE.dusk);
  const alphas = startsWith(dusk.fills, AVIATION).map((s) => Number(s.slice(AVIATION.length, -1)));
  assert.ok(alphas.length > 0);
  assert.ok(alphas.every((a) => a > 0 && a < 1), `dusk aviation alphas ${alphas}`);
});

test('windows on the background blocks light at night and not at noon', () => {
  assert.ok(startsWith(paint(PHASE.night).fills, css(WARSAW.backWindow, 0).slice(0, 18)).length > 0);
  assert.equal(startsWith(paint(PHASE.noon).fills, css(WARSAW.backWindow, 0).slice(0, 18)).length, 0);
});

test('snow caps appear in snow only', () => {
  assert.ok(paint(PHASE.noon, { ...EMPTY, kind: 'snow' }).fills.has(css(WARSAW.snowCap)));
  assert.ok(!paint(PHASE.noon).fills.has(css(WARSAW.snowCap)));
});

test('buildPlates is deterministic', () => {
  assert.deepEqual(buildPlates(340, 396), buildPlates(340, 396));
});

test('the background blocks keep clear of the left edge', () => {
  assert.ok(BACK_ROW.every((b) => b.x - b.hw >= 0.17));
});

// The roof line of each landmark in a 340 x 396 body: [x px, height above the far bank] points.
function roofLines(L) {
  const sample = (p0, p1, p2, n = 24) => Array.from({ length: n + 1 }, (_, i) => {
    const u = i / n;
    const f = (a, b, c) => (1 - u) * (1 - u) * a + 2 * u * (1 - u) * b + u * u * c;
    return [f(p0[0], p1[0], p2[0]), f(p0[1], p1[1], p2[1])];
  });
  const at = (id) => SKYLINE.find((t) => t.id === id);
  const c = (id) => at(id).x * 340;
  const hw = (id) => at(id).hw * 340;
  const lines = {};
  lines.cosmopolitan = sample([c('cosmopolitan') - hw('cosmopolitan'), 120], [c('cosmopolitan'), 134], [c('cosmopolitan') + hw('cosmopolitan'), 124]);
  lines.varso = [[c('varso') - hw('varso'), 0.379 * 396], [c('varso') - 5, 0.449 * 396], [c('varso') + 5, 0.449 * 396], [c('varso') + hw('varso'), 0.379 * 396]];
  lines.spire = [[c('spire') - hw('spire'), 150], [c('spire') - 4, 0.396 * 396],
    ...sample([c('spire') - 4, 0.396 * 396], [c('spire') + hw('spire'), 132], [c('spire') + hw('spire'), 78])];
  const zl = c('zlota') - hw('zlota');
  lines.zlota = [[zl, 0.359 * 396], ...sample([zl, 0.359 * 396], [zl + 20, 138], [zl + 2 * hw('zlota'), 110])];
  lines.intercontinental = [[c('intercontinental') - hw('intercontinental'), 118], [c('intercontinental') + hw('intercontinental'), 118]];
  return lines;
}
function roofAt(line, x) {
  for (let i = 0; i < line.length - 1; i++) {
    const [xa, ya] = line[i];
    const [xb, yb] = line[i + 1];
    if (x >= xa - 1e-9 && x <= xb + 1e-9) return xb === xa ? Math.max(ya, yb) : ya + ((yb - ya) * (x - xa)) / (xb - xa);
  }
  return -Infinity;
}
// The Palace: the highest rect (base block or tier) that holds x.
function palaceRoofAt(x) {
  const px = 170;
  let best = -Infinity;
  if (Math.abs(x - px) <= 64 + 1e-9) best = 0.061 * 396;
  for (const [h, top] of [[30, 92], [24, 108], [18, 122], [13, 134], [9, 146], [5, 156]]) if (Math.abs(x - px) <= h + 1e-9) best = Math.max(best, top);
  return best;
}

test('snow caps sit on the roofs: at both ends of every cap the roof is at or above its top', () => {
  const ctx = recordingCtx();
  const ph = PHASE.noon;
  noRandom(() => warsaw.paint(ctx, rect, ph, tint(sample(ph)), { ...EMPTY, kind: 'snow' }, buildPlates(340, 396), 0));
  const L = layout(340, 396);
  const lines = roofLines(L);
  const caps = ctx.calls.filter(([m, , style]) => m === 'fillRect' && style === css(WARSAW.snowCap));
  assert.ok(caps.length >= 8);
  const seen = new Set();
  for (const [, [x, y, w]] of caps) {
    if (Math.abs(y - (L.plinth.top - 5)) < 0.5) continue; // the plinth's own cap
    const mid = x + w / 2;
    const lm = L.landmarks.reduce((a, b) => (Math.abs((b.x0 + b.x1) / 2 - mid) < Math.abs((a.x0 + a.x1) / 2 - mid) ? b : a));
    seen.add(lm.id);
    const capH = L.gy - y;
    const roof = lm.id === 'pkin' ? palaceRoofAt : (px) => roofAt(lines[lm.id], px);
    for (const px of [x, x + w]) {
      assert.ok(roof(px) >= capH - 0.5, `${lm.id}: roof ${roof(px)} below cap top ${capH} at x ${px}`);
      assert.ok(roof(px) - capH <= 12, `${lm.id}: cap buried ${roof(px) - capH} px under the roof at x ${px}`);
    }
  }
  assert.deepEqual([...seen].sort(), ['cosmopolitan', 'intercontinental', 'pkin', 'spire', 'varso', 'zlota']);
});

test('the Mermaid is outlined on both sides at night, inside the limits', () => {
  const ctx = recordingCtx();
  drawMermaid(ctx, rect, PHASE.night, tint(sample(PHASE.night)), EMPTY);
  const shifts = ctx.calls.filter(([m]) => m === 'translate').map(([, a]) => a[0]);
  assert.deepEqual([...shifts].sort((a, b) => a - b), [...RIM_DX].sort((a, b) => a - b));
  assert.ok(RIM_DX.some((d) => d > 0) && RIM_DX.some((d) => d < 0));
  const L = layout(340, 396);
  assert.ok(L.mermaid.x1 + Math.max(...RIM_DX) < LABEL.x, 'the right rim pass stays left of the plate');
  assert.ok(L.mermaid.x0 + Math.min(...RIM_DX) >= 0.07 * 340, 'the left rim pass stays clear of the streak');
  const noon = recordingCtx();
  drawMermaid(noon, rect, PHASE.noon, tint(sample(PHASE.noon)), EMPTY);
  assert.equal(noon.calls.filter(([m]) => m === 'translate').length, 0);
});
