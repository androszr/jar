import { test } from 'node:test';
import assert from 'node:assert/strict';
import nazare from '../src/cities/nazare/index.js';
import {
  HORIZON, CLIFF, FORT, TOWER, LANTERN, LAMP_ROOM, GALLERY, WAVE, BEACH, STREAK_CLEAR, buildPlates, nightAmount, sunSide, layout, waveState, waveStates, surferSpots, baseAt, standAt, reachAt, breakAt, BEAM, beamLobes, cliffFaceX, ROUGH, waveTopAt, foamLight, lampOn, roughness, hitAt,
  COLLAPSE, curlAmount, sprayRise, SPRAY_TOP, seaTones, drawSun, drawBeamHaze,
} from '../src/cities/nazare/scene.js';
import { SUN, SUN_GLOOM, sunSpot, sunShare, sunStrength, sunLow, seaSideLight } from '../src/cities/nazare/sun.js';
import { waterline, swashAt, FLAG } from '../src/cities/nazare/beach.js';
import { waveSize } from '../src/cities/nazare/sea.js';
import { NAZARE } from '../src/cities/nazare/palette.js';
import { EMPTY } from '../src/weather.js';
import { css, tint, STREAKS } from '../src/look/index.js';
import { sample } from '../src/clock.js';
import { surferPlan } from '../src/cities/nazare/sea.js';
import { sunAltitude } from '../src/clock.js';
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

test('the wave forms below the horizon and lands above the beach; the strand ends at the plate and the sand runs to the bottom of the jar', () => {
  assert.ok(WAVE.formY > HORIZON && WAVE.breakY > WAVE.formY);
  assert.ok(WAVE.breakY < BEACH.y0);
  assert.ok(BEACH.y0 < BEACH.strand && BEACH.strand <= plateShare + 1e-9);
  assert.equal(BEACH.y1, 1);
  // the water's edge is nearly level and never rises into the breaking wave
  for (let xs = -0.1; xs <= 1.1; xs += 0.01) assert.ok(waterline(xs) > WAVE.breakY && waterline(xs) < BEACH.strand, `edge at ${xs}`);
  assert.ok(FLAG.foot <= BEACH.strand && FLAG.top < BEACH.y0 && FLAG.x > STREAK_CLEAR[0][1] && FLAG.x < CLIFF.foot.x);
  assert.equal(swashAt(0.5), 0);
  assert.ok(swashAt(0.9) > 0.9);
});

test('the foreground is beach: the sand is painted from the water\'s edge down past the bottom of the jar, before the rock', () => {
  const { calls } = paint(PHASE.noon, EMPTY, 5000);
  const near = (v, w) => Math.abs(v - w) < 1e-6;
  const edgeAt = calls.findIndex(([k, a]) => k === 'moveTo' && near(a[0], -0.1 * rect.w) && near(a[1], waterline(-0.1) * rect.h));
  const cliffAt = calls.findIndex(([k, a]) => k === 'moveTo' && near(a[0], CLIFF.foot.x * rect.w) && near(a[1], CLIFF.foot.y * rect.h));
  assert.ok(edgeAt >= 0 && edgeAt < cliffAt, `sand at ${edgeAt}, cliff at ${cliffAt}`);
  const run = calls.slice(edgeAt, edgeAt + 40).filter(([k]) => k === 'lineTo');
  assert.ok(run.some(([, a]) => a[1] >= rect.h && a[0] <= 0) && run.some(([, a]) => a[1] >= rect.h && a[0] >= rect.w), 'the sand reaches both bottom corners');
  // and the sea is filled no lower than just under the water's edge
  const seaFill = calls.find(([k, a]) => k === 'fillRect' && near(a[1], HORIZON * rect.h) && a[2] >= rect.w);
  assert.ok(seaFill && seaFill[1][1] + seaFill[1][3] <= (BEACH.y0 + 0.031) * rect.h);
});

