import { test } from 'node:test';
import assert from 'node:assert/strict';
import elChalten from '../src/cities/el-chalten/index.js';
import { deckHeight } from '../src/cities/el-chalten/massif.js';
import { buildPlates, facetColour, SHORE, GRAVEL, ROCK, BIVOUAC, LAMPS, STREAK_CLEAR, SUMMIT } from '../src/cities/el-chalten/scene.js';
import { MIRROR_SQUASH } from '../src/cities/el-chalten/water.js';
import { EL_CHALTEN as EC } from '../src/cities/el-chalten/palette.js';
import { EMPTY } from '../src/weather.js';
import { css, tint, STREAKS } from '../src/look/index.js';
import { sample } from '../src/clock.js';
import { LABEL } from '../src/jar-geometry.js';
import { bodyRect } from '../src/jar.js';

const rect = { x: 0, y: 0, w: 340, h: 396 };
const PHASE = { noon: 0.4, glow: 0.092, dusk: 0.84, night: 0.92, predawn: 0.97 };
const T_NOON = Date.UTC(2026, 11, 21, 16, 0);
const T_LAMPS = Date.UTC(2026, 11, 21, 7, 30);
const T_WINTER = Date.UTC(2026, 6, 15, 16, 0);
const plateShare = (LABEL.y - bodyRect().y) / 396;
const plates = buildPlates(rect.w, rect.h);

function recordingCtx() {
  const fills = new Set();
  const strokes = new Set();
  const calls = [];
  const target = { createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) };
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
  try { return fn(); } finally { Math.random = real; }
}

const reading = (over) => ({ ...EMPTY, known: true, temperature: 8, code: 0, kind: 'clear', cloudCover: 10, windSpeed: 5, windDir: 225, ...over });
function paint(phase, weather = EMPTY, nowMs = T_NOON) {
  const ctx = recordingCtx();
  const out = noRandom(() => elChalten.paint(ctx, rect, phase, tint(sample(phase)), weather, plates, nowMs));
  return Object.assign(ctx, { out });
}
const inPoly = (poly, x, y) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

test('the geometry: Fitz Roy above Poincenot, both high, the far shore at half, the shore above the plate', () => {
  const top = (b) => Math.min(...b.outline.map((p) => p[1]));
  assert.ok(top(plates.fitzroy) < top(plates.poincenot));
  assert.ok(top(plates.poincenot) < 0.3);
  assert.ok(Math.abs(SHORE - 0.5) <= 0.02);
  assert.ok(Math.abs(top(plates.fitzroy) - SUMMIT.y) < 1e-9);
  assert.ok(GRAVEL.y0 >= SHORE + 0.12 && GRAVEL.y0 <= plateShare - 0.05 && GRAVEL.y1 <= plateShare + 1e-9, 'a strip of beach shows above the plate');
  // the mountain is the subject: the tip stands high in the glass, and twice as far above the water as the moraine's crest
  const crest = Math.min(...plates.moraine.outline.map((p) => p[1]));
  assert.ok(SUMMIT.y < 0.15 && SHORE - SUMMIT.y >= 1.9 * (SHORE - crest));
  // the mirrored wall ends above the gravel
  assert.ok(SHORE + (SHORE - SUMMIT.y) * MIRROR_SQUASH <= GRAVEL.y0 + 1e-9);
  assert.ok(Math.min(...plates.moraine.outline.map((p) => p[0])) <= 0);
  assert.ok(Math.max(...plates.glacier.outline.map((p) => p[0])) >= 1);
});

test('every polygon point sits inside the glass frame; the plates are deterministic', () => {
  const pts = [];
  for (const b of [plates.far, plates.poincenot, plates.fitzroy, ...plates.needles]) {
    pts.push(...b.outline, ...b.facets.flatMap((f) => f.poly), ...b.ridges.flat(), ...b.couloirs.flat(), ...b.streaks.flat(), ...b.grain.flat());
  }
  pts.push(...plates.glacier.outline, ...plates.glacier.crevasses.flat(), ...plates.glacier.melt, ...plates.moraine.outline, ...plates.moraine.slope, ...plates.moraine.patches.flat(),
    ...plates.moraine.planes.flatMap((p) => p.poly), ...plates.snowfields.flat());
  for (const [x, y] of pts) assert.ok(x >= -0.1 && x <= 1.1 && y >= -0.1 && y <= 0.8, `${x},${y}`);
  assert.deepEqual(buildPlates(340, 396), buildPlates(340, 396));
});

