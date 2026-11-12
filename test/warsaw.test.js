import { test } from 'node:test';
import assert from 'node:assert/strict';
import warsaw from '../src/cities/warsaw/index.js';
import {
  SKYLINE, MERMAID, BACK_ROW, FRONT_ROW, INFILL_ROW, PALACE, RIM_DX, DAY_RIM, FAR_BANK, RIVER_TOP, QUAY_TOP, BOULEVARD, STREAK_CLEAR,
  buildPlates, layout, nightAmount, ICE, iceAmount, iceFloes, sunSide, drawMermaid, drawSkyline, flagDay,
  SEASONS, seasonWeights, canopyColour, tone,
  CLOCK_R, GLASS, GOLDEN_FROM, goldenAmount, sunLight, moonLight, windowsOut, WINDOWS_OUT_MAX, rainy, drawRiver,
} from '../src/cities/warsaw/scene.js';
import { BRIDGE, TRAFFIC, DECK, deckY, deckThick, drawBridge, trafficLights, vehicles } from '../src/cities/warsaw/bridge.js';
import { BEACH, ROWS, TREES, PATH_LAMPS, branches } from '../src/cities/warsaw/forest.js';
import {
  boatAt, BIRDS, birdSpots, FROST as FROST_AT, STEAM, steaming, steamPuffs, fireworksOn, treeUp, FIREWORKS, fireworkBursts, drawFireworks, FIR,
} from '../src/cities/warsaw/life.js';
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