test('the lighthouse is a short red lantern on a squat white base on the fort roof, not a tower', () => {
  const wall = FORT.y1 - FORT.y0 + 0.012; // battlements included
  const whole = FORT.y0 - LANTERN.roof.y0;
  assert.ok(whole / wall > 1.2 && whole / wall < 1.8, `the light is ${(whole / wall).toFixed(2)} walls tall`);
  // the base is wider than it is tall in the jar's own proportions, and the lantern sits on it, narrower
  assert.ok((TOWER.x1 - TOWER.x0) * rect.w > (TOWER.y1 - TOWER.y0) * rect.h);
  assert.ok(LAMP_ROOM.x0 > TOWER.x0 && LAMP_ROOM.x1 < TOWER.x1 && LAMP_ROOM.y0 < TOWER.y0);
  assert.ok(LAMP_ROOM.glass.y0 > LAMP_ROOM.y0 && LAMP_ROOM.glass.y1 < TOWER.y0);
  assert.ok(LANTERN.y > LAMP_ROOM.glass.y0 && LANTERN.y < LAMP_ROOM.glass.y1, 'the lamp burns behind the glass');
  assert.ok(GALLERY.x0 < TOWER.x0 && GALLERY.x1 > TOWER.x1 && GALLERY.x0 > FORT.x0, 'the gallery overhangs the base');
  const day = paint(PHASE.noon);
  assert.ok(day.fills.has(css(NAZARE.lanternRed)) && day.fills.has(css(NAZARE.towerWhite)));
});

test('one sun, and it sets into the sea: the city declines the shared disc and draws its own', () => {
  assert.deepEqual(nazare.sky, { sun: false });
  // up behind the land on the right, down into the open water on the left, at the horizon
  const rise = sunSpot(SUN.rise + 0.01);
  const set = sunSpot(SUN.set);
  assert.ok(rise.x > CLIFF.top.x0 && set.x < CLIFF.foot.x - 0.15 && set.x > STREAK_CLEAR[0][1]);
  assert.ok(Math.abs(set.y - HORIZON) < 1e-6 && sunSpot(0.43).y < 0.2);
  for (let q = SUN.rise + 0.02; q <= SUN.set; q += 0.02) assert.ok(sunSpot(q).x < sunSpot(q - 0.02).x, `it crosses toward the sea at ${q}`);
  // low only in the last stretch before sunset, never in the morning
  assert.equal(sunLow(0.1), 0);
  assert.equal(sunLow(0.4), 0);
  assert.equal(sunLow(0.6), 0);
  assert.ok(sunAltitude(0.71) < 0.42 && sunLow(0.71) > 0.2 && sunLow(0.76) > 0.95);
  assert.equal(sunLow(0.82), 0);
  assert.equal(seaSideLight(0.15), 0);
  assert.equal(seaSideLight(0.7), 1);
});

test('no sun without a reading, in rain or fog, at night, or under a heavy sky', () => {
  const clear = { ...EMPTY, known: true, kind: 'clear', cloudCover: 5 };
  const heavy = { ...EMPTY, known: true, kind: 'cloud', cloudCover: 100 };
  assert.ok(sunShare(clear) > 0.9);
  assert.equal(sunShare(EMPTY), 0);
  assert.equal(sunShare({ ...clear, kind: 'rain' }), 0);
  assert.equal(sunShare({ ...clear, kind: 'fog' }), 0);
  assert.ok(SUN_GLOOM <= 0.5);
  assert.equal(sunShare(heavy), 0);
  assert.ok(sunShare({ ...heavy, cloudCover: 40 }) > 0.3);
  assert.equal(sunStrength(PHASE.night, clear), 0);
  assert.ok(sunStrength(0.74, clear) > 0.4);
  const arcs = (phase, weather) => {
    const ctx = recordingCtx();
    const out = drawSun(ctx, rect, phase, tint(sample(phase)), weather);
    return [out > 0, ctx.calls.filter(([k]) => k === 'arc').length];
  };
  assert.deepEqual(arcs(PHASE.noon, clear), [true, 1]);
  assert.deepEqual(arcs(0.74, clear), [true, 2], 'the low sun reddens');
  assert.deepEqual(arcs(PHASE.noon, heavy), [false, 0]);
  assert.deepEqual(arcs(PHASE.noon, EMPTY), [false, 0]);
  assert.equal(paint(PHASE.noon, clear).out.sun, true);
  assert.equal(paint(PHASE.noon, heavy).out.sun, false);
  assert.equal(paint(PHASE.night, clear).out.sun, false);
});

