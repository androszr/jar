import { test } from 'node:test';
import assert from 'node:assert/strict';
import warsaw from '../src/cities/warsaw/index.js';
import {
  SKYLINE, MERMAID, BACK_ROW, FRONT_ROW, INFILL_ROW, PALACE, RIM_DX, DAY_RIM, FAR_BANK, RIVER_TOP, QUAY_TOP, BOULEVARD, STREAK_CLEAR,
  buildPlates, layout, nightAmount, ICE, iceAmount, iceFloes, sunSide, drawMermaid, drawSkyline, flagDay,
  SEASONS, seasonWeights, canopyColour, tone,
} from '../src/cities/warsaw/scene.js';
import { BRIDGE, TRAFFIC, deckY, drawBridge, trafficLights } from '../src/cities/warsaw/bridge.js';
import { WARSAW } from '../src/cities/warsaw/palette.js';
import { hash2 } from '../src/skyweather.js';
import { EMPTY } from '../src/weather.js';
import { css, mix, tint, STREAKS } from '../src/look/index.js';
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
    createLinearGradient: () => ({ addColorStop(o, c) { fills.add(c); } }),
    createRadialGradient: () => ({ addColorStop(o, c) { fills.add(c); } }),
  };
  return new Proxy(target, {
    get(t, k) {
      if (k === 'fills') return fills;
      if (k === 'strokes') return strokes;
      if (k === 'calls') return calls;
      if (k in t) return t[k];
      if (k === 'fill') return (...a) => { calls.push(['fill', a, t.fillStyle]); return a; };
      if (k === 'stroke') return (...a) => { calls.push(['stroke', a, t.strokeStyle]); return a; };
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
const MAST_LIT = rgbaOf(WARSAW.mastLit);
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

test("Varso's needle is lit at night, blends at dusk and is dark by day", () => {
  const night = paint(PHASE.night);
  assert.ok(startsWith(night.strokes, MAST_LIT).length > 0);
  assert.equal(startsWith(paint(PHASE.noon).strokes, MAST_LIT).length, 0);
  const alphas = startsWith(paint(PHASE.dusk).strokes, MAST_LIT).map((s) => Number(s.slice(MAST_LIT.length, -1)));
  assert.ok(alphas.length > 0);
  assert.ok(alphas.every((a) => a > 0 && a < 1), `dusk needle alphas ${alphas}`);
  const lit = night.calls.findIndex(([m, , style]) => m === 'stroke' && typeof style === 'string' && style.startsWith(MAST_LIT));
  const dot = night.calls.findIndex(([m, , style]) => m === 'fill' && typeof style === 'string' && style.startsWith(AVIATION));
  assert.ok(lit >= 0 && dot >= 0 && lit < dot, `lit needle at ${lit}, aviation dot at ${dot}`);
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

test('traffic lights are a pure function of the clock, move the right way and stay on the deck', () => {
  const L = layout(340, 396);
  const lo = L.X(BRIDGE.x0);
  const hi = L.X(1);
  const at = (t, reduced) => noRandom(() => trafficLights(L, t, reduced));
  const a = at(0);
  assert.deepEqual(a, at(0));
  assert.deepEqual(a, noRandom(() => trafficLights(L, 0)), 'reduced defaults to false');
  assert.equal(a.length, 2 * TRAFFIC.count);
  const b = at(1000);
  a.forEach((l, i) => {
    assert.equal(b[i].dir, l.dir);
    const d = b[i].x - l.x;
    const wrapped = Math.abs(d) > (hi - lo) / 2;
    assert.ok(wrapped || d * l.dir > 0, `light ${i} moves ${l.dir > 0 ? 'right' : 'left'}`);
  });
  for (const t of [0, 1000, 123456, 9e6]) {
    for (const l of at(t)) {
      assert.ok(l.x >= lo && l.x <= hi, `x ${l.x} within the deck`);
      const top = deckY(L, l.x);
      assert.ok(l.y >= top && l.y <= top + 4 * L.sy, 'y within the deck thickness');
    }
  }
  const slow = at(1000, true);
  a.forEach((l, i) => {
    if (Math.abs(b[i].x - l.x) > (hi - lo) / 2) return; // wrapped
    assert.ok(Math.abs(slow[i].x - l.x) < Math.abs(b[i].x - l.x), 'reduced motion moves less far');
  });
});

test('traffic lights show on the bridge at night only and the clock is wired through paint', () => {
  const draw = (phase, nowMs) => {
    const ctx = recordingCtx();
    noRandom(() => drawBridge(ctx, rect, phase, tint(sample(phase)), EMPTY, nowMs));
    return ctx;
  };
  for (const c of [WARSAW.headlight, WARSAW.taillight]) {
    assert.ok(startsWith(draw(PHASE.night, 123456).fills, rgbaOf(c)).length > 0);
    assert.equal(startsWith(draw(PHASE.noon, 123456).fills, rgbaOf(c)).length, 0);
  }
  const xs = (nowMs) => {
    const ctx = recordingCtx();
    noRandom(() => warsaw.paint(ctx, rect, PHASE.night, tint(sample(PHASE.night)), EMPTY, buildPlates(340, 396), nowMs));
    return ctx.calls.filter(([m, , f]) => m === 'fillRect' && typeof f === 'string' && f.startsWith(rgbaOf(WARSAW.headlight))).map(([, a]) => a[0]);
  };
  const x0 = xs(0);
  assert.ok(x0.length > 0);
  assert.notDeepEqual(x0, xs(5000));
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
  assert.deepEqual(noon.calls.filter(([m]) => m === 'translate').map(([, a]) => a), [[sunSide(PHASE.noon) * DAY_RIM.dx, DAY_RIM.dy]]);
  assert.ok(shifts.every((d) => Math.abs(d) !== DAY_RIM.dx), 'night carries no sunlit-sized shift');
});

test('the Mermaid is bronze by day with a sunlit edge on the sun\'s side', () => {
  const draw = (phase) => {
    const ctx = recordingCtx();
    noRandom(() => drawMermaid(ctx, rect, phase, tint(sample(phase)), EMPTY));
    return ctx;
  };
  const noon = draw(PHASE.noon);
  const night = draw(PHASE.night);
  assert.ok(noon.fills.has(css(WARSAW.mermaidBronze)), 'bronze body by day');
  assert.ok(startsWith(noon.fills, rgbaOf(WARSAW.mermaidSunlit)).length > 0, 'a sunlit pass by day');
  assert.ok(!night.fills.has(css(WARSAW.mermaidBronze)));
  assert.equal(startsWith(night.fills, rgbaOf(WARSAW.mermaidSunlit)).length, 0, 'no sunlit pass at night');
  const shift = (ctx) => ctx.calls.filter(([m]) => m === 'translate').map(([, a]) => a[0]);
  assert.deepEqual(shift(draw(0.3)), [-DAY_RIM.dx], 'morning: the sun on the left');
  assert.deepEqual(shift(noon), [DAY_RIM.dx], 'afternoon: the sun on the right');
  const L = layout(340, 396);
  assert.ok(L.mermaid.x1 + DAY_RIM.dx < LABEL.x, 'the sunlit pass stays left of the plate');
  assert.ok(L.mermaid.x0 - DAY_RIM.dx >= 0.07 * 340, 'the sunlit pass stays clear of the streak');
  const dusk = startsWith(draw(PHASE.dusk).fills, rgbaOf(WARSAW.mermaidSunlit));
  assert.ok(dusk.length > 0, 'dusk still has a sunlit pass');
  for (const f of dusk) {
    const a = Number(f.slice(f.lastIndexOf(',') + 1, -1));
    assert.ok(a > 0 && a < 0.9, `dusk sunlit alpha ${a} is between 0 and full`);
  }
});

test('the low city is plaster, brick and concrete, never blue, and mixes several façades', () => {
  for (const [r, , b] of WARSAW.facades) assert.ok(r >= b, `façade ${r},${b} leans blue`);
  const picked = new Set(FRONT_ROW.map((_, i) => Math.floor(hash2(i, 64) * WARSAW.facades.length)));
  assert.ok(picked.size >= 4, `only ${picked.size} façade colours in use`);
});

test('no sky under the buildings: roofs run unbroken from edge to edge down to the river, in building colours', () => {
  assert.equal(INFILL_ROW[0].x0, 0);
  assert.equal(INFILL_ROW.at(-1).x1, 1);
  INFILL_ROW.forEach((b, i) => {
    if (i > 0) assert.equal(b.x0, INFILL_ROW[i - 1].x1);
    assert.ok(b.top <= FAR_BANK && b.top > FAR_BANK - 0.06, `roof ${i} at ${b.top}`);
  });
  const L = layout(340, 396);
  const sky = tint(sample(PHASE.noon)).skyLow;
  const styles = new Set(INFILL_ROW.map((_, i) => css(mix(mix(WARSAW.facades[Math.floor(hash2(i, 67) * WARSAW.facades.length)], WARSAW.backBlockDay, 0.6), sky, 0.18))));
  const rects = paint(PHASE.noon).calls.filter(([m, a, style]) => m === 'fillRect' && styles.has(style) && Math.abs(a[1] + a[3] - L.river.top) < 1e-6);
  // every column of the body, from the towers' feet to the river, is under one of them
  for (let x = 0.5; x < 340; x += 1) {
    assert.ok(rects.some(([, [rx, ry, rw]]) => rx <= x && x <= rx + rw && ry <= L.gy + 1e-6), `sky shows at x ${x}`);
  }
  for (const i of INFILL_ROW.keys()) {
    const [r, , b] = mix(WARSAW.facades[Math.floor(hash2(i, 67) * WARSAW.facades.length)], WARSAW.backBlockDay, 0.6);
    assert.ok(r >= b, `roof ${i} leans blue`);
  }
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

test('ice amount: none above -5 or without a reading, rising to full at -12', () => {
  assert.equal(iceAmount(EMPTY), 0);
  assert.equal(iceAmount({ ...EMPTY, temperature: -3 }), 0);
  assert.equal(iceAmount({ ...EMPTY, temperature: 0 }), 0);
  assert.equal(iceAmount({ ...EMPTY, temperature: -5 }), 0);
  assert.equal(iceAmount({ ...EMPTY, temperature: NaN }), 0);
  assert.ok(Math.abs(iceAmount({ ...EMPTY, temperature: -8.5 }) - 0.5) < 1e-9);
  assert.equal(iceAmount({ ...EMPTY, temperature: -12 }), 1);
  assert.equal(iceAmount({ ...EMPTY, temperature: -30 }), 1);
});

test('ice floes: more as it gets colder, inside the river band, deterministic', () => {
  const L = layout(340, 396, 0, 0);
  assert.equal(iceFloes(L, 0, 1).length, ICE.count);
  assert.ok(iceFloes(L, 0, 0.5).length < ICE.count);
  assert.equal(iceFloes(L, 0, 0).length, 0);
  assert.ok(iceFloes(L, 0, 0.01).length >= 6);
  for (const f of iceFloes(L, 12345, 1)) {
    assert.ok(f.y - f.h / 2 >= L.river.top, `floe ${f.i} top`);
    assert.ok(f.y + f.h <= L.river.bottom + 1, `floe ${f.i} bottom`);
  }
  assert.deepEqual(iceFloes(L, 777, 1), iceFloes(L, 777, 1));
});

test('ice floes drift to the right, slower under reduced motion', () => {
  const L = layout(340, 396, 0, 0);
  const a = iceFloes(L, 0, 1);
  const b = iceFloes(L, 1000, 1);
  const r = iceFloes(L, 1000, 1, true);
  a.forEach((f, k) => {
    const speed = (6 + f.row * 3) * L.sx;
    const moved = b[k].x - f.x;
    assert.ok(Math.abs(moved - speed) < 1e-6 || moved < 0, `floe ${k} moves right or wraps`);
    if (moved > 0 && r[k].x - f.x > 0) assert.ok(Math.abs(r[k].x - f.x - 0.4 * speed) < 1e-6, `floe ${k} reduced`);
  });
});

test('ice on the river appears only in a frost', () => {
  const frost = paint(PHASE.noon, { ...EMPTY, temperature: -8, known: true });
  assert.ok(startsWith(frost.fills, rgbaOf(WARSAW.iceShadow)).length > 0);
  assert.ok(startsWith(frost.fills, rgbaOf(WARSAW.iceFloe)).length > 0);
  const clips = (c) => c.calls.filter(([k]) => k === 'clip').length;
  for (const w of [EMPTY, { ...EMPTY, temperature: -3, known: true }]) {
    const open = paint(PHASE.noon, w);
    assert.equal(startsWith(open.fills, rgbaOf(WARSAW.iceShadow)).length, 0);
    assert.equal(startsWith(open.fills, rgbaOf(WARSAW.iceFloe)).length, 0);
    assert.equal(clips(open) + 1, clips(frost), 'the river clip appears only in a frost');
  }
});

test('Warsaw\'s traffic tick is fast enough for the ice in a frost', () => {
  const frost = { ...EMPTY, temperature: -8, known: true };
  assert.ok(warsaw.cadenceMs(frost, {}) > 0 && warsaw.cadenceMs(frost, {}) <= 250);
  assert.ok(warsaw.cadenceMs(frost, { reduced: true }) > 0 && warsaw.cadenceMs(frost, { reduced: true }) <= 500);
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

// ---- the forest follows the seasons ----

const only = (s) => ({ spring: 0, summer: 0, autumn: 0, winter: 0, [s]: 1 });
const T = {
  spring: Date.UTC(2026, 3, 20, 10),
  summer: Date.UTC(2026, 5, 15, 8, 30),
  autumn: Date.UTC(2026, 9, 20, 10),
  winter: Date.UTC(2026, 0, 15, 11),
};

test('seasonWeights: full seasons, half-and-half at a boundary, summer when the date cannot be read', () => {
  assert.equal(seasonWeights(Date.UTC(2026, 10, 8, 12)).autumn, 1);
  assert.equal(seasonWeights(Date.UTC(2026, 6, 1, 12)).summer, 1);
  assert.equal(seasonWeights(Date.UTC(2026, 0, 15, 12)).winter, 1);
  assert.equal(seasonWeights(Date.UTC(2026, 3, 20, 12)).spring, 1);
  const sep = seasonWeights(Date.UTC(2026, 8, 1, 12));
  assert.ok(Math.abs(sep.summer - 0.5) < 0.05 && Math.abs(sep.autumn - 0.5) < 0.05);
  assert.equal(seasonWeights(Date.UTC(2026, 7, 21, 12)).summer, 1);
  assert.equal(seasonWeights(Date.UTC(2026, 8, 12, 12)).autumn, 1);
  const dec = seasonWeights(Date.UTC(2026, 11, 1, 12));
  assert.ok(Math.abs(dec.autumn - 0.5) < 0.05 && Math.abs(dec.winter - 0.5) < 0.05);
  const mar = seasonWeights(Date.UTC(2027, 1, 28, 23, 30));
  assert.ok(Math.abs(mar.winter - 0.5) < 0.05 && Math.abs(mar.spring - 0.5) < 0.05);
  assert.deepEqual(seasonWeights(NaN), only('summer'));
  for (let d = 0; d < 800; d += 3) {
    const w = seasonWeights(Date.UTC(2026, 0, 1 + d, 12));
    let sum = 0;
    for (const s of SEASONS) {
      assert.ok(w[s] >= 0 && w[s] <= 1, `${s} in range`);
      sum += w[s];
    }
    assert.ok(Math.abs(sum - 1) < 1e-9, 'weights sum to 1');
  }
});

test('canopyColour: autumn is warm and smooth along the bank, winter grey-brown, spring light green, summer today\'s green', () => {
  const luma = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  let prev = null;
  for (let k = 0; k < 50; k++) {
    const [r, g, b] = canopyColour(k, only('autumn'));
    assert.ok(r > g + 10 && r > b + 40, `autumn column ${k} is warm`);
    if (prev) for (let i = 0; i < 3; i++) assert.ok(Math.abs([r, g, b][i] - prev[i]) <= 12, `autumn column ${k} is smooth`);
    prev = [r, g, b];
  }
  let spring = 0;
  let summer = 0;
  for (let k = 0; k < 50; k++) {
    const [r, g] = canopyColour(k, only('winter'));
    assert.ok(Math.abs(r - g) <= 24 && g <= r + 4, `winter column ${k} has no green lead`);
    const sp = canopyColour(k, only('spring'));
    assert.ok(sp[1] > sp[0] + 20, 'spring is green');
    spring += luma(sp);
    summer += luma(canopyColour(k, only('summer')));
  }
  assert.ok((spring - summer) / 50 >= 30, 'spring is lighter than summer');
  assert.deepEqual(WARSAW.canopy.summer[0], WARSAW.treeDay);
  for (let k = 0; k < 50; k++) {
    const c = canopyColour(k, only('summer'));
    for (let i = 0; i < 3; i++) assert.ok(c[i] >= WARSAW.canopy.summer[0][i] - 1e-9 && c[i] <= WARSAW.canopy.summer[1][i] + 1e-9);
  }
});

const redLead = (ctx) => [...ctx.fills].filter((f) => {
  const m = /rgba\((\d+), (\d+), (\d+)/.exec(f);
  return m && Number(m[1]) > Number(m[2]) + 10;
});

test('the near-bank forest paints autumn canopy colours in autumn', () => {
  const autumn = redLead(paint(PHASE.noon, EMPTY, T.autumn)).length;
  const summer = redLead(paint(PHASE.noon, EMPTY, T.summer)).length;
  assert.ok(autumn >= 20);
  assert.ok(autumn >= summer + 20, `autumn has far more warm fills (${autumn}) than summer (${summer})`);
});

test('winter twigs appear in winter and not in summer', () => {
  const twig = rgbaOf(WARSAW.twig);
  assert.ok(startsWith(paint(PHASE.noon, EMPTY, T.winter).fills, twig).length > 0);
  assert.equal(startsWith(paint(PHASE.noon, EMPTY, T.summer).fills, twig).length, 0);
});

test('the seasonal forest is deterministic: same moment, same picture, no Math.random', () => {
  for (const t of [T.winter, T.autumn, T.spring, NaN]) {
    const a = paint(PHASE.noon, EMPTY, t);
    const b = paint(PHASE.noon, EMPTY, t);
    assert.equal(JSON.stringify(a.calls), JSON.stringify(b.calls));
    assert.deepEqual([...a.fills], [...b.fills]);
  }
});

test('seasonWeights: a date that cannot be read paints the summer forest, never an empty one', () => {
  assert.deepEqual(seasonWeights(NaN), only('summer'));
  const ctx = paint(PHASE.noon, EMPTY, NaN);
  const summerGreen = [...ctx.fills].filter((f) => {
    const m = /rgba\((\d+), (\d+), (\d+)/.exec(f);
    return m && Number(m[2]) >= Number(m[1]) + 10;
  });
  assert.ok(summerGreen.length > 0, 'the forest still paints green');
  assert.equal(startsWith(ctx.fills, rgbaOf(WARSAW.twig)).length, 0, 'and has no twigs');
});

test('winter twigs are never lighter than the canopy beneath them at dusk', () => {
  const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const night = nightAmount(sample(PHASE.dusk).light);
  assert.ok(night > 0, 'dusk is dark enough to matter');
  const rgb = (f) => /rgba\((\d+), (\d+), (\d+)/.exec(f).slice(1, 4).map(Number);
  const tw = tone(WARSAW.twig, WARSAW.treeDusk, WARSAW.treeNight, night);
  assert.ok(luma(tw) <= luma(tone(WARSAW.canopy.winter[0], WARSAW.treeDusk, WARSAW.treeNight, night)) + 1e-9);
  const fill = [...paint(PHASE.dusk, EMPTY, T.winter).fills].find((f) => f.includes(`${Math.round(tw[0])}, ${Math.round(tw[1])}, ${Math.round(tw[2])},`));
  assert.ok(fill, 'the dusk twig fill is drawn through the dusk tone');
  assert.ok(luma(rgb(fill)) <= luma(tone(WARSAW.canopy.winter[0], WARSAW.treeDusk, WARSAW.treeNight, night)) + 1);
});
