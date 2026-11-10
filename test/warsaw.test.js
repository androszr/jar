import { test } from 'node:test';
import assert from 'node:assert/strict';
import warsaw from '../src/cities/warsaw/index.js';
import {
  SKYLINE, MERMAID, BACK_ROW, FRONT_ROW, PALACE, RIM_DX, FAR_BANK, RIVER_TOP, QUAY_TOP, BOULEVARD, STREAK_CLEAR,
  buildPlates, layout, nightAmount, sunSide, drawMermaid, drawSkyline, flagDay,
} from '../src/cities/warsaw/scene.js';
import { BRIDGE, deckY, drawBridge } from '../src/cities/warsaw/bridge.js';
import { WARSAW } from '../src/cities/warsaw/palette.js';
import { hash2 } from '../src/skyweather.js';
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

function paint(phase, weather = EMPTY, nowMs = 0) {
  const ctx = recordingCtx();
  noRandom(() => warsaw.paint(ctx, rect, phase, tint(sample(phase)), weather, buildPlates(rect.w, rect.h), nowMs));
  return ctx;
}

const startsWith = (set, prefix) => [...set].filter((s) => s.startsWith(prefix));
const rgbaOf = (c) => `rgba(${c.join(', ')},`;
const AVIATION = 'rgba(255, 70, 60,';
const SPIRE_EDGE = 'rgba(235, 245, 255,';

test('the skyline from Praga: Varso and the Palace on the left, the cluster to the right, Varso tallest', () => {
  assert.deepEqual(SKYLINE.map((t) => t.id), ['varso', 'pkin', 'zlota', 'intercontinental', 'spire', 'cosmopolitan']);
  const xs = SKYLINE.map((t) => t.x);
  assert.deepEqual([...xs].sort((a, b) => a - b), xs);
  const top = (t) => t.top ?? t.mast ?? t.h;
  assert.equal(SKYLINE.reduce((a, b) => (top(b) > top(a) ? b : a)).id, 'varso');
  const pkin = SKYLINE.find((t) => t.id === 'pkin');
  assert.ok(pkin.x < 0.5, 'the Palace stands left of centre');
  for (const t of SKYLINE) assert.ok(top(t) <= FAR_BANK, t.id);
});

test('the Palace is a straight shaft with a crown and a needle, not a stepped pyramid', () => {
  const [wings, front, shaft, crown, lantern, cupola] = PALACE.masses;
  assert.ok(wings.hw > front.hw && front.hw > shaft.hw && shaft.hw > crown.hw && crown.hw > lantern.hw && lantern.hw > cupola.hw);
  assert.ok(shaft.top - front.top > 0.5 * shaft.top, 'the shaft rises straight for more than half the height');
  assert.ok(PALACE.needle - cupola.top >= 0.2 * PALACE.needle, 'the needle is at least a fifth of the height');
  assert.equal(PALACE.needle, SKYLINE.find((t) => t.id === 'pkin').top);
  for (const [i, n] of PALACE.combs) assert.ok(i < PALACE.masses.length && n >= 4);
});

test('the bands run top to bottom: towers, low city, boulevard, river, forest', () => {
  assert.ok(FAR_BANK < RIVER_TOP - BOULEVARD && RIVER_TOP < QUAY_TOP);
  for (const b of FRONT_ROW) assert.ok(b.top < RIVER_TOP && b.top > FAR_BANK - 0.06);
});