test('lamps light the far bank\'s boulevard at night; the near bank has no promenade or wall (its two path lamps are tested below)', () => {
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

// each ripple dash is an ellipse followed by its fill: [cx, cy, rx, ry, style]
function dashes(ctx, prefix) {
  const out = [];
  ctx.calls.forEach((c, i) => {
    if (c[0] !== 'ellipse') return;
    const f = ctx.calls[i + 1];
    if (f && f[0] === 'fill' && typeof f[2] === 'string' && f[2].startsWith(prefix)) out.push([...c[1].slice(0, 4), f[2]]);
  });
  return out;
}

test('reflections by day are soft dashes inside the river, under their own towers, narrowing and fading downward', () => {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const ctx = paint(PHASE.noon);
  const wids = { reflectDayPalace: 44, reflectDayVarso: 17, reflectDayZlota: 24, reflectDaySpire: 20 };
  for (const [name, share, off] of DAY_REFLECTS) {
    const ds = dashes(ctx, rgbaOf(WARSAW[name]));
    assert.ok(ds.length > 3, name);
    for (const [x, y, rx, ry] of ds) {
      assert.ok(y - ry >= L.river.top - 1e-9 && y + ry <= L.river.bottom + 1e-9, `${name} inside the river`);
      assert.ok(Math.abs(x - (L.X(share) + off * L.sx)) <= wids[name] * L.sx, `${name} under its tower`);
      assert.ok(rx > 0 && ry < 2, `${name} a thin dash, not a block`);
    }
    const alpha = (st) => Number(st.slice(st.lastIndexOf(',') + 1, -1));
    assert.ok(alpha(ds[0][4]) > alpha(ds[ds.length - 1][4]), `${name} fades with depth`);
  }
});

test('reflections shimmer with the clock and are deterministic', () => {
  const grab = (nowMs) => dashes(paint(PHASE.night, EMPTY, nowMs), rgbaOf(WARSAW.reflectPalace)).map((d) => d[0]);
  const a = grab(0);
  assert.ok(a.length > 0);
  assert.notDeepEqual(a, grab(1500), 'the dashes sway with nowMs');
  assert.deepEqual(a, grab(0), 'deterministic');
});

test('night adds a red aviation thread and gold lamp shivers on the water; day has none', () => {
  const L = layout(rect.w, rect.h, rect.x, rect.y);
  const night = paint(PHASE.night);
  for (const c of [WARSAW.aviation, WARSAW.quayLamp]) {
    const ds = dashes(night, rgbaOf(c));
    assert.ok(ds.length > 0);
    for (const [, y, , ry] of ds) assert.ok(y - ry >= L.river.top && y + ry <= L.river.bottom);
    assert.equal(dashes(paint(PHASE.noon), rgbaOf(c)).length, 0);
  }
});

test('water(rect) is the river band, inside the rect, with positive size', () => {
  for (const r of [rect, { x: 12, y: 30, w: 200, h: 260 }]) {
    const w = warsaw.water(r);
    assert.ok(w.w > 0 && w.h > 0);
    assert.ok(w.x >= r.x && w.y >= r.y && w.x + w.w <= r.x + r.w + 1e-9 && w.y + w.h <= r.y + r.h + 1e-9);
  }
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

// ---- the look-and-feel pass (2026-11-12) ----

const CLEAR = { ...EMPTY, known: true, kind: 'clear', code: 0, cloudCover: 5, temperature: 12, windSpeed: 5, windDir: 250 };
const RAIN = { ...CLEAR, kind: 'rain', code: 63, cloudCover: 100 };
const FROST = { ...CLEAR, temperature: -9, windSpeed: 30, windDir: 270 };
const GOLDEN_PHASE = 0.74; // the sun low on the right, still day
const fullScene = (phase, weather = EMPTY, nowMs = 0) => {
  const ctx = recordingCtx();
  const scene = noRandom(() => warsaw.paint(ctx, rect, phase, tint(sample(phase)), weather, buildPlates(rect.w, rect.h), nowMs));
  return { ctx, scene };
};
const L0 = layout(rect.w, rect.h, rect.x, rect.y);
const alphaOf = (st) => Number(st.slice(st.lastIndexOf(',') + 1, -1));
// Warsaw wall clock -> epoch ms (CEST in summer, CET in winter)
const SUMMER = (d, h, m = 0) => Date.UTC(2026, 5, d, h - 2, m);

test('paint reports what the scene shows, and still paints with no reading', () => {
  const { scene } = fullScene(PHASE.noon, EMPTY, T.summer);
  for (const k of ['season', 'golden', 'windows', 'glitter', 'moonTrack', 'wet', 'boat', 'birds', 'steam', 'vehicles', 'lamps', 'fireworks', 'tree']) assert.ok(k in scene, k);
  assert.equal(scene.fireworks, false);
  assert.equal(scene.tree, false);
  assert.equal(scene.wet, false);
  assert.equal(scene.glitter, 0, 'no sun is drawn without a reading, so no glitter either');
  assert.equal(fullScene(PHASE.noon, EMPTY, T.autumn).scene.season, 'autumn');
  assert.equal(fullScene(PHASE.noon, EMPTY, NaN).scene.season, 'summer');
});

test('W4: the Palace has one clock face, small and warm, never white, with only a faint glow', () => {
  const y = L0.Y(PALACE.clock);
  for (const ph of [PHASE.noon, PHASE.night]) {
    const ctx = paint(ph, EMPTY, T.summer);
    const faces = ctx.calls.filter(([m, a]) => m === 'arc' && Math.abs(a[1] - y) < 1e-9 && Math.abs(a[2] - CLOCK_R) < 1e-9);
    assert.equal(faces.length, 1, 'one clock face');
    assert.ok(Math.abs(faces[0][1][0] - L0.X(0.4)) < 1e-9, 'on the Palace axis');
    assert.equal(startsWith(ctx.fills, rgbaOf(WARSAW.clockFace)).length, 0, 'no white face');
    assert.equal(startsWith(ctx.fills, rgbaOf(WARSAW.clockGlow)).length, 0, 'no wide glow');
  }
  assert.ok(CLOCK_R <= 2);
  const [r, g, b] = WARSAW.clockNight;
  assert.ok(r > b + 80 && r < 230 && g < 200, 'the night face is a dim warm disc');
});

test('W1: the near bank is rows of crowns behind a strip of beach, far rows smaller', () => {
  assert.ok(ROWS.length >= 3);
  for (let j = 1; j < ROWS.length; j++) assert.ok(ROWS[j].r > ROWS[j - 1].r && ROWS[j].y > ROWS[j - 1].y);
  assert.ok(ROWS[0].y - ROWS[0].r * 1.2 >= QUAY_TOP * 396, 'the first crowns start below the water');
  assert.ok(ROWS[0].y - ROWS[0].r * 1.2 - QUAY_TOP * 396 < BEACH + 3, 'and leave only a strip of beach');
  assert.ok(TREES.length > 40 && TREES.length < 260, `${TREES.length} trees`);
  for (const t of TREES) {
    const hidden = t.y - t.r > plateTop + 3 && t.x - t.r > LABEL.x + 2 && t.x + t.r < LABEL.x + LABEL.w - 2;
    assert.ok(!hidden, 'no tree is built wholly behind the label plate');
    assert.equal(t.lobes.length, 4);
  }
  const noon = paint(PHASE.noon, EMPTY, T.summer);
  assert.ok(noon.fills.has(css(mix(WARSAW.beachDay, tint(sample(PHASE.noon)).skyLow, 0.12))), 'the beach');
  assert.ok(startsWith(noon.fills, rgbaOf(WARSAW.leafLight)).length > 0, 'sunlit crowns by day');
  assert.equal(startsWith(paint(PHASE.night, EMPTY, T.summer).fills, rgbaOf(WARSAW.leafLight)).length, 0, 'none at night');
  assert.deepEqual(branches(7), branches(7));
  for (const [, , x1, y1] of branches(7)) assert.ok(Math.hypot(x1, y1) < 1.6, 'branches stay about the crown');
});

test('W1: the crown highlights follow the sun across the day', () => {
  const hx = (phase) => {
    const ctx = paint(phase, EMPTY, T.summer);
    const light = rgbaOf(mix(WARSAW.leafLight, WARSAW.leafGolden, sunLight(phase, EMPTY).golden).map(Math.round));
    const i = ctx.calls.findIndex(([m, , st]) => m === 'fill' && typeof st === 'string' && st.startsWith(light));
    let k = i;
    while (k > 0 && ctx.calls[k - 1][0] !== 'beginPath') k--;
    return ctx.calls.slice(k, i).filter(([m]) => m === 'arc').map(([, a]) => a[0]);
  };
  const am = hx(0.3);
  const pm = hx(0.7);
  assert.ok(am.length > 20 && am.length === pm.length);
  assert.ok(am.every((x, i) => x < pm[i]), 'left in the morning, right in the evening');
});

test('W1: path lamps glow among the trees at night only, clear of the label plate', () => {
  assert.ok(PATH_LAMPS.length >= 1 && PATH_LAMPS.length <= 2);
  for (const p of PATH_LAMPS) {
    const x = p.x * 340;
    const y = p.y * 396;
    assert.ok(y > QUAY_TOP * 396 + BEACH, 'among the trees');
    assert.ok(y < plateTop || x < LABEL.x - 4 || x > LABEL.x + LABEL.w + 4, 'clear of the plate');
  }
  const lamp = rgbaOf(WARSAW.pathLamp);
  const night = fullScene(PHASE.night);
  assert.equal(night.scene.lamps, PATH_LAMPS.length);
  assert.equal(night.ctx.calls.filter(([m, , st]) => m === 'fill' && typeof st === 'string' && st.startsWith(lamp)).length, PATH_LAMPS.length);
  const noon = fullScene(PHASE.noon);
  assert.equal(noon.scene.lamps, 0);
  assert.equal(startsWith(noon.ctx.fills, lamp).length, 0);
});

test('sunLight: where the sun stands, how much of it shows and how warm the light is', () => {
  assert.ok(sunLight(0.45, CLEAR).x < sunLight(0.7, CLEAR).x, 'it crosses left to right');
  assert.equal(sunLight(0.45, CLEAR).side, -1);
  assert.equal(sunLight(0.75, CLEAR).side, 1);
  assert.ok(sunLight(PHASE.noon, CLEAR).strength > 0.8);
  assert.equal(sunLight(PHASE.noon, EMPTY).strength, 0, 'no reading, no sun');
  assert.equal(sunLight(PHASE.noon, RAIN).strength, 0);
  assert.equal(sunLight(PHASE.night, CLEAR).strength, 0);
  assert.equal(goldenAmount(1), 0);
  assert.equal(goldenAmount(GOLDEN_FROM), 0);
  assert.equal(goldenAmount(0), 1);
  assert.ok(goldenAmount(0.2) > goldenAmount(0.4));
  assert.equal(goldenAmount(-0.2), 0);
  assert.equal(sunLight(PHASE.noon, CLEAR).golden, 0);
  assert.ok(sunLight(GOLDEN_PHASE, CLEAR).golden > 0.5);
  assert.ok(sunLight(GOLDEN_PHASE, RAIN).golden < 0.2 * sunLight(GOLDEN_PHASE, CLEAR).golden, 'a heavy sky drains it');
});

test('W2: glass by day mirrors the sky, has floor lines and a thin rim, and a glint only when the sun shows', () => {
  assert.ok(GLASS.rim <= 1, 'the rim is thin');
  const glint = rgbaOf(WARSAW.glassGlint);
  const noon = paint(PHASE.noon, CLEAR);
  assert.ok(startsWith(noon.fills, glint).length > 0);
  assert.ok(startsWith(noon.strokes, rgbaOf(WARSAW.glassLine)).length > 0, 'floor lines');
  assert.ok(startsWith(noon.fills, rgbaOf(WARSAW.glassShade)).length > 0, 'a shade side');
  assert.equal(startsWith(paint(PHASE.noon).fills, glint).length, 0, 'no sun, no glint');
  assert.equal(startsWith(paint(PHASE.noon, RAIN).fills, glint).length, 0);
  const night = paint(PHASE.night, CLEAR);
  assert.equal(startsWith(night.fills, glint).length, 0);
  assert.equal(startsWith(night.strokes, rgbaOf(WARSAW.glassLine)).length, 0);
  // the rim is softer than it was (0.95) and never pure white by day
  const sky = tint(sample(PHASE.noon)).skyLow;
  const rim = [...noon.fills].find((f) => f.startsWith(rgbaOf(mix(WARSAW.rimDay, sky, 0.25).map(Math.round))));
  assert.ok(rim && alphaOf(rim) <= 0.6, `rim ${rim}`);
  // the glint slides across the glass with the hour: sheen() moves to its centre before it paints
  const gx = (phase) => paint(phase, CLEAR).calls.filter(([m, a]) => m === 'translate' && a[0] > 20 && a[1] < L0.gy).map(([, a]) => a[0]);
  const a = gx(0.45);
  const b = gx(0.72);
  assert.equal(a.length, 5, 'one glint on each glass tower');
  assert.ok(a.every((x, i) => x < b[i]), 'left in the morning, right toward evening');
});

test('W3: at golden hour the sandstone warms, the glass catches orange and the river carries a warm path', () => {
  const gold = rgbaOf(WARSAW.glassGolden);
  const golden = fullScene(GOLDEN_PHASE, CLEAR);
  assert.ok(golden.scene.golden > 0.4);
  assert.ok(startsWith(golden.ctx.fills, gold).length > 0, 'orange on the glass');
  assert.ok(!golden.ctx.fills.has(css(WARSAW.stoneDay)), 'the Palace is no longer noon sandstone');
  assert.ok(startsWith(golden.ctx.fills, rgbaOf(WARSAW.cityGolden)).length > 0, 'the low city blushes');
  const noon = fullScene(PHASE.noon, CLEAR);
  assert.equal(noon.scene.golden, 0);
  assert.equal(startsWith(noon.ctx.fills, gold).length, 0);
  assert.equal(startsWith(noon.ctx.fills, rgbaOf(WARSAW.cityGolden)).length, 0);
  assert.equal(fullScene(PHASE.night, CLEAR).scene.golden, 0);
  // the sun's path on the water is warmer and wider than at noon
  const [r, , b] = mix(WARSAW.sunGlitter, WARSAW.sunGolden, 0.8 * sunLight(GOLDEN_PHASE, CLEAR).golden);
  assert.ok(r - b > WARSAW.sunGlitter[0] - WARSAW.sunGlitter[2] + 40);
});

test('W5: a sun glitter path by day under the sun, a moon track at night when the moon is up and lit', () => {
  const glitter = rgbaOf(WARSAW.sunGlitter);
  const noon = fullScene(PHASE.noon, CLEAR);
  assert.ok(noon.scene.glitter > 0.8);
  const ds = dashes(noon.ctx, glitter);
  assert.ok(ds.length > 3);
  const sx = L0.X(sunLight(PHASE.noon, CLEAR).x);
  for (const [x, y, , ry] of ds) {
    assert.ok(y - ry >= L0.river.top - 1e-9 && y + ry <= L0.river.bottom + 1e-9, 'inside the river');
    assert.ok(Math.abs(x - sx) < 30, 'under the sun');
  }
  assert.equal(dashes(paint(PHASE.noon), glitter).length, 0, 'none without a reading');
  assert.equal(fullScene(PHASE.noon, RAIN).scene.glitter, 0);
  assert.equal(fullScene(PHASE.night, CLEAR).scene.glitter, 0);

  const track = rgbaOf(WARSAW.moonTrack);
  const fullMoon = Date.UTC(2026, 5, 29, 22, 30);
  const newMoon = Date.UTC(2026, 5, 15, 2, 0);
  assert.equal(moonLight(PHASE.noon, CLEAR, fullMoon, 1), null, 'no moon by day');
  assert.equal(moonLight(PHASE.night, CLEAR, NaN, 0.05), null);
  const lit = moonLight(PHASE.night, CLEAR, fullMoon, sample(PHASE.night).light);
  assert.ok(lit && lit.strength > 0.6 && lit.x >= 0.15 && lit.x <= 0.85);
  assert.equal(moonLight(PHASE.night, CLEAR, newMoon, sample(PHASE.night).light).strength, 0, 'a new moon lays no track');
  assert.ok(moonLight(PHASE.night, RAIN, fullMoon, sample(PHASE.night).light).strength < 0.1 * lit.strength);
  const bright = fullScene(PHASE.night, CLEAR, fullMoon);
  assert.ok(bright.scene.moonTrack > 0.6);
  const md = dashes(bright.ctx, track);
  assert.ok(md.length > 3);
  for (const [x, y, , ry] of md) {
    assert.ok(y - ry >= L0.river.top - 1e-9 && y + ry <= L0.river.bottom + 1e-9);
    assert.ok(Math.abs(x - L0.X(lit.x)) < 20, 'under the moon');
  }
  const dark = fullScene(PHASE.night, CLEAR, newMoon);
  assert.equal(dark.scene.moonTrack, 0);
  assert.equal(dashes(dark.ctx, track).length, 0);
});

test('W5: night reflections are soft columns crossed by drifting gaps of plain water', () => {
  // the gaps are the ellipses filled together in the river's own colour, after the dashes
  const gapXs = (nowMs, reduced = false) => {
    const ctx = recordingCtx();
    noRandom(() => drawRiver(ctx, rect, PHASE.night, tint(sample(PHASE.night)), EMPTY, nowMs, reduced));
    const out = [];
    ctx.calls.forEach((c, i) => {
      if (c[0] === 'ellipse' && ctx.calls[i + 1] && ctx.calls[i + 1][0] === 'moveTo') out.push(c[1].slice(0, 4));
      if (c[0] === 'ellipse' && ctx.calls[i + 1] && ctx.calls[i + 1][0] === 'fill' && ctx.calls[i - 1][0] === 'moveTo') out.push(c[1].slice(0, 4));
    });
    return out;
  };
  const a = gapXs(0);
  assert.ok(a.length >= 8, `${a.length} gaps`);
  for (const [, y, , ry] of a) assert.ok(y - ry >= L0.river.top && y + ry <= L0.river.bottom, 'inside the river');
  assert.notDeepEqual(a, gapXs(4000), 'they drift with nowMs');
  assert.deepEqual(a, gapXs(0));
  assert.deepEqual(gapXs(0, true), gapXs(4000, true), 'still under reduced motion');
  // and the river is clipped once for the soft columns, whatever the hour
  for (const ph of [PHASE.noon, PHASE.night]) {
    const ctx = recordingCtx();
    drawRiver(ctx, rect, ph, tint(sample(ph)), EMPTY, 0);
    assert.equal(ctx.calls.filter(([m]) => m === 'clip').length, 1);
  }
});

test('W6: the bridge by day: grey steel with a light and a shade side, a deck with depth, a railing, traffic', () => {
  for (const c of [WARSAW.pylonLit, WARSAW.pylonShade, WARSAW.cableDay]) assert.ok(Math.max(...c) < 230, 'grey, not white');
  assert.ok(WARSAW.pylonLit[0] > WARSAW.pylonShade[0] + 40);
  const draw = (phase, weather = CLEAR, nowMs = 0) => {
    const ctx = recordingCtx();
    const out = noRandom(() => drawBridge(ctx, rect, phase, tint(sample(phase)), weather, nowMs));
    return { ctx, out };
  };
  const noon = draw(PHASE.noon);
  assert.ok(noon.ctx.fills.has(css(WARSAW.pylonLit)) && noon.ctx.fills.has(css(WARSAW.pylonShade)));
  assert.ok(!noon.ctx.fills.has(css(WARSAW.pylonDay)), 'the white pylon is gone');
  assert.ok(startsWith(noon.ctx.strokes, rgbaOf(WARSAW.railing)).length > 0, 'a railing');
  // the lit side is the sun's side
  const litX = (phase) => {
    const { ctx } = draw(phase);
    const i = ctx.calls.findIndex(([m, , st]) => m === 'fill' && st === css(mix(WARSAW.pylonLit, WARSAW.pylonGolden, 0.7 * sunLight(phase, CLEAR).golden)));
    return ctx.calls[i - 3][1][0]; // a point of the lit polygon's foot
  };
  assert.ok(litX(0.45) < L0.X(BRIDGE.pylon) && litX(0.75) > L0.X(BRIDGE.pylon));
  assert.ok(deckThick(L0, L0.X(1)) > 1.5 * deckThick(L0, L0.X(BRIDGE.x0)), 'thicker toward the viewer');
  assert.ok(deckThick(L0, L0.X(BRIDGE.x0)) >= 2.5 && DECK.near >= 5, 'never a hairline');
  assert.equal(noon.out.vehicles, 2 * TRAFFIC.count);
  assert.equal(draw(PHASE.night).out.vehicles, 0, 'cars show as lights at night');
  const paints = [...WARSAW.cars, WARSAW.bus].map((c) => css(c, 1));
  assert.ok(noon.ctx.calls.filter(([m, , st]) => m === 'fillRect' && paints.includes(st)).length >= 2 * TRAFFIC.count);
});

test('W6: daytime vehicles are the night lights by day: pure, on the deck, one bus each way', () => {
  const a = noRandom(() => vehicles(L0, 0));
  assert.deepEqual(a, vehicles(L0, 0));
  assert.equal(a.length, 2 * TRAFFIC.count);
  assert.equal(a.filter((v) => v.bus).length, 2);
  const lights = trafficLights(L0, 0);
  a.forEach((v, i) => {
    assert.equal(v.x, lights[i].x);
    assert.equal(v.dir, lights[i].dir);
    assert.ok(v.x >= L0.X(BRIDGE.x0) && v.x <= L0.X(1));
    assert.ok(Math.abs(v.y - deckY(L0, v.x)) <= 1, 'on the road');
    assert.ok(v.w > 1.5 && v.w < 12 && v.h > 0.8 && v.h < 4, 'tiny');
  });
  const b = vehicles(L0, 2000);
  assert.ok(a.some((v, i) => v.x !== b[i].x), 'they move with nowMs');
  const near = a.filter((v) => !v.bus).reduce((p, q) => (q.x > p.x ? q : p));
  const farV = a.filter((v) => !v.bus).reduce((p, q) => (q.x < p.x ? q : p));
  assert.ok(near.w > farV.w, 'nearer is bigger');
});

test('W7: rain, drizzle and storm wet the ground: longer and stronger reflections, halos, a streak on the walk', () => {
  for (const k of ['rain', 'drizzle', 'storm']) assert.equal(rainy({ kind: k }), true);
  for (const k of ['clear', 'cloud', 'fog', 'snow']) assert.equal(rainy({ kind: k }), false);
  assert.equal(rainy(null), false);
  const lamp = rgbaOf(WARSAW.quayLamp);
  const dry = fullScene(PHASE.night, CLEAR);
  const wet = fullScene(PHASE.night, RAIN);
  assert.equal(dry.scene.wet, false);
  assert.equal(wet.scene.wet, true);
  assert.equal(fullScene(PHASE.night, { ...RAIN, kind: 'storm', code: 95 }).scene.wet, true);
  const dDry = dashes(dry.ctx, lamp);
  const dWet = dashes(wet.ctx, lamp);
  assert.ok(dWet.length >= 2 * dDry.length, `lamp reflections run longer in the rain (${dWet.length} vs ${dDry.length})`);
  const maxA = (ds) => Math.max(...ds.map((d) => alphaOf(d[4])));
  assert.ok(maxA(dWet) > maxA(dDry), 'and stronger');
  assert.ok(maxA(dashes(wet.ctx, rgbaOf(WARSAW.reflectPalace))) > maxA(dashes(dry.ctx, rgbaOf(WARSAW.reflectPalace))));
  for (const [, y, , ry] of dWet) assert.ok(y - ry >= L0.river.top && y + ry <= L0.river.bottom);
  // halos: the lamps' glow is wider in the rain
  const radii = (ctx) => ctx.calls.filter(([m, a, st]) => m === 'fillRect' && typeof st !== 'string' && Math.abs(a[1] + a[3] / 2 - (L0.boulevard - 4 * L0.sy)) < 1e-9).map(([, a]) => a[2] / 2);
  assert.ok(radii(dry.ctx).length >= 10 && radii(wet.ctx).length === radii(dry.ctx).length);
  assert.ok(Math.min(...radii(wet.ctx)) >= 1.8 * Math.max(...radii(dry.ctx)));
  // a streak of lamplight on the wet paving, still on the far bank
  const streaks = (ctx) => ctx.calls.filter(([m, a, st]) => m === 'fillRect' && typeof st === 'string' && st.startsWith(lamp) && Math.abs(a[1] - L0.boulevard) < 1e-9);
  assert.ok(streaks(wet.ctx).length >= 10);
  assert.equal(streaks(dry.ctx).length, 0);
  for (const [, [, y, , h]] of streaks(wet.ctx)) assert.ok(y + h <= L0.river.top);
});

test('W7: lightning is aimed at the tip of the Palace needle', () => {
  const [x, y] = warsaw.sky.strike;
  assert.equal(x, SKYLINE.find((t) => t.id === 'pkin').x);
  assert.ok(Math.abs(y * 396 - L0.Y(PALACE.needle)) < 1e-9, 'the needle tip, as a fraction of the interior');
  assert.ok(x > 0 && x < 1 && y > 0 && y < 0.3);
});

test('W8: a boat crosses the river by day, slowly, never among ice', () => {
  const a = boatAt(L0, 0, CLEAR);
  assert.deepEqual(a, boatAt(L0, 0, CLEAR));
  assert.ok(a.y > L0.river.top + 3 && a.y < L0.river.bottom - 2);
  const b = boatAt(L0, 1000, CLEAR);
  assert.ok((b.x - a.x) * a.dir > 0, 'it moves the way it faces');
  assert.ok(Math.abs(b.x - a.x) < 4, 'slowly');
  assert.ok(Math.abs(boatAt(L0, 1000, CLEAR, true).x - a.x) < Math.abs(b.x - a.x), 'slower under reduced motion');
  assert.equal(boatAt(L0, 0, FROST), null);
  assert.ok(boatAt(L0, NaN, EMPTY), 'a bad clock still has a boat');
  assert.equal(fullScene(PHASE.noon, CLEAR).scene.boat, true);
  assert.equal(fullScene(PHASE.noon, FROST).scene.boat, false);
  assert.equal(fullScene(PHASE.night, CLEAR).scene.boat, false);
  assert.equal(fullScene(PHASE.noon).scene.boat, true, 'with no reading too');
});

test('W8: a few birds by day in fair weather only', () => {
  const light = (weather, day = 1, t = 0) => birdSpots(L0, t, weather, day);
  assert.equal(light(CLEAR).length, BIRDS.count);
  assert.equal(light(EMPTY).length, BIRDS.count);
  assert.deepEqual(light(CLEAR), light(CLEAR));
  assert.notDeepEqual(light(CLEAR), light(CLEAR, 1, 3000));
  for (const kind of ['rain', 'drizzle', 'storm', 'fog', 'snow']) assert.equal(light({ ...CLEAR, kind }).length, 0, kind);
  assert.equal(light({ ...CLEAR, kind: 'cloud', cloudCover: 100 }).length, 0, 'a full overcast');
  assert.equal(light(CLEAR, 0).length, 0, 'none at night');
  for (const b of light(CLEAR)) assert.ok(b.y < L0.gy - 0.2 * 396, 'up in the sky');
  assert.equal(fullScene(PHASE.noon, CLEAR).scene.birds, BIRDS.count);
  assert.equal(fullScene(PHASE.night, CLEAR).scene.birds, 0);
});

test('W8: windows go out through the night, each one once', () => {
  assert.equal(windowsOut(SUMMER(15, 21)), 0, 'all lit at 21:00');
  assert.equal(windowsOut(SUMMER(15, 12)), 0);
  const late = windowsOut(SUMMER(16, 0, 30));
  assert.ok(late > 0.3 && late < WINDOWS_OUT_MAX);
  assert.equal(windowsOut(SUMMER(16, 3)), WINDOWS_OUT_MAX);
  assert.equal(windowsOut(SUMMER(16, 7)), 0, 'back on by morning');
  assert.equal(windowsOut(NaN), 0);
  let prev = 0;
  for (let m = 0; m <= 8 * 60; m += 10) { // 21:00 -> 05:00 never brightens before 04:30
    const out = windowsOut(SUMMER(15, 21, m));
    if (m <= 7.5 * 60) assert.ok(out >= prev - 1e-9, `monotone at +${m} min`);
    prev = out;
  }
  const lit = (nowMs) => {
    const { ctx, scene } = fullScene(PHASE.night, EMPTY, nowMs);
    const win = css(WARSAW.backWindow, 0).slice(0, 18);
    return { n: ctx.calls.filter(([m, , st]) => m === 'fillRect' && typeof st === 'string' && st.startsWith(win)).map(([, a]) => a.join()), scene };
  };
  const evening = lit(SUMMER(15, 21));
  const midnight = lit(SUMMER(16, 0, 30));
  const small = lit(SUMMER(16, 3));
  assert.ok(midnight.n.length < 0.8 * evening.n.length && small.n.length < midnight.n.length && small.n.length > 0);
  assert.ok(midnight.n.every((w) => evening.n.includes(w)), 'a window lit at 00:30 was lit at 21:00');
  assert.ok(small.n.every((w) => midnight.n.includes(w)), 'none comes back on in the small hours');
  assert.equal(evening.scene.windows, 1);
  assert.ok(Math.abs(small.scene.windows - (1 - WINDOWS_OUT_MAX)) < 1e-9);
});

test('W8: steam rises off three roofs in a hard frost and leans with the wind', () => {
  assert.equal(FROST_AT, ICE.from);
  assert.equal(steaming({ ...CLEAR, temperature: -5 }), true);
  assert.equal(steaming({ ...CLEAR, temperature: -4.9 }), false);
  assert.equal(steaming(EMPTY), false);
  assert.ok(STEAM.roofs.length >= 2 && STEAM.roofs.length <= 3);
  assert.equal(steamPuffs(L0, 0, CLEAR).length, 0);
  const calm = steamPuffs(L0, 1234, { ...FROST, windSpeed: 0 });
  const west = steamPuffs(L0, 1234, FROST); // from the west: it blows to screen-right
  const east = steamPuffs(L0, 1234, { ...FROST, windDir: 90 });
  assert.equal(calm.length, STEAM.roofs.length * STEAM.puffs);
  assert.deepEqual(calm, steamPuffs(L0, 1234, { ...FROST, windSpeed: 0 }));
  const lean = (ps) => ps.reduce((s, p, i) => s + (p.x - calm[i].x), 0);
  assert.ok(lean(west) > 5 && lean(east) < -5);
  for (const p of calm) {
    assert.ok(p.y < L0.river.top - 0.04 * 396, 'above the roofs');
    assert.ok(p.a >= 0 && p.a <= 1 && p.r > 0);
  }
  assert.notDeepEqual(calm, steamPuffs(L0, 3234, { ...FROST, windSpeed: 0 }), 'it rises with the clock');
  assert.equal(fullScene(PHASE.noon, FROST).scene.steam, STEAM.roofs.length);
  assert.equal(fullScene(PHASE.noon, CLEAR).scene.steam, 0);
  assert.equal(fullScene(PHASE.noon).scene.steam, 0);
});

test('W9: New Year fireworks from 23:55 on 31 December to 00:20 on 1 January, Warsaw time', () => {
  const W = (mo, d, h, m) => Date.UTC(2026, mo - 1, d, h - 1, m); // CET
  assert.equal(fireworksOn(W(12, 31, 23, 54)), false);
  assert.equal(fireworksOn(W(12, 31, 23, 55)), true);
  assert.equal(fireworksOn(W(12, 31, 23, 59)), true);
  assert.equal(fireworksOn(Date.UTC(2026, 11, 31, 23, 0)), true, '00:00 on 1 January in Warsaw');
  assert.equal(fireworksOn(Date.UTC(2026, 11, 31, 23, 20)), true, '00:20');
  assert.equal(fireworksOn(Date.UTC(2026, 11, 31, 23, 21)), false, '00:21');
  assert.equal(fireworksOn(W(12, 30, 23, 58)), false);
  assert.equal(fireworksOn(W(6, 15, 0, 5)), false);
  assert.equal(fireworksOn(NaN), false);
  const t = Date.UTC(2026, 11, 31, 23, 5);
  const bursts = noRandom(() => fireworkBursts(t));
  assert.ok(bursts.length >= 3);
  assert.deepEqual(bursts, fireworkBursts(t));
  assert.notDeepEqual(bursts, fireworkBursts(t + 300));
  for (const b of bursts) {
    assert.ok(b.age >= 0 && b.age < 1);
    assert.ok(b.x > 0.1 && b.x < 0.9 && b.y >= FIREWORKS.y0 && b.y <= FIREWORKS.y1, 'over the skyline, above the river');
    assert.ok(WARSAW.fireworks.includes(b.colour));
  }
  assert.deepEqual(fireworkBursts(NaN), []);
  const on = fullScene(PHASE.night, CLEAR, t);
  assert.equal(on.scene.fireworks, true);
  assert.equal(fullScene(PHASE.night, CLEAR, W(12, 30, 23, 58)).scene.fireworks, false);
  assert.equal(fullScene(PHASE.night, EMPTY, t).scene.fireworks, true, 'with no reading too');
  // painted behind the towers: before the first tower's clip
  const firstBurst = on.ctx.calls.findIndex(([m, , st]) => m === 'fill' && typeof st === 'string' && WARSAW.fireworks.some((c) => st.startsWith(rgbaOf(c))));
  const firstClip = on.ctx.calls.findIndex(([m]) => m === 'clip');
  assert.ok(firstBurst > 0 && firstBurst < on.ctx.calls.findIndex(([m], i) => m === 'clip' && i > firstClip), 'behind the towers');
  // under reduced motion: a still glow, no bursts
  const still = (nowMs) => {
    const ctx = recordingCtx();
    const drawn = drawFireworks(ctx, L0, 1, nowMs, true);
    return { drawn, calls: JSON.stringify(ctx.calls), arcs: ctx.calls.filter(([m]) => m === 'arc').length };
  };
  assert.equal(still(t).drawn, true);
  assert.equal(still(t).arcs, 0);
  assert.equal(still(t).calls, still(t + 700).calls, 'the glow does not move');
  // and the page ticks faster while they last
  assert.equal(warsaw.cadenceMs(CLEAR, { nowMs: t }), 100);
  assert.equal(warsaw.cadenceMs(CLEAR, { nowMs: t, reduced: true }), 400);
  assert.equal(warsaw.cadenceMs(CLEAR, { nowMs: W(6, 15, 12, 0) }), 200);
  assert.equal(warsaw.cadenceMs(CLEAR, {}), 200);
});

test('W9: a lit Christmas tree stands at the foot of the Palace from 6 December to 6 January', () => {
  const noonOn = (y, mo, d) => Date.UTC(y, mo - 1, d, 11);
  assert.equal(treeUp(noonOn(2026, 12, 5)), false);
  assert.equal(treeUp(noonOn(2026, 12, 6)), true);
  assert.equal(treeUp(noonOn(2026, 12, 24)), true);
  assert.equal(treeUp(noonOn(2027, 1, 1)), true);
  assert.equal(treeUp(noonOn(2027, 1, 6)), true);
  assert.equal(treeUp(noonOn(2027, 1, 7)), false);
  assert.equal(treeUp(noonOn(2026, 6, 15)), false);
  assert.equal(treeUp(NaN), false);
  const pkin = SKYLINE.find((t) => t.id === 'pkin');
  assert.ok(Math.abs(FIR.x - pkin.x) < pkin.hw, 'in front of the Palace');
  assert.ok(FIR.foot >= FAR_BANK && FIR.foot < RIVER_TOP, 'its foot behind the low city');
  assert.ok(FIR.h / 396 > 0.06 && FIR.h / 396 < PALACE.masses[0].top, 'rises over the roofs, lower than the wings');
  const t = noonOn(2026, 12, 20);
  for (const ph of [PHASE.noon, PHASE.night]) {
    const on = fullScene(ph, CLEAR, t);
    assert.equal(on.scene.tree, true);
    assert.ok(WARSAW.firLights.every((c) => startsWith(on.ctx.fills, rgbaOf(c)).length > 0), 'its lights');
    const off = fullScene(ph, CLEAR, noonOn(2026, 6, 15));
    assert.equal(off.scene.tree, false);
    assert.equal(startsWith(off.ctx.fills, rgbaOf(WARSAW.firStar)).length, 0);
  }
  const a = fullScene(PHASE.night, CLEAR, t);
  assert.equal(JSON.stringify(a.ctx.calls), JSON.stringify(fullScene(PHASE.night, CLEAR, t).ctx.calls), 'deterministic');
});