test('the sun is the backdrop: the jar paints it with the sky, before the clouds, and paint draws no disc of its own', () => {
  const clear = { ...EMPTY, known: true, kind: 'clear', cloudCover: 5 };
  assert.equal(typeof nazare.backdrop, 'function');
  const ctx = recordingCtx();
  nazare.backdrop(ctx, rect, PHASE.noon, tint(sample(PHASE.noon)), clear);
  assert.equal(ctx.calls.filter(([k]) => k === 'arc').length, 1);
  const spot = sunSpot(PHASE.noon);
  const discs = paint(PHASE.noon, clear).calls.filter(([k, a]) => k === 'arc' && Math.abs(a[0] - spot.x * rect.w) < 1 && Math.abs(a[1] - spot.y * rect.h) < 1);
  assert.equal(discs.length, 0);
});

test('the low sun lays a warm path on the water and shines green-gold through the wave; a heavy sky lays none', () => {
  const clear = { ...EMPTY, known: true, kind: 'clear', cloudCover: 5, sea: { waveHeight: 5, wavePeriod: 12, waveDir: null } };
  const gold = (ctx) => [...ctx.fills].some((f) => f.startsWith('rgba(255, 1') || f.startsWith('rgba(255, 2'));
  const path = (phase, weather) => {
    const ctx = paint(phase, weather, 9000);
    return ctx.calls.filter(([k, a]) => k === 'ellipse' && Math.abs(a[0] - sunSpot(phase).x * rect.w) < 0.08 * rect.w && a[1] > HORIZON * rect.h && a[1] < 0.7 * rect.h).length;
  };
  assert.ok(path(0.75, clear) >= 15, 'a path under the setting sun');
  assert.equal(path(PHASE.noon, clear), 0);
  assert.equal(path(0.75, { ...clear, kind: 'cloud', cloudCover: 100 }), 0);
  assert.ok(gold(paint(0.75, clear, 9000)));
  // the sea itself: warmer toward the horizon at sunset, grey-green under a heavy sky
  const m = { night: 0, kind: 'clear', cloud: 0, wet: false, storm: false, fog: false, snow: false };
  const tn = tint(sample(PHASE.noon));
  const plain = seaTones(m, tn, { grey: 0, low: 0 });
  const warm = seaTones(m, tn, { grey: 0, low: 1 });
  const grey = seaTones(m, tn, { grey: 0.7, low: 0 });
  const spread = (c) => Math.max(...c) - Math.min(...c);
  assert.ok(warm.stops[1][1][0] > plain.stops[1][1][0] + 20, 'redder at sunset');
  assert.ok(spread(grey.col) < spread(plain.col) - 15, 'drained under a heavy sky');
  assert.deepEqual(plain.at(HORIZON), plain.stops[0][1]);
  assert.deepEqual(plain.at(BEACH.y0), plain.stops[plain.stops.length - 1][1]);
});

test('a giant towers to about the foot of the fort, a calm sea stays small, and only big water curls', () => {
  const L = layout(340, 396);
  const top = (metres) => {
    let best = 1;
    const weather = { ...EMPTY, sea: { waveHeight: metres, wavePeriod: 12, waveDir: null } };
    for (let t = 0; t < 18000; t += 100) for (const s of waveStates(L, weather, t, false)) best = Math.min(best, s.crest(WAVE.rock) / L.h);
    return best;
  };
  assert.ok(top(10) > CLIFF.top.y && top(10) < CLIFF.top.y + 0.03, `10 m crest at ${top(10)}`);
  assert.ok(top(9) < CLIFF.top.y + 0.06, `9 m crest at ${top(9)}`);
  assert.ok(top(4.5) > CLIFF.top.y + 0.12, 'a big day is clearly lower than a giant one');
  assert.ok(top(0.5) > WAVE.formY - 0.04, 'a calm sea barely stands');
  assert.equal(curlAmount(waveSize(0.5)), 0);
  assert.ok(curlAmount(waveSize(2)) < 0.25);
  assert.ok(curlAmount(waveSize(4.5)) > 0.8);
  assert.equal(curlAmount(waveSize(9)), 1);
});

test('behind the break the wall has fallen into its foam; ahead of it it still stands', () => {
  const L = layout(340, 396);
  const weather = { ...EMPTY, sea: { waveHeight: 8, wavePeriod: 12, waveDir: null } };
  const s = waveState(L, weather, 0.6 * 18000, false);
  assert.ok(s.brk < WAVE.rock && s.brk > WAVE.x0);
  assert.equal(s.body(s.brk - 0.05), s.height(s.brk - 0.05));
  assert.ok(Math.abs(s.body(s.brk + 0.12) - (1 - COLLAPSE) * s.height(s.brk + 0.12)) < 1e-9);
  for (let xs = s.brk; xs < WAVE.x1; xs += 0.01) assert.ok(s.body(xs + 0.01) / s.height(xs + 0.01) <= s.body(xs) / s.height(xs) + 1e-9);
});