test('the rock is built from many facets, ridges, gullies, snow streaks and grain', () => {
  const f = plates.fitzroy;
  assert.ok(f.facets.length >= 12 && f.ridges.length >= 3 && f.couloirs.length >= 2 && f.streaks.length >= 4 && f.grain.length >= 30);
  assert.ok(plates.poincenot.facets.length >= 6 && plates.poincenot.grain.length >= 30);
  assert.equal(plates.needles.length, 3);
  for (const n of plates.needles) assert.ok(n.facets.length >= 2);
  assert.ok(plates.glacier.crevasses.length >= 5 && plates.glacier.outcrops.length === 3);
  assert.ok(plates.moraine.scree.length >= 40 && plates.moraine.patches.length === 3);
  for (const fc of f.facets) assert.ok(fc.facing >= -1 && fc.facing <= 1);
});

test('snow lies on the wall and the moraine has planes of its own', () => {
  // every snowfield point is on the rock, below the skyline
  const wall = [plates.poincenot, plates.fitzroy, ...plates.needles];
  assert.equal(plates.snowfields.length, 3);
  for (const [x, y] of plates.snowfields.flat()) assert.ok(wall.some((b) => inPoly(b.outline, x, y + 1e-6)), `${x},${y}`);
  // ledge snow sits on its rib, part-way down, never above the crest
  for (const s of plates.fitzroy.streaks) for (const [x, y] of s) assert.ok(inPoly(plates.fitzroy.outline, x, y), `${x},${y}`);
  const kinds = plates.moraine.planes.map((p) => p.kind);
  for (const k of ['lit', 'dark', 'rock', 'apron']) assert.ok(kinds.includes(k), k);
  // by day the planes are different colours; a frozen hill still shows its dark rock
  const noon = paint(PHASE.noon, reading({ windSpeed: 5 }));
  for (const f of [css(EC.moraineLit, 0.75), css(EC.moraineShade, 0.7), css(EC.moraineRock, 0.85)]) assert.ok(noon.fills.has(f), f);
  const winter = paint(PHASE.noon, reading({ windSpeed: 5 }), Date.UTC(2026, 6, 15, 16, 0));
  assert.ok(winter.out.frozen && winter.fills.has(css(EC.moraineRock, 0.85 * 0.95)), 'dark rock is painted again over the snow');
});

test('the sun mock\'s patches: a left-facing and a right-facing facet of the fin, the bivouac on the wall', () => {
  const at = (x, y) => plates.fitzroy.facets.filter((fc) => inPoly(fc.poly, x, y));
  assert.ok(at(0.465, 0.33)[0].facing < -0.5);
  assert.ok(at(0.61, 0.2)[0].facing > 0.5);
  assert.ok(inPoly(plates.fitzroy.outline, BIVOUAC.x, BIVOUAC.y));
  assert.ok(!inPoly(plates.moraine.outline, BIVOUAC.x, BIVOUAC.y) && !inPoly(plates.glacier.outline, BIVOUAC.x, BIVOUAC.y));
});

test('the hiker\'s rock and every headlamp keep clear of both glass streaks, which agree with the look', () => {
  assert.deepEqual(STREAK_CLEAR, STREAKS.map((s) => [s.x, s.x + s.w]));
  for (const [a, b] of STREAK_CLEAR) {
    assert.ok(ROCK.x1 <= a || ROCK.x0 >= b);
    for (const [x] of LAMPS) assert.ok(x < a || x > b);
  }
  for (const [, y] of LAMPS) assert.ok(y >= GRAVEL.y0 && y <= plateShare);
  assert.ok(ROCK.y + ROCK.h <= plateShare + 1e-9);
});

test('paint returns the nine keys of the test surface', () => {
  assert.deepEqual(Object.keys(paint(PHASE.noon, reading({})).out).sort(),
    ['band', 'condor', 'frozen', 'glow', 'headlamps', 'hiker', 'mirror', 'plume', 'season']);
});

test('a clear noon in summer: the condor and the hiker are out, no plume, the lake mirrors', () => {
  const { out } = paint(PHASE.noon, reading({ windSpeed: 5 }));
  assert.equal(out.band, 'clear');
  assert.ok(out.condor && out.hiker);
  assert.equal(out.plume, 0);
  assert.equal(out.season, 'summer');
  assert.equal(out.frozen, false);
  assert.equal(out.mirror, 1);
});

test('no reading draws the peak clear with a short plume', () => {
  const { out } = paint(PHASE.noon, EMPTY);
  assert.equal(out.band, 'clear');
  assert.ok(out.plume > 0 && out.plume < 0.1);
});

test('a smoking day streams the banner cloud; the plume moves from one second to the next', () => {
  const w = reading({ cloudCover: 20, windSpeed: 60, windDir: 225 });
  const a = paint(PHASE.noon, w, T_NOON);
  assert.equal(a.out.band, 'smoking');
  assert.ok(a.out.plume > 0.2);
  assert.ok(!a.out.condor, 'no condor in a smoking wind');
  assert.deepEqual(paint(PHASE.noon, w, T_NOON).calls, a.calls, 'the same moment draws the same calls');
  assert.notDeepEqual(paint(PHASE.noon, w, T_NOON + 1000).calls, a.calls);
});

