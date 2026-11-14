import { test } from 'node:test';
import assert from 'node:assert/strict';
import elChalten from '../src/cities/el-chalten/index.js';
import { deckHeight, HIDDEN_EDGE, GHOST_EVERY_MS, GHOST_MS, snowAmount, summitWindOf } from '../src/cities/el-chalten/massif.js';
import { DECK_SOFT, lensSpot, sunSpot } from '../src/cities/el-chalten/air.js';
import { condorAt, lapAt, CONDOR_LOOP_MS } from '../src/cities/el-chalten/shore.js';
import { buildPlates, facetColour, emberTone, wallSnow, snowTone, glowShare, mood, snowAt, shownSnow, BARE, SHORE, GRAVEL, ROCK, BIVOUAC, LAMPS, STREAK_CLEAR, SUMMIT, SUN_X, HAZE } from '../src/cities/el-chalten/scene.js';
import { visibleSnow, polyArea, bbox, chainY, occlusion, boxHitsPoly } from '../src/cities/el-chalten/snow.js';
import { MIRROR_SQUASH } from '../src/cities/el-chalten/water.js';
import { EL_CHALTEN as EC } from '../src/cities/el-chalten/palette.js';
import { EMPTY } from '../src/weather.js';
import { css, tint, STREAKS, mix } from '../src/look/index.js';
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
  // the wall is the subject: the moraine and the glacier lie low, so most of the granite shows
  assert.ok(crest >= 0.39, 'the moraine is a low hill');
  const ice = plates.glacier.outline;
  assert.ok(Math.min(...ice.map((p) => p[1])) >= 0.32 && Math.max(...ice.map((p) => p[1])) <= 0.45, 'the glacier hangs at the foot of the wall');
  assert.ok(Math.min(...ice.map((p) => p[0])) >= 0.38 && Math.max(...ice.map((p) => p[0])) <= 0.96);
  // Fitz Roy is the dominant tower: taller above the water than anything else by a fifth
  const others = [plates.poincenot, ...plates.needles, ...plates.south, plates.far].map((b) => Math.min(...b.outline.map((p) => p[1])));
  for (const y of others) assert.ok(SHORE - SUMMIT.y >= 1.2 * (SHORE - y));
  // each layer further off is paler
  assert.ok(HAZE.far > HAZE.south && HAZE.south > HAZE.wall);
});

test('every polygon point sits inside the glass frame; the plates are deterministic', () => {
  const pts = [];
  for (const b of [plates.far, plates.poincenot, plates.fitzroy, ...plates.needles, ...plates.south]) {
    pts.push(...b.outline, ...b.facets.flatMap((f) => f.poly), ...b.ridges.flat(), ...b.couloirs.flat(), ...b.snow.flatMap((sn) => sn.poly), ...b.grain.flat());
  }
  pts.push(...plates.glacier.outline, ...plates.glacier.crevasses.flat(), ...plates.glacier.melt, ...plates.glacier.cliff, ...plates.glacier.bench, ...plates.glacier.shades.flat(), ...plates.glacier.fingers.flatMap((f) => f.poly), ...plates.caps.flat(), ...plates.moraine.outline, ...plates.moraine.slope, ...plates.moraine.patches.flat(),
    ...plates.moraine.planes.flatMap((p) => p.poly));
  for (const [x, y] of pts) assert.ok(x >= -0.1 && x <= 1.1 && y >= -0.1 && y <= 0.8, `${x},${y}`);
  assert.deepEqual(buildPlates(340, 396), buildPlates(340, 396));
});