test('the plume a giant throws up the rock never climbs past the light', () => {
  const L = layout(340, 396);
  for (const metres of [2, 5, 10, 14]) {
    const weather = { ...EMPTY, sea: { waveHeight: metres, wavePeriod: 12, waveDir: null } };
    for (let t = 0; t < 18000; t += 150) {
      for (const s of waveStates(L, weather, t, false)) {
        const rise = sprayRise(s, L);
        const h = s.height(WAVE.rock);
        assert.ok(rise >= 0.5 * h - 1e-9 && rise <= 1.8 * h + 1e-9);
        if (rise > 0.5 * h + 1e-9) assert.ok(s.crest(WAVE.rock) + 0.3 * h - rise >= L.Y(SPRAY_TOP) - 1e-6, `${metres} m at ${t}`);
      }
    }
  }
  assert.ok(SPRAY_TOP >= LANTERN.roof.y0);
});


test('the wave spans the bay: from past the left edge to behind the rock, never ending in open water', () => {
  assert.ok(WAVE.x0 < 0, 'it starts past the jar wall');
  assert.ok(WAVE.x1 > CLIFF.top.x0, 'its right end is hidden behind the rock at every height');
  assert.ok(WAVE.rock > CLIFF.foot.x && WAVE.rock < CLIFF.top.x0);
});

test('the wave is painted before the headland, so its water runs on behind the rock', () => {
  const { calls } = paint(PHASE.noon, EMPTY, 5000);
  const near = (v, w) => Math.abs(v - w) < 1e-6;
  // the wave's water closes at its right limit; the cliff face starts at its foot
  const waveAt = calls.findIndex(([k, a]) => k === 'lineTo' && near(a[0], WAVE.x1 * rect.w));
  const cliffAt = calls.findIndex(([k, a]) => k === 'moveTo' && near(a[0], CLIFF.foot.x * rect.w) && near(a[1], CLIFF.foot.y * rect.h));
  assert.ok(waveAt >= 0 && cliffAt >= 0 && waveAt < cliffAt, `wave at ${waveAt}, cliff at ${cliffAt}`);
});

test('it comes toward the beach: its foot moves down the jar and it grows, then spends itself', () => {
  for (let p = 0.05; p < 1; p += 0.05) assert.ok(baseAt(p) >= baseAt(p - 0.05), `foot at ${p}`);
  assert.ok(baseAt(0) < baseAt(0.5) && baseAt(0.5) < baseAt(0.99));
  assert.ok(standAt(0.6) > standAt(0.1) && standAt(0.6) > standAt(0.99));
  assert.ok(standAt(0) < 0.01 && standAt(0.999) < 0.01, 'a roll starts and ends flat, so nothing jumps');
});

test('the wave behind stays smaller while the one ahead breaks, then grows into its own break', () => {
  // while a wave breaks and is still standing, the one half a roll behind is at most half its size
  for (let p = WAVE.peelFrom; p <= WAVE.spendFrom + 1e-9; p += 0.01) {
    const behind = standAt(p - WAVE.lag < 0 ? p - WAVE.lag + 1 : p - WAVE.lag);
    assert.ok(behind <= 0.5 * standAt(p), `at ${p.toFixed(2)}: behind ${behind.toFixed(2)} vs breaking ${standAt(p).toFixed(2)}`);
  }
  // and it grows steadily up to its own break, where it is at full height
  for (let p = 0.02; p <= WAVE.fullAt + 1e-9; p += 0.02) assert.ok(standAt(p) > standAt(p - 0.02), `grows at ${p.toFixed(2)}`);
  assert.ok(standAt(WAVE.peelFrom) > 0.8 && standAt(WAVE.fullAt) > 0.99);
});

test('it is tallest at the rock and lowest at the left', () => {
  assert.ok(reachAt(WAVE.rock) > reachAt(0.3) && reachAt(0.3) > reachAt(0.02));
  assert.ok(Math.abs(reachAt(WAVE.x0) - WAVE.lowShare) < 1e-9);
});