test('a hidden day paints none of the granite; a clear one paints the facets', () => {
  const granite = plates.fitzroy.facets.map((fc) => css(facetColour(fc.facing, PHASE.noon, tint(sample(PHASE.noon)))));
  const hidden = paint(PHASE.noon, reading({ cloudCover: 95, kind: 'rain', code: 61, windSpeed: 40, windDir: 315 }));
  assert.equal(hidden.out.band, 'hidden');
  assert.equal(hidden.out.plume, 0);
  assert.ok(granite.every((g) => !hidden.fills.has(g)), 'the wall is gone');
  const clear = paint(PHASE.noon, reading({}));
  assert.ok(granite.every((g) => clear.fills.has(g)), 'every facet painted');
});

test('a capped day sits a deck on the summits and shows no plume', () => {
  const capped = paint(PHASE.noon, reading({ cloudCover: 70, windSpeed: 10 }));
  assert.equal(capped.out.band, 'capped');
  assert.equal(capped.out.plume, 0);
  assert.ok(capped.fills.has(css([EC.deck[0] * 0.75 + EC.deckDark[0] * 0.25, EC.deck[1] * 0.75 + EC.deckDark[1] * 0.25, EC.deck[2] * 0.75 + EC.deckDark[2] * 0.25], 0.92)));
});

test('facets differ by the hour: many distinct fills at noon, at most three at night', () => {
  const distinct = (phase) => new Set(plates.fitzroy.facets.map((fc) => css(facetColour(fc.facing, phase, tint(sample(phase)))))).size;
  assert.ok(distinct(PHASE.noon) >= 8, String(distinct(PHASE.noon)));
  assert.ok(distinct(PHASE.night) <= 3, String(distinct(PHASE.night)));
});