test('the rock is built from many facets, ridges, gullies, snow and grain', () => {
  const f = plates.fitzroy;
  assert.ok(f.facets.length >= 12 && f.ridges.length >= 3 && f.couloirs.length >= 2 && f.grain.length >= 30);
  assert.ok(f.snow.filter((s) => s.kind === 'gully').length >= 3 && f.snow.filter((s) => s.kind === 'ledge').length >= 6);
  assert.ok(plates.poincenot.facets.length >= 6 && plates.poincenot.grain.length >= 30);
  assert.equal(plates.needles.length, 3);
  for (const n of plates.needles) assert.ok(n.facets.length >= 2);
  assert.equal(plates.south.length, 3);
  assert.ok(plates.glacier.crevasses.length >= 5);
  assert.ok(plates.moraine.scree.length >= 40 && plates.moraine.patches.length === 3);
  for (const fc of f.facets) assert.ok(fc.facing >= -1 && fc.facing <= 1);
});

test('snow lies on the wall in gullies, on ledges and in the saddle, and the moraine has planes of its own', () => {
  // every shape of every wall body is on its own rock, below the skyline
  const wall = [plates.poincenot, plates.fitzroy, ...plates.needles, ...plates.south];
  for (const b of wall) for (const sn of b.snow) for (const [x, y] of sn.poly) assert.ok(inPoly(b.outline, x, y), `${sn.kind} ${x},${y}`);
  const saddles = (b) => b.snow.filter((sn) => sn.kind === 'saddle').length;
  assert.ok(saddles(plates.poincenot) >= 1 && saddles(plates.fitzroy) >= 1);
  for (const b of [...plates.needles, ...plates.south, plates.far]) assert.equal(saddles(b), 0);
  assert.equal(plates.far.snow.length, 0, 'the far ridge carries no snow');
  const kinds = plates.moraine.planes.map((p) => p.kind);
  for (const k of ['lit', 'dark', 'rock', 'apron']) assert.ok(kinds.includes(k), k);
  // by day the planes are different colours; a frozen hill still shows its dark rock
  const noon = paint(PHASE.noon, reading({ windSpeed: 5 }));
  for (const f of [css(EC.moraineLit, 0.75), css(EC.moraineShade, 0.7), css(EC.moraineRock, 0.85)]) assert.ok(noon.fills.has(f), f);
  const winter = paint(PHASE.noon, reading({ windSpeed: 5 }), Date.UTC(2026, 6, 15, 16, 0));
  assert.ok(winter.out.frozen && winter.fills.has(css(EC.moraineRock, 0.85 * 0.95)), 'dark rock is painted again over the snow');
});

const allShapes = () => [plates.poincenot, plates.fitzroy, ...plates.needles, ...plates.south].flatMap((b) => b.snow);
const margin = plates.glacier.outline.slice(0, 19);
const occl = (x) => occlusion(margin, x);
const above = (sn) => sn.poly.filter(([x, y]) => y <= occl(x));
const spread = (pts) => (pts.length ? Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])) : 0);

test('no four-point diamond: every snow shape has at least five corners, ledges are wider than tall, gullies widen downward', () => {
  const shapes = allShapes();
  assert.ok(shapes.length >= 30);
  for (const sn of shapes) assert.ok(sn.poly.length >= 5, `${sn.kind} has ${sn.poly.length} corners`);
  for (const c of plates.caps) assert.ok(c.length >= 5, 'a cap is no diamond either');
  for (const sn of shapes.filter((x) => x.kind === 'ledge')) {
    const b = bbox(sn.poly);
    assert.ok(b.x1 - b.x0 >= 2.5 * (b.y1 - b.y0), 'a ledge is wider than tall');
  }
  // widening is measured on what shows above whatever stands in front of the wall
  const ribbons = shapes.filter((x) => x.kind === 'gully' || x.kind === 'skirt');
  assert.ok(ribbons.length >= 10);
  for (const sn of ribbons) {
    const seen = above(sn);
    assert.equal(seen.length, sn.poly.length, `${sn.kind} ends above the glacier or the moraine`);
    const b = bbox(seen);
    const span = b.y1 - b.y0;
    const topW = spread(seen.filter((p) => p[1] <= b.y0 + 0.4 * span));
    const lowW = spread(seen.filter((p) => p[1] >= b.y1 - 0.4 * span));
    assert.ok(lowW >= 3 * topW, `${sn.kind} widens downward (${lowW.toFixed(3)} vs ${topW.toFixed(3)})`);
  }
});