test('the river sits above the label plate and the Mermaid stands on the far quay, left of it', () => {
  const L = layout(340, 396);
  assert.ok(Math.abs(L.river.top - 0.64 * 396) < 1e-9);
  assert.ok(Math.abs(L.river.bottom - 0.69 * 396) < 1e-9);
  assert.ok(Math.abs(L.plinth.bottom - L.river.top) < 1, 'her plinth stands on the far quay, at the water');
  assert.ok(L.mermaid.bottom <= L.river.top && L.mermaid.bottom >= L.plinth.top - 2, 'she stands on her plinth');
  assert.ok(L.mermaid.top > L.gy - 0.06 * 396, 'she is small, seen across the river');
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
// The Palace: the highest mass that holds x.
function palaceRoofAt(x) {
  const px = SKYLINE.find((t) => t.id === 'pkin').x * 340;
  let best = -Infinity;
  for (const m of PALACE.masses) if (Math.abs(x - px) <= m.hw * 340 + 1e-9) best = Math.max(best, m.top * 396);
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
  const front = FRONT_ROW.map((b) => [(b.x - b.hw) * 340, b.top * 396]);
  let frontCaps = 0;
  for (const [, [x, y, w]] of caps) {
    if (Math.abs(y - (L.plinth.top - 3)) < 0.5) continue; // the plinth's own cap
    if (y >= L.quayTop) continue; // snow on the near bank's trees, not a roof
    if (front.some(([fx, fy]) => Math.abs(fx - x) < 1e-6 && Math.abs(fy - y) < 1e-6)) { frontCaps++; continue; } // the low city's roofs
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
  assert.equal(frontCaps, FRONT_ROW.length);
});

test('the Palace is sandstone by day and floodlit by night', () => {
  const stone = css(WARSAW.stoneDay);
  assert.ok(paint(PHASE.noon).fills.has(stone));
  assert.ok(!paint(PHASE.night).fills.has(stone));
  assert.ok(startsWith(paint(PHASE.noon).fills, rgbaOf(WARSAW.needleGlint)).length > 0, 'the needle glints by day');
});

test('flag days: white over red on 3 May and 11 November in Warsaw, gold otherwise', () => {
  assert.equal(flagDay(Date.UTC(2026, 10, 11, 20)), true);
  assert.equal(flagDay(Date.UTC(2026, 4, 3, 12)), true);
  assert.equal(flagDay(Date.UTC(2026, 10, 10, 23, 30)), true, '23:30 UTC on the 10th is 00:30 on the 11th in Warsaw');
  assert.equal(flagDay(Date.UTC(2026, 10, 11, 23, 30)), false, '23:30 UTC on the 11th is the 12th in Warsaw');
  assert.equal(flagDay(Date.UTC(2026, 10, 8, 20)), false);
  assert.equal(flagDay(NaN), false);
  const red = rgbaOf(WARSAW.flagRed);
  const flag = paint(PHASE.night, EMPTY, Date.UTC(2026, 10, 11, 20));
  assert.ok(startsWith(flag.fills, red).length > 0);
  assert.equal(startsWith(paint(PHASE.night, EMPTY, Date.UTC(2026, 10, 8, 20)).fills, red).length, 0);
  assert.equal(startsWith(paint(PHASE.noon, EMPTY, Date.UTC(2026, 10, 11, 12)).fills, red).length, 0, 'no floodlight by day');
});

test('the bridge leaves the far quay and lands in the near forest, above the label plate', () => {
  const L = layout(340, 396);
  const left = deckY(L, L.X(BRIDGE.x0));
  const right = deckY(L, L.X(1));
  assert.ok(Math.abs(left - (L.river.top - 2)) < 1e-6, `deck starts at the far quay (${left})`);
  assert.ok(right >= L.quayTop, `deck lands on the near bank (${right})`);
  assert.ok(right < plateTop);
  assert.ok(L.X(BRIDGE.x0) > L.plinth.x1 + 0.1 * 340, 'the bridge leaves the far quay well right of the Mermaid');
  const pylon = L.X(BRIDGE.pylon);
  assert.ok(deckY(L, pylon) > L.quayTop - 12 && L.quayTop + 10 < plateTop, 'the pylon stands on the near bank');
});

test('the bridge lights its pylon and deck at night only, and never touches Math.random', () => {
  const draw = (phase) => {
    const ctx = recordingCtx();
    noRandom(() => drawBridge(ctx, rect, phase, tint(sample(phase)), EMPTY));
    return ctx;
  };
  const light = rgbaOf(WARSAW.pylonLight);
  assert.ok(startsWith(draw(PHASE.night).fills, light).length > 0);
  assert.equal(startsWith(draw(PHASE.noon).fills, light).length, 0);
  noRandom(() => drawBridge(recordingCtx(), rect, PHASE.noon, tint(sample(PHASE.noon)), { ...EMPTY, kind: 'snow' }));
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

test('the low city is plaster, brick and concrete, never blue, and mixes several façades', () => {
  for (const [r, , b] of WARSAW.facades) assert.ok(r >= b, `façade ${r},${b} leans blue`);
  const picked = new Set(FRONT_ROW.map((_, i) => Math.floor(hash2(i, 64) * WARSAW.facades.length)));
  assert.ok(picked.size >= 4, `only ${picked.size} façade colours in use`);
});

test('lamps light the far bank\'s boulevard at night; the near bank is forest with no lamp or path', () => {
  const ctx = recordingCtx();
  noRandom(() => warsaw.paint(ctx, rect, PHASE.night, tint(sample(PHASE.night)), EMPTY, buildPlates(340, 396), 0));
  const L = layout(340, 396);
  const lamp = rgbaOf(WARSAW.quayLamp);
  const lamps = ctx.calls.filter(([m, , style]) => m === 'fillRect' && typeof style === 'string' && style.startsWith(lamp));
  assert.ok(lamps.length >= 10, 'a row of lamps along the boulevard');
  for (const [, [, y]] of lamps) assert.ok(y < L.river.top, `lamp at y ${y} is on the far side of the river`);
  assert.equal(WARSAW.promenadeLamp, undefined);
  assert.equal(WARSAW.wallDay, undefined);
});

const DAY_REFLECTS = [
  ['reflectDayPalace', 0.4, 0],
  ['reflectDayVarso', 0.235, 0],
  ['reflectDayZlota', 0.555, 0],
  ['reflectDaySpire', 0.72, 6],
];

test('reflections by day: sandstone under the Palace, pale under the towers, none at night, night set unchanged', () => {
  const noon = paint(PHASE.noon);
  const night = paint(PHASE.night);
  for (const [name] of DAY_REFLECTS) {
    assert.ok(startsWith(noon.fills, rgbaOf(WARSAW[name])).length > 0, `${name} by day`);
    assert.equal(startsWith(night.fills, rgbaOf(WARSAW[name])).length, 0, `${name} not at night`);
  }
  assert.ok(startsWith(night.fills, rgbaOf(WARSAW.reflectPalace)).length > 0, 'the night streaks are still there');
});

test('reflections by day sit inside the river, under their own towers', () => {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const ctx = paint(PHASE.noon);
  const wids = { reflectDayPalace: 44, reflectDayVarso: 17, reflectDayZlota: 24, reflectDaySpire: 20 };
  for (const [name, share, off] of DAY_REFLECTS) {
    const prefix = rgbaOf(WARSAW[name]);
    const rects = ctx.calls.filter((c) => c[0] === 'fillRect' && typeof c[2] === 'string' && c[2].startsWith(prefix));
    assert.ok(rects.length > 0, name);
    for (const [, [x, y, w, h]] of rects) {
      assert.ok(y >= L.river.top - 1e-9 && y + h <= L.river.bottom + 1e-9, `${name} inside the river`);
      assert.ok(Math.abs(x + w / 2 - (L.X(share) + off * L.sx)) <= wids[name] * L.sx, `${name} under its tower`);
    }
  }
});

test('reflections by day follow the phase, not the clock', () => {
  const grab = (nowMs) => paint(PHASE.noon, EMPTY, nowMs).calls.filter((c) => c[0] === 'fillRect' && typeof c[2] === 'string' && DAY_REFLECTS.some(([n]) => c[2].startsWith(rgbaOf(WARSAW[n])))).map((c) => [c[2], c[1]]);
  const a = grab(0);
  assert.ok(a.length > 0);
  assert.deepEqual(a, grab(99999));
});