test('alpenglow: first light after sunrise glows the summit in ember, still air mirrors it', () => {
  const g = paint(PHASE.glow, reading({ windSpeed: 4 }));
  assert.ok(g.out.glow > 0.9);
  assert.ok(g.out.mirror > 0.8);
  assert.ok(paint(PHASE.noon, reading({ windSpeed: 4 })).out.glow === 0);
  const ember = [...g.fills].filter((c) => /^rgba\((2[0-5]\d), (1\d\d|[5-9]\d), /.test(c));
  assert.ok(ember.length > 0, 'warm fills recorded');
});

test('night: no headlamps, no hiker, no condor, and the bivouac light is lit', () => {
  const n = paint(PHASE.night, reading({}), Date.UTC(2026, 11, 22, 3, 0));
  assert.equal(n.out.headlamps, 0);
  assert.equal(n.out.hiker, false);
  assert.equal(n.out.condor, false);
  assert.ok(n.fills.has(css(EC.bivouac)));
  assert.ok(!paint(PHASE.noon, reading({})).fills.has(css(EC.bivouac)));
});

test('predawn: headlamps wait on the shore in the last ninety minutes before sunrise', () => {
  assert.ok(paint(PHASE.predawn, reading({ windSpeed: 4 }), T_LAMPS).out.headlamps >= 2);
  assert.equal(paint(PHASE.predawn, reading({ windSpeed: 4 }), Date.UTC(2026, 11, 21, 3, 0)).out.headlamps, 0);
});

test('winter: the lake is frozen and shows no reflection', () => {
  const w = paint(PHASE.noon, reading({ windSpeed: 4 }), T_WINTER);
  assert.equal(w.out.season, 'winter');
  assert.equal(w.out.frozen, true);
  assert.equal(w.out.mirror, 0);
});

test('every fill and stroke is a colour the look\'s css() wrote, in every band and phase; none draws at random', () => {
  const bands = [reading({}), reading({ windSpeed: 60 }), reading({ cloudCover: 70 }), reading({ cloudCover: 95, kind: 'rain' }), EMPTY];
  for (const phase of Object.values(PHASE)) {
    for (const w of bands) {
      const c = paint(phase, w, T_LAMPS);
      for (const s of [...c.fills, ...c.strokes]) assert.match(s, /^rgba\(\d+, \d+, \d+, [\d.e-]+\)$/);
    }
  }
});

test('an absurd wind reading draws a bounded number of calls', () => {
  const sane = paint(PHASE.noon, reading({ windSpeed: 150 })).calls.length;
  const wild = paint(PHASE.noon, reading({ windSpeed: 1e9 }));
  assert.equal(wild.calls.length, sane, 'a wind beyond the ceiling draws what the ceiling draws');
  assert.ok(wild.calls.length < 20000);
});

test('rain and snow fall in front of the scene, hidden or not', () => {
  const wet = (kind, code) => reading({ cloudCover: 95, kind, code, windSpeed: 10 });
  const dry = paint(PHASE.noon, reading({ cloudCover: 95, windSpeed: 10 })).calls.length;
  for (const [kind, code] of [['rain', 61], ['drizzle', 51], ['snow', 71], ['storm', 95]]) {
    const c = paint(PHASE.noon, wet(kind, code));
    assert.equal(c.out.band, 'hidden');
    assert.ok(c.calls.length > dry + 50, `${kind} draws its streaks or flakes`);
    const last = c.calls.slice(-60).map(([k]) => k);
    assert.ok(last.includes('lineTo') || last.includes('arc') || last.includes('fillRect'), `${kind} is the last thing painted`);
  }
});

test('the lake mirrors the cap: nothing above the deck is reflected, and the banner is', () => {
  const edge = deckHeight(70) * rect.h;
  const capped = paint(PHASE.noon, reading({ cloudCover: 70, windSpeed: 10 }));
  assert.ok(capped.calls.some(([k, a]) => k === 'rect' && Math.abs(a[1] - edge) < 1e-6 && Math.abs(a[3] - (SHORE * rect.h - edge)) < 1e-6), 'a clip below the deck edge');
  const clear = paint(PHASE.noon, reading({ windSpeed: 5 }));
  assert.ok(!clear.calls.some(([k, a]) => k === 'rect' && Math.abs(a[1] - edge) < 1e-6), 'no such clip on a clear day');
  const reflected = (c) => { const i = c.calls.findIndex(([k, a]) => k === 'scale' && a[1] === -MIRROR_SQUASH); return { i, slice: c.calls.slice(i) }; };
  const smoking = paint(PHASE.noon, reading({ cloudCover: 20, windSpeed: 30 }));
  const r = reflected(smoking);
  assert.ok(r.i > 0 && smoking.out.mirror > 0);
  assert.ok(r.slice.some(([k, a]) => k === 'fillRect' && a[2] > 8), 'a banner puff after the flip');
});

test('the bivouac light stays off under any cap (the deck and its puffs cover it) and shows on a clear night', () => {
  const night = Date.UTC(2026, 0, 22, 3, 0);
  for (const cover of [62, 65, 70, 80]) {
    assert.ok(!paint(PHASE.night, reading({ cloudCover: cover, windSpeed: 4 }), night).fills.has(css(EC.bivouac)), `cap at cover ${cover}`);
  }
  assert.ok(paint(PHASE.night, reading({ cloudCover: 30, windSpeed: 4 }), night).fills.has(css(EC.bivouac)));
});

test('the lake under a cap mirrors the deck too; a clear lake does not', () => {
  const deckFill = (c, edge) => c.calls.slice(c.calls.findIndex(([k, a]) => k === 'scale' && a[1] === -MIRROR_SQUASH))
    .some(([k, a]) => k === 'fillRect' && a[0] === 0 && a[1] === 0 && a[2] === 340 && Math.abs(a[3] - (edge - 0.035) * 396) < 1e-6);
  assert.ok(deckFill(paint(PHASE.noon, reading({ cloudCover: 70, windSpeed: 10 })), deckHeight(70)));
  assert.ok(!deckFill(paint(PHASE.noon, reading({ windSpeed: 5 })), deckHeight(70)));
  // a still, hidden day: the cloud that swallowed the moraine is in the water too, painted after it
  const still = paint(PHASE.noon, reading({ cloudCover: 95, windSpeed: 4 }));
  assert.ok(still.out.band === 'hidden' && still.out.mirror > 0);
  const flip = still.calls.findIndex(([k, a]) => k === 'scale' && a[1] === -MIRROR_SQUASH);
  assert.ok(still.calls.slice(flip).some(([k, a]) => k === 'fillRect' && a[0] === 0 && a[1] === 0 && a[2] === 340 && Math.abs(a[3] - (SHORE - 0.035 - 0.05) * 396) < 1e-6), 'the hidden deck is mirrored');
});

test('a storm flashes in front of the scene, not only in the shared sky', () => {
  const storm = reading({ cloudCover: 95, kind: 'storm', code: 95, windSpeed: 10 });
  const full = (c) => c.calls.slice(-80).some(([k, a]) => k === 'fillRect' && a[2] === 340 && a[3] === 396);
  assert.ok(full(paint(PHASE.noon, storm, 1680)), 'at the burst\'s peak the flash covers the jar last');
  assert.ok(!full(paint(PHASE.noon, storm, 6000)), 'between bursts there is none');
});