test('no ledge sliver crosses a gully, an apron or a finger of its own body, and ledges lean', () => {
  let ledges = 0;
  for (const b of [plates.poincenot, plates.fitzroy, ...plates.needles, ...plates.south]) {
    const ribbons = b.snow.filter((x) => x.kind === 'gully' || x.kind === 'skirt' || x.kind === 'finger');
    for (const l of b.snow.filter((x) => x.kind === 'ledge')) {
      ledges++;
      for (const r of ribbons) assert.ok(!boxHitsPoly(bbox(l.poly), r.poly), `a ledge at ${l.probe} crosses a ${r.kind}`);
      assert.ok(Math.abs(l.poly[1][1] - l.poly[0][1]) > 0.0008, 'slanted');
    }
  }
  assert.ok(ledges >= 10);
});

test('snow keeps the smoke check\'s bare granite bare and never hides the wall', () => {
  for (const sn of allShapes()) for (const [x, y] of BARE) assert.ok(!inPoly(sn.poly, x, y), `${sn.kind} covers ${x},${y}`);
  for (const b of [plates.poincenot, plates.fitzroy]) {
    const area = b.snow.reduce((sum, sn) => sum + polyArea(sn.poly), 0);
    assert.ok(area <= 0.3 * polyArea(b.outline), `snow covers ${(area / polyArea(b.outline)).toFixed(2)} of the body`);
  }
});

const moodAt = (phase, weather = EMPTY, nowMs = T_NOON) => mood(tint(sample(phase)), weather, nowMs, elChalten.location, phase);

test('snow is white on the lit face and blue-grey in the shade by day, one tone at night and at sunset', () => {
  const noon = moodAt(PHASE.noon);
  const tn = tint(sample(PHASE.noon));
  const lit = wallSnow(PHASE.noon, tn, noon, 1);
  const shaded = wallSnow(PHASE.noon, tn, noon, -1);
  assert.notDeepEqual(lit, shaded);
  assert.ok(lit[0] > shaded[0] + 20 && shaded[2] > shaded[0] + 8, 'white in the sun, blue-grey in the shade');
  for (const phase of [PHASE.night, 0.76]) {
    const m = moodAt(phase);
    const t = tint(sample(phase));
    const a = wallSnow(phase, t, m, 1);
    const b = wallSnow(phase, t, m, -1);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(a[i] - b[i]) <= 1, `phase ${phase} channel ${i}`);
  }
  // the noon paint draws a lit and a shaded gully in their own two colours
  const gullies = plates.fitzroy.snow.filter((sn) => sn.kind === 'gully' && sn.hold === 0);
  const sunny = gullies.reduce((a, b) => (b.facing > a.facing ? b : a));
  const dim = gullies.reduce((a, b) => (b.facing < a.facing ? b : a));
  const painted = paint(PHASE.noon, EMPTY, T_NOON);
  const topY = (sn) => Math.min(...sn.poly.map((p) => p[1]));
  for (const sn of [sunny, dim]) assert.ok(painted.fills.has(css(wallSnow(PHASE.noon, tn, noon, sn.facing, topY(sn)), 0.96)), `facing ${sn.facing}`);
});

// What HEAD's wallSnow returned (it took no facing and no haze)
const oldWallSnow = (tn, m, y) => {
  let c = mix(snowTone(m), EC.graniteNight, m.n * 0.3 * (1 - m.moon.k));
  c = mix(c, EC.graniteDusk, m.sil * 0.62);
  c = mix(c, EC.emberSnow, 0.85 * glowShare(m, y));
  return mix(c, tn.skyLow, 0.1);
};

test('where the wall shows no lit or shaded side the snow is exactly what it was: night, sunset, first light, caps too', () => {
  for (const phase of [PHASE.night, 0.76]) {
    const m = moodAt(phase);
    const t = tint(sample(phase));
    for (const y of [SUMMIT.y, 0.2]) {
      const old = oldWallSnow(t, m, y);
      for (const facing of [1, -1, 0.6]) {
        const now = wallSnow(phase, t, m, facing, y);
        for (let i = 0; i < 3; i++) assert.ok(Math.abs(now[i] - old[i]) < 1e-9, `phase ${phase} facing ${facing} channel ${i}`);
      }
    }
  }
});