test('it breaks at the rock first and the break runs left, away from the lighthouse', () => {
  assert.equal(breakAt(0.2), WAVE.x1, 'unbroken before it stands up');
  assert.ok(Math.abs(breakAt(WAVE.peelFrom) - WAVE.rock) < 1e-9);
  for (let p = WAVE.peelFrom + 0.02; p <= 1; p += 0.02) assert.ok(breakAt(p) <= breakAt(p - 0.02) + 1e-12, `break at ${p}`);
  assert.ok(breakAt(WAVE.peelTo) <= WAVE.x0 + 1e-9);
});

test('two waves are on the water, half a roll apart, the farther drawn first', () => {
  const L = layout(340, 396);
  const [a, b] = waveStates(L, EMPTY, 5000, false);
  assert.ok(Math.abs(Math.abs(b.p - a.p) - WAVE.lag) < 1e-9);
  assert.ok(a.p < b.p && a.baseTop <= b.baseTop);
});

test('the riders ride just ahead of the break and run left with it', () => {
  const L = layout(340, 396);
  const weather = { ...EMPTY, sea: { waveHeight: 4, wavePeriod: 12, waveDir: null } };
  const roll = 18000; // a 12 s swell, stretched 1.5x
  const plan = surferPlan('big', 1);
  for (const t0 of [0, 5 * roll]) {
    const a = waveState(L, weather, t0 + 0.5 * roll, false);
    const b = waveState(L, weather, t0 + 0.7 * roll, false);
    const ra = surferSpots(L, weather, a, plan, t0 + 0.5 * roll).filter((s) => s.kind === 'rider');
    const rb = surferSpots(L, weather, b, plan, t0 + 0.7 * roll).filter((s) => s.kind === 'rider');
    ra.forEach((s, i) => {
      assert.ok(s.xs < a.brk && rb[i].xs < b.brk, `rider ${i} is ahead of the break`);
      assert.ok(rb[i].xs < s.xs, `rider ${i} moves left`);
      assert.ok(s.fade > 0.9, `rider ${i} is out while the wave breaks`);
    });
  }
});

test('painting never touches Math.random: noon, dusk and night, clear, rain, fog and snow', () => {
  for (const phase of Object.values(PHASE)) {
    for (const kind of ['clear', 'rain', 'fog', 'snow']) {
      assert.doesNotThrow(() => paint(phase, { ...EMPTY, kind, known: true, cloudCover: 30, windSpeed: 20, windDir: 270 }, 12345));
    }
  }
});

const T_FULL = Date.UTC(2026, 5, 29, 23, 30);
const T_DARK_MOON = Date.UTC(2026, 5, 15, 23, 30);
const CLEAR = { ...EMPTY, known: true, kind: 'clear', cloudCover: 5 };

test('the moon track is on the water at a full moon and gone at a new moon', () => {
  const key = css(NAZARE.moonStreak, 0).slice(0, 18);
  const has = (ms) => [...paint(PHASE.night, CLEAR, ms).fills].some((f) => f.startsWith(key));
  assert.ok(has(T_FULL), 'no track at full moon');
  assert.ok(!has(T_DARK_MOON), 'track at new moon');
});

test('painting a full-moon night never touches Math.random', () => {
  assert.doesNotThrow(() => paint(PHASE.night, CLEAR, T_FULL));
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
  // the morning sun is on the land side (the right), the evening one over the sea
  assert.equal(sunSide(0.1), 1);
  assert.equal(sunSide(0.6), -1);
});

test('buildPlates is deterministic', () => {
  assert.deepEqual(buildPlates(340, 396), buildPlates(340, 396));
  assert.equal(buildPlates(340, 396).windows.length, 3);
});

test('every surfer stays on the water: riders on the face, at 8 m and 12 m', () => {
  const L = layout(340, 396);
  for (const metres of [3, 8, 12]) {
    const weather = { ...EMPTY, sea: { waveHeight: metres, wavePeriod: null, waveDir: null } };
    const plan = surferPlan(metres > 6 ? 'giant' : 'big', 1);
    for (let t = 0; t < 120000; t += 250) {
      const states = waveStates(L, weather, t, false);
      const state = states[1];
      for (const s of surferSpots(L, weather, state, plan, t, states)) {
        if (s.kind === 'paddler' || s.fade <= 0) continue;
        assert.ok(s.y <= L.Y(state.baseTop) + 1e-9, `${metres} m at ${t} ms: below the wave's foot`);
        assert.ok(s.y >= state.crest(s.xs) - 1e-9, `${metres} m at ${t} ms: above the crest`);
      }
    }
  }
});

test('the beam turns about the upright tower: it sweeps level, left and right, never up or down', () => {
  const L = layout(340, 396);
  const lx = L.X(LANTERN.x);
  const ly = L.Y(LANTERN.y);
  const len = BEAM.reach * L.w;
  let left = false;
  let right = false;
  let flash = 0;
  for (let t = 0; t < BEAM.periodMs; t += BEAM.periodMs / 120) {
    const lobes = beamLobes(L, t);
    assert.equal(lobes.length, BEAM.group.length);
    for (const b of lobes) {
      const dx = b.tip.x - lx;
      const dy = b.tip.y - ly;
      assert.ok(Math.abs(dx) <= len + 1e-6);
      // level, dipping a hair toward the sea: never steeper than a few degrees, never up
      assert.ok(dy >= 0 && dy <= 0.05 * len, `t ${t}: dy ${dy}`);
      if (dx < -0.9 * len) left = true;
      if (dx > 0.9 * len) right = true;
      flash = Math.max(flash, b.flash);
    }
  }
  assert.ok(left && right, 'it reaches across both sides');
  assert.ok(flash > 0.95, 'it flashes as a lobe faces us');
});

test('the light keeps a rhythm: a group of three quick flashes, then a long dark, each turn', () => {
  const L = layout(340, 396);
  const n = 3000;
  const lit = [];
  for (let i = 0; i < n; i++) lit.push(Math.max(...beamLobes(L, (i / n) * BEAM.periodMs).map((b) => b.flash)) > 0.5);
  // count rising edges around the turn
  let flashes = 0;
  for (let i = 0; i < n; i++) if (lit[i] && !lit[(i - 1 + n) % n]) flashes += 1;
  assert.equal(flashes, 3);
  // the dark between groups is far longer than the group itself
  const on = lit.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const groupSpan = on[on.length - 1] - on[0];
  assert.ok(groupSpan < n / 4, `group spans ${groupSpan} of ${n}`);
});

test('the beam lights the foam only while it points into the bay and reaches it', () => {
  const L = layout(340, 396);
  const foamX = L.X(0.4);
  let some = false;
  for (let t = 0; t < BEAM.periodMs; t += BEAM.periodMs / 300) {
    const lobes = beamLobes(L, t);
    const v = foamLight(lobes, foamX);
    const anyLeft = lobes.some((b) => b.tip.x < foamX && b.across < -0.75);
    if (!anyLeft) assert.equal(v, 0, `t ${t}`);
    if (v > 0.9) some = true;
  }
  assert.ok(some, 'some beam lights it fully during a turn');
});

test('no gap between the wave and the cliff: the wave always runs on behind the rough rock', () => {
  const plates = buildPlates(340, 396);
  // every height the rock covers, its face stands short of the wave's far end
  for (let y = CLIFF.top.y; y <= CLIFF.bottom; y += 0.002) {
    assert.ok(cliffFaceX(y, plates) < WAVE.x1 - 0.03, `y ${y}: face ${cliffFaceX(y, plates)}`);
    assert.ok(Math.abs(cliffFaceX(y, plates) - cliffFaceX(y)) <= ROUGH + 1e-9);
  }
  // the rough face keeps its ends exactly where the smooth one has them
  assert.equal(plates.face[0].x, CLIFF.foot.x);
  assert.equal(plates.face[0].y, CLIFF.foot.y);
  // and nothing of a 10 m wave, crest or foam, shows over the rock: wherever it
  // is right of the face, it stays below the cliff top
  const L = layout(340, 396);
  const weather = { ...EMPTY, sea: { waveHeight: 10, wavePeriod: 12, waveDir: null } };
  for (let t = 0; t < 18000; t += 120) {
    for (const s of waveStates(L, weather, t, false)) {
      for (let xs = WAVE.rock; xs <= WAVE.x1 + 1e-9; xs += 0.005) {
        const top = waveTopAt(L, s, xs) / L.h;
        if (xs > cliffFaceX(Math.max(top, CLIFF.top.y), plates)) assert.ok(top > CLIFF.top.y, `t ${t}, x ${xs}: top ${top}`);
      }
    }
  }
});