test('snow on the far peaks is hazed with them, the front wall\'s snow is not changed', () => {
  const m = moodAt(PHASE.noon);
  const t = tint(sample(PHASE.noon));
  const dist = (c) => Math.hypot(c[0] - t.skyLow[0], c[1] - t.skyLow[1], c[2] - t.skyLow[2]);
  for (const facing of [1, -1]) {
    assert.ok(dist(wallSnow(PHASE.noon, t, m, facing, 0.3, HAZE.south)) < dist(wallSnow(PHASE.noon, t, m, facing, 0.3, HAZE.wall)));
    assert.deepEqual(wallSnow(PHASE.noon, t, m, facing, 0.3), wallSnow(PHASE.noon, t, m, facing, 0.3, HAZE.wall));
  }
  const o = oldWallSnow(t, m, 0.3);
  const f = wallSnow(PHASE.noon, t, m, 0, 0.3);
  assert.ok(f.every((v, i) => Math.abs(v - o[i]) < 60), 'a flat face is still snow-coloured');
});

test('winter and fresh snow show more shapes than late summer; February the fewest', () => {
  const f = plates.fitzroy.snow;
  // what counts is what shows: shapes whose every point lies above what stands in front of the wall
  const seen = (shapes, amount) => visibleSnow(shapes, amount).filter((sn) => above(sn).length === sn.poly.length);
  const wall = [plates.poincenot, plates.fitzroy].flatMap((b) => b.snow);
  assert.ok(seen(wall, snowAmount('winter', 7, 0)).length >= seen(wall, snowAmount('summer', 1, 0)).length + 6);
  // every season is its own step: February < summer < autumn < spring < winter, over every wall body
  const every = [plates.poincenot, plates.fitzroy, ...plates.needles].flatMap((b) => b.snow);
  const counts = [snowAmount('summer', 2, 0), snowAmount('summer', 1, 0), snowAmount('autumn', 4, 0), snowAmount('spring', 10, 0), snowAmount('winter', 7, 0)].map((a) => seen(every, a).length);
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] > counts[i - 1], `season step ${i}: ${counts.join(' < ')}`);
  assert.ok(visibleSnow(f, snowAmount('winter', 7, 0)).length > visibleSnow(f, snowAmount('summer', 1, 0)).length);
  assert.ok(snowAmount('summer', 1, 1) > snowAmount('summer', 1, 0));
  assert.ok(snowAmount('summer', 2, 0) < snowAmount('summer', 1, 0));
  assert.ok(visibleSnow(f, snowAmount('summer', 1, 0)).length >= 1 && visibleSnow(f, 1).length < f.length + 1);
});