test('the spray against the rock starts with the break and is gone before the next wave', () => {
  assert.equal(hitAt(0), 0);
  assert.equal(hitAt(WAVE.peelFrom - 0.01), 0);
  assert.ok(hitAt(WAVE.peelFrom + 0.15) > 0.9);
  assert.equal(hitAt(0.99), 0);
});

test('fog lights the lamp by day; a storm or a gale roughens the sea, a breeze does not', () => {
  assert.equal(lampOn({ night: 0, fog: false }), 0);
  assert.ok(lampOn({ night: 0, fog: true }) > 0.5);
  assert.equal(lampOn({ night: 1, fog: false }), 1);
  assert.equal(roughness(null), 0);
  assert.equal(roughness({ ...EMPTY, kind: 'clear', windSpeed: 12 }), 0);
  assert.equal(roughness({ ...EMPTY, kind: 'storm', windSpeed: 5 }), 1);
  assert.ok(roughness({ ...EMPTY, kind: 'cloud', windSpeed: 50 }) > 0.5);
});

test('fog veils the whole scene; a clear day does not', () => {
  const full = (ctx) => ctx.calls.some(([k, a]) => k === 'fillRect' && a[0] === 0 && a[1] === 0 && a[2] === rect.w && a[3] === rect.h);
  assert.ok(full(paint(PHASE.noon, { ...EMPTY, kind: 'fog', code: 45 }, 5000)));
  assert.ok(!full(paint(PHASE.noon, { ...EMPTY, kind: 'clear', code: 0 }, 5000)));
});

test('bathers come down on a fine day only', () => {
  const warm = { ...EMPTY, known: true, kind: 'clear', code: 0, cloudCover: 0, temperature: 24 };
  const fine = paint(PHASE.noon, warm, 5000);
  const wet = paint(PHASE.noon, { ...warm, kind: 'rain', code: 61, cloudCover: 100 }, 5000);
  const night = paint(PHASE.night, warm, 5000);
  const cold = paint(PHASE.noon, { ...warm, temperature: 12 }, 5000);
  const swell = paint(PHASE.noon, { ...warm, sea: { waveHeight: 9, wavePeriod: 14, waveDir: null } }, 5000);
  const has = (ctx) => [...ctx.fills].some((f) => f.startsWith(`rgba(${NAZARE.umbrellas[0].join(', ')}, `));
  const flag = (ctx) => [...ctx.fills].some((f) => f.startsWith(`rgba(${NAZARE.flagRed.join(', ')}, `));
  assert.ok(has(fine) && fine.out.umbrellas && !fine.out.flag && !flag(fine), 'umbrellas on a fine warm noon, no flag');
  assert.ok(!has(wet) && !wet.out.umbrellas, 'none in the rain');
  assert.ok(!has(night), 'none at night');
  assert.ok(!has(cold), 'none on a cold day');
  assert.ok(!has(swell) && swell.out.flag && flag(swell), 'a 9 m swell: no umbrellas, the red flag is up');
});

test('at night the beam paints no wedge that climbs above the lantern', () => {
  const { calls } = paint(PHASE.night, EMPTY, 1234);
  const ly = LANTERN.y * rect.h;
  const lx = LANTERN.x * rect.w;
  const from = calls.findIndex(([k, a]) => k === 'moveTo' && Math.abs(a[0] - lx) < 1e-6 && Math.abs(a[1] - ly) < 1e-6);
  assert.ok(from >= 0, 'a beam wedge starts at the lantern');
  const [, [, y1]] = calls[from + 1];
  const [, [, y2]] = calls[from + 2];
  const len = BEAM.reach * rect.w;
  // the wedge's far edge spans the beam's own height around a level line
  assert.ok(Math.max(Math.abs(y1 - ly), Math.abs(y2 - ly)) < 0.3 * len, `${y1}, ${y2}`);
});

test('waveStates hands back the same answer for the same moment, a fresh one for the next', () => {
  const a = waveStates(layout(340, 440, 10, 20), EMPTY, 5000, false);
  const b = waveStates(layout(340, 440, 10, 20), EMPTY, 5000, false);
  assert.equal(a, b);
  const c = waveStates(layout(340, 440, 10, 20), EMPTY, 5100, false);
  assert.notEqual(a, c);
  assert.notEqual(waveStates(layout(300, 440, 10, 20), EMPTY, 5100, false), c);
});

test('water(rect): open sea inside the rect, below the horizon, left of the headland, above the beach', () => {
  const rect = { x: 12, y: 30, w: 200, h: 260 };
  const r = nazare.water(rect);
  assert.ok(r.w > 0 && r.h > 0);
  assert.ok(r.x >= rect.x && r.y >= rect.y && r.x + r.w <= rect.x + rect.w && r.y + r.h <= rect.y + rect.h);
  assert.ok(r.y > rect.y + HORIZON * rect.h);
  assert.ok(r.x + r.w < rect.x + CLIFF.foot.x * rect.w);
  assert.ok(r.y + r.h < rect.y + BEACH.y0 * rect.h);
});

test('fishing boats work the horizon at night: none by day, in a storm or under a giant swell', () => {
  const clear = { ...EMPTY, known: true, kind: 'clear', cloudCover: 5 };
  const withSea = (h, more = {}) => ({ ...clear, sea: { waveHeight: h, wavePeriod: 12, waveDir: null }, ...more });
  assert.equal(paint(PHASE.night, clear, 5000).out.boats, 3);
  assert.equal(paint(PHASE.night, withSea(4.5), 5000).out.boats, 2);
  assert.equal(paint(PHASE.night, withSea(9), 5000).out.boats, 0);
  assert.equal(paint(PHASE.night, withSea(2, { kind: 'storm' }), 5000).out.boats, 0);
  assert.equal(paint(PHASE.noon, clear, 5000).out.boats, 0);
  const lit = (ctx) => [...ctx.fills].some((f) => f.startsWith(`rgba(${NAZARE.boatLight.join(', ')}, `));
  assert.ok(lit(paint(PHASE.night, clear, 5000)) && !lit(paint(PHASE.noon, clear, 5000)));
});

test('the beam shows in fog and rain as light hanging along it, and not on a clear night', () => {
  const glows = (phase, kind) => {
    let n = 0;
    const ctx = new Proxy({ createRadialGradient: () => { n += 1; return { addColorStop() {} }; }, createLinearGradient: () => ({ addColorStop() {} }) }, {
      get: (t, k) => (k in t ? t[k] : () => {}),
      set: (t, k, v) => { t[k] = v; return true; },
    });
    drawBeamHaze(ctx, rect, phase, tint(sample(phase)), { ...EMPTY, kind }, 2000);
    return n;
  };
  assert.ok(glows(PHASE.night, 'fog') >= 3);
  assert.ok(glows(PHASE.night, 'rain') >= 3);
  assert.equal(glows(PHASE.night, 'clear'), 0);
  assert.equal(glows(PHASE.noon, 'fog'), 0);
});

test('the rock is built once: strata of more than one colour from above the top to below the foot, a ridge inside the rock, cracks, scrub', () => {
  const p = buildPlates(340, 396);
  assert.ok(p.strata.length >= 7 && p.strata[0].y < CLIFF.top.y && p.strata[p.strata.length - 1].y > CLIFF.foot.y);
  for (let i = 1; i < p.strata.length; i++) {
    assert.ok(p.strata[i].y > p.strata[i - 1].y);
    assert.notEqual(p.strata[i].tone, p.strata[i - 1].tone, 'two neighbours share a colour');
  }
  assert.ok(new Set(p.strata.map((s) => s.tone)).size >= 4);
  assert.ok(Math.max(...p.strata.map((s) => s.tone)) < NAZARE.strata.length);
  for (const r of p.ridge) assert.ok(r.x > cliffFaceX(Math.min(r.y, CLIFF.foot.y), p) + 0.03 && r.x < FORT.x1, `ridge at ${r.x}, ${r.y}`);
  assert.equal(p.crevices.length, 4);
  assert.ok(p.tufts.length >= 6 && p.boulders.length > 4);
  for (const c of p.crevices.flat()) assert.ok(c.x > cliffFaceX(c.y, p) && c.y > CLIFF.top.y && c.y < CLIFF.bottom);
  // the two faces are lit by the hour: the strata show by day in every colour
  const day = paint(PHASE.noon);
  for (const t of new Set(p.strata.map((s) => s.tone))) assert.ok(day.fills.has(css(NAZARE.strata[t])), `stratum ${t}`);
});