test('the glacier fingers up into the needles\' gullies', () => {
  const top = plates.glacier.outline.slice(0, 19);
  const fingers = plates.glacier.fingers;
  assert.ok(fingers.length >= 2);
  for (const fg of fingers) {
    const ys = fg.poly.map((p) => p[1]);
    const gy = chainY(top, fg.probe[0]);
    assert.ok(Math.max(...ys) >= gy, 'reaches the glacier');
    assert.ok(Math.min(...ys) <= gy - 0.03, 'climbs into the gully');
    assert.ok(plates.needles.some((n) => inPoly(n.outline, fg.probe[0], fg.probe[1])), 'inside a needle');
    assert.ok(fg.poly.length >= 7);
  }
  // a gully the glacier does not reach keeps its ribbon on the needle
  const kept = plates.south.flatMap((b) => b.snow).filter((sn) => sn.kind === 'gully');
  assert.ok(kept.length >= 1);
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

test('paint returns the twelve keys of the test surface', () => {
  assert.deepEqual(Object.keys(paint(PHASE.noon, reading({})).out).sort(),
    ['band', 'condor', 'frozen', 'glow', 'headlamps', 'hiker', 'mirror', 'plume', 'plumeWind', 'season', 'snowLine', 'tourists']);
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
  assert.ok(still.calls.slice(flip).some(([k, a]) => k === 'fillRect' && a[0] === 0 && a[1] === 0 && a[2] === 340 && Math.abs(a[3] - (HIDDEN_EDGE - DECK_SOFT.hidden) * 396) < 1e-6), 'the hidden deck is mirrored');
});

test('a storm flashes in front of the scene, not only in the shared sky', () => {
  const storm = reading({ cloudCover: 95, kind: 'storm', code: 95, windSpeed: 10 });
  const full = (c) => c.calls.slice(-80).some(([k, a]) => k === 'fillRect' && a[2] === 340 && a[3] === 396);
  assert.ok(full(paint(PHASE.noon, storm, 1680)), 'at the burst\'s peak the flash covers the jar last');
  assert.ok(!full(paint(PHASE.noon, storm, 6000)), 'between bursts there is none');
});

// ---- the look-and-feel pass --------------------------------------------------
const T_FULL_MOON = Date.UTC(2026, 0, 3, 4, 0); // 01:00 in El Chalten, the moon full and high
const T_NEW_MOON = Date.UTC(2026, 0, 18, 22, 0) + 6 * 3600000;
const rgb = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

test('the glacier hangs: an ice cliff under its front, crevasses down the flow, no dark patches on the ice', () => {
  const g = plates.glacier;
  assert.equal(g.outcrops, undefined, 'nothing dark sits on the ice');
  // the cliff hangs below the front, never above it
  const frontY = (x) => { for (let i = 1; i < g.front.length; i++) if (x <= g.front[i][0]) { const [x0, y0] = g.front[i - 1]; const [x1, y1] = g.front[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); } return g.front[g.front.length - 1][1]; };
  for (const [x, y] of g.cliff) assert.ok(y >= frontY(x) - 1e-9, `${x},${y}`);
  assert.ok(Math.max(...g.cliff.map((p) => p[1])) - Math.max(...g.front.map((p) => p[1])) >= 0.008, 'the cliff has a face');
  // every crevasse runs down the flow: longer in y than in x, and on the ice
  for (const c of g.crevasses) {
    const [a, b] = [c[0], c[c.length - 1]];
    assert.ok(b[1] > a[1] && b[1] - a[1] > Math.abs(b[0] - a[0]));
    for (const [x, y] of c) assert.ok(inPoly(g.outline, x, y - 1e-4), `${x},${y}`);
  }
  // the blue of the cliff is painted by day
  const noon = paint(PHASE.noon, reading({}));
  assert.ok([...noon.fills].some((f) => { const [r, , b] = rgb(f); return b > r + 60; }), 'an ice-blue fill');
});

test('alpenglow creeps: red on the tips first, gold by the time it reaches the foot, pink on the snow and ice', () => {
  const early = emberTone(0.14);
  const late = emberTone(0.52);
  assert.ok(late[1] > early[1] + 30, 'the light turns from red to gold as it walks down');
  assert.ok(emberTone(0.3, -1)[0] < emberTone(0.3, 1)[0], 'a face turned away is a deeper red');
  // early: the line is still high, so the glacier and the low snow are not pink yet; later they are
  const pink = (c) => [...c.fills].filter((f) => { const [r, g, b] = rgb(f); return r > 235 && g > 150 && g < 225 && b > 130 && r > b + 25; }).length;
  const first = paint(0.076, reading({ windSpeed: 4 }));
  const full = paint(0.094, reading({ windSpeed: 4 }));
  assert.ok(first.out.glow > 0 && full.out.glow > 0.9);
  assert.ok(pink(full) > pink(first), `${pink(first)} then ${pink(full)}`);
  // the mirror is stronger at first light than at noon
  const alphaOf = (c) => { const i = c.calls.findIndex(([k, a]) => k === 'scale' && a[1] === -MIRROR_SQUASH); return i; };
  assert.ok(alphaOf(full) > 0);
});

test('the evening sun goes down behind the col, between Poincenot and Fitz Roy', () => {
  const inWall = (x, y) => [plates.poincenot, plates.fitzroy].some((b) => inPoly(b.outline, x, y));
  assert.ok(!inWall(SUN_X, sunSpot(0).y), 'high, it stands in the sky above the col');
  assert.ok(inWall(SUN_X, sunSpot(1).y), 'sunk, it is behind the rock');
  // at sunset the ridgeline carries a warm rim, at noon it does not
  const rim = (c) => [...c.strokes].some((f) => { const [r, g, b] = rgb(f); return r === 255 && g > 190 && b < 170; });
  assert.ok(rim(paint(0.74, reading({}))));
  assert.ok(!rim(paint(PHASE.noon, reading({}))));
});

test('a hidden day keeps the near ground and, now and then, shows a ghost of the wall', () => {
  const rain = reading({ cloudCover: 95, kind: 'rain', code: 61, windSpeed: 40, windDir: 315 });
  assert.ok(HIDDEN_EDGE < SHORE - 0.06, 'the cloud base stands clear of the water');
  assert.ok(Math.max(...plates.moraine.outline.map((p) => p[1])) > HIDDEN_EDGE + 0.05, 'the foot of the moraine is under the base');
  const ghostFill = css(EC.ghost, 0.42);
  const window0 = Math.floor(T_NOON / GHOST_EVERY_MS) * GHOST_EVERY_MS;
  const open = paint(PHASE.noon, rain, window0 + GHOST_MS / 2);
  const shut = paint(PHASE.noon, rain, window0 + GHOST_MS + 5000);
  assert.ok(open.fills.has(ghostFill), 'at the middle of the window the wall stands in the cloud, grey');
  assert.ok(![...shut.fills].some((f) => f.startsWith(css(EC.ghost, 1).slice(0, -4))), 'and outside it there is none');
  assert.equal(open.out.band, 'hidden');
  // the curtains move
  assert.notDeepEqual(paint(PHASE.noon, rain, window0 + 20000).calls, paint(PHASE.noon, rain, window0 + 21000).calls);
  // rain hangs shafts from the base; a dry overcast does not
  const dry = paint(PHASE.noon, reading({ cloudCover: 95, windSpeed: 40, windDir: 315 }), window0 + 20000);
  const wet = paint(PHASE.noon, rain, window0 + 20000);
  assert.ok(wet.calls.length > dry.calls.length);
});

test('a clear night: the Milky Way and the Southern Cross, and a bright moon on the snow, the water and the shore', () => {
  assert.equal(plates.cross.stars.length, 5);
  assert.equal(plates.cross.pointers.length, 2);
  assert.ok(plates.sky.dust.length >= 60 && plates.sky.clouds.length >= 6);
  // the Cross and its pointers stand in open sky, clear of every rock
  const rock = [plates.far, plates.poincenot, plates.fitzroy, ...plates.needles, ...plates.south];
  for (const [x, y] of [...plates.cross.stars, ...plates.cross.pointers]) assert.ok(!rock.some((b) => inPoly(b.outline, x, y)), `${x},${y}`);
  const track = (c) => [...c.fills].some((f) => rgb(f).join() === EC.moonTrack.join());
  const full = paint(PHASE.night, reading({ windSpeed: 4, cloudCover: 5 }), T_FULL_MOON);
  const dark = paint(PHASE.night, reading({ windSpeed: 4, cloudCover: 5 }), T_NEW_MOON);
  assert.ok(track(full), 'a full moon lays a track on the lake');
  assert.ok(!track(dark), 'a new moon lays none');
  assert.ok(!track(paint(PHASE.night, reading({ cloudCover: 95, kind: 'rain' }), T_FULL_MOON)), 'nor does a moon behind the cloud');
  // the dust of the Milky Way is painted only on a clear night
  const arcs = (c) => c.calls.filter(([k]) => k === 'arc').length;
  assert.ok(arcs(dark) > arcs(paint(PHASE.night, reading({ cloudCover: 70 }), T_NEW_MOON)) + 60);
});

test('winter: no white is whiter than 236, and the snow has a blue shadow side', () => {
  assert.ok(Math.max(...EC.snow) <= 243 && 0.2126 * EC.snow[0] + 0.7152 * EC.snow[1] + 0.0722 * EC.snow[2] <= 236.5);
  assert.ok(EC.snowShade[2] > EC.snowShade[0] + 30);
  const w = paint(PHASE.noon, reading({ windSpeed: 4, temperature: -6 }), T_WINTER);
  const luma = (f) => { const [r, g, b] = rgb(f); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  // nothing the scene itself fills in winter is brighter than the snow
  for (const f of w.fills) if (!/, 0\)$/.test(f)) assert.ok(luma(f) <= 237, f);
  assert.ok(plates.shore.drifts.length >= 8, 'the snow on the ground lies in drifts, with gravel between');
});

test('wind: a lens beside the summit, spindrift off the ridges, whitecaps, and a condor that circles', () => {
  const breezy = paint(PHASE.noon, reading({ windSpeed: 22 }));
  assert.equal(breezy.out.band, 'clear');
  assert.ok(breezy.calls.filter(([k]) => k === 'ellipse').length > paint(PHASE.noon, reading({ windSpeed: 5 })).calls.filter(([k]) => k === 'ellipse').length, 'the lens is drawn');
  const gale = paint(PHASE.noon, reading({ windSpeed: 80, cloudCover: 20 }));
  assert.ok(gale.calls.length > paint(PHASE.noon, reading({ windSpeed: 46, cloudCover: 20 })).calls.length, 'more wind, more spindrift and whitecaps');
  assert.ok(gale.strokes.has(css(EC.whitecap, 0)) || [...gale.strokes].some((f) => rgb(f).join() === EC.whitecap.join()), 'whitecaps on the lake');
  // the lens stands upwind of the summit, so the banner never crosses it
  assert.ok(lensSpot(0.7).x < SUMMIT.x && lensSpot(-0.7).x > SUMMIT.x);
  // the condor goes round: a quarter of a loop later it is somewhere else, a whole loop later back
  const a = condorAt(0);
  const b = condorAt(CONDOR_LOOP_MS / 4);
  const c = condorAt(CONDOR_LOOP_MS);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 0.05);
  assert.ok(Math.abs(a.x - c.x) < 1e-9 && Math.abs(a.y - c.y) < 1e-9);
  assert.ok(a.y < SUMMIT.y + 0.01 && b.y < SUMMIT.y + 0.01, 'above the summit');
  assert.notDeepEqual(paint(PHASE.noon, reading({ windSpeed: 5 }), T_NOON).calls, paint(PHASE.noon, reading({ windSpeed: 5 }), T_NOON + 3000).calls);
});

test('the foreground: scrub clumps and boulders with a shaded side; the water laps within a hair of the shore', () => {
  const sh = plates.shore;
  assert.ok(sh.shrubs.length >= 12);
  for (const s of sh.shrubs) assert.ok(s.lobes.length >= 4 && s.twigs.length >= 4 && s.y > GRAVEL.y0);
  for (const b of sh.boulders) assert.ok(b.shade.length === 4 && b.lit.length === 4);
  // big scrub keeps to the sides of the label plate
  for (const s of sh.shrubs) if (s.y > plateShare) assert.ok(s.x < 0.2 || s.x > 0.8, `${s.x}`);
  for (let t = 0; t < 20000; t += 700) for (const x of [0, 0.3, 0.9]) assert.ok(Math.abs(lapAt(x, t)) <= 0.006);
  assert.notEqual(lapAt(0.3, 0), lapAt(0.3, 900));
  // the scrub turns with the season: red-orange in April, green in January
  const red = (c) => [...c.fills].filter((f) => { const [r, g, b] = rgb(f); return r > 150 && r > g + 60 && r > b + 60; }).length;
  const april = paint(PHASE.noon, reading({}), Date.UTC(2026, 3, 15, 16, 0));
  assert.equal(april.out.season, 'autumn');
  assert.ok(red(april) > red(paint(PHASE.noon, reading({}))));
});

test('a summit gale over a calm valley: the peak smokes, the plume is the summit\'s, and the lake still mirrors', () => {
  const g = paint(PHASE.noon, reading({ cloudCover: 20, windSpeed: 5, windSpeed700: 70, windDir700: 240 }));
  assert.equal(g.out.band, 'smoking');
  assert.ok(g.out.plume > 0.2);
  assert.equal(g.out.plumeWind, 'summit');
  assert.equal(g.out.mirror, 1);
  assert.equal(g.out.condor, false);
  assert.equal(paint(PHASE.noon, reading({ windSpeed: 5 })).out.plumeWind, 'town');
});

test('the snow line: a low freezing level whitens the moraine and the shore at a summer noon, a high one leaves them bare', () => {
  const dark = css(EC.moraineRock, 0.85 * 0.95);
  const low = paint(PHASE.noon, reading({ windSpeed: 5, freezingLevel: 1100 }));
  const mid = paint(PHASE.noon, reading({ windSpeed: 5, freezingLevel: 2500 }));
  const high = paint(PHASE.noon, reading({ windSpeed: 5, freezingLevel: 4000 }));
  assert.equal(low.out.snowLine, 1);
  assert.equal(high.out.snowLine, 0);
  assert.ok(mid.out.snowLine > 0 && mid.out.snowLine < 1);
  assert.ok(low.fills.has(dark) && !high.fills.has(dark), 'the moraine is snowed in and bare');
  const m = mood(tint(sample(PHASE.noon)), reading({ windSpeed: 5, freezingLevel: 1100 }), T_NOON, { zone: 'America/Argentina/Rio_Gallegos' }, PHASE.noon);
  const trodden = css(snowTone(m, 1), 0.8);
  assert.ok(low.fills.has(trodden) && !high.fills.has(trodden), 'trodden snow on the gravel');
  // the wall: snow shapes only above the line (the wall's snow is buildSnow's shapes, filtered by shownSnow)
  const mm = mood(tint(sample(PHASE.noon)), reading({ windSpeed: 5, freezingLevel: 2500 }), T_NOON, { zone: 'America/Argentina/Rio_Gallegos' }, PHASE.noon);
  const top = (s) => Math.min(...s.poly.map((p) => p[1]));
  const tops = plates.fitzroy.snow.map(top);
  assert.ok(tops.some((y) => snowAt(mm, y)) && tops.some((y) => !snowAt(mm, y)), 'a line across the wall');
  const shown = shownSnow(plates.fitzroy.snow, mm);
  assert.ok(shown.length > 0 && shown.length < plates.fitzroy.snow.length && shown.every((s) => top(s) <= mm.snowLineY), 'only the shapes above the line lie');
  const none = mood(tint(sample(PHASE.noon)), reading({ windSpeed: 5 }), T_NOON, { zone: 'America/Argentina/Rio_Gallegos' }, PHASE.noon);
  assert.deepEqual(shownSnow(plates.fitzroy.snow, none), visibleSnow(plates.fitzroy.snow, none.snow), 'no figure: the season holds as before');
  assert.ok(high.calls.length < mid.calls.length && mid.calls.length < low.calls.length);
});

test("no figure draws exactly today's picture", () => {
  const a = paint(PHASE.noon, reading({ windSpeed: 60, windDir: 225 }));
  const b = paint(PHASE.noon, reading({ windSpeed: 60, windDir: 225, windSpeed700: undefined, freezingLevel: undefined }));
  assert.deepEqual(a.calls, b.calls);
  assert.equal(a.out.plumeWind, 'town');
  assert.equal(a.out.snowLine, null);
  assert.equal(summitWindOf(reading({ windSpeed: 60 })), 60);
  assert.equal(paint(PHASE.noon, reading({ windSpeed: 4 }), T_WINTER).out.frozen, true);
});
