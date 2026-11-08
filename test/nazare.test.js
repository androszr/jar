import { test } from 'node:test';
import assert from 'node:assert/strict';
import nazare from '../src/cities/nazare/index.js';
import {
  HORIZON, CLIFF, FORT, TOWER, LANTERN, WAVE, BEACH, STREAK_CLEAR, buildPlates, nightAmount, sunSide, layout, waveState, waveStates, surferSpots, baseAt, standAt, reachAt, breakAt, BEAM, beamLobes, cliffFaceX, ROUGH, waveTopAt, foamLight, lampOn, roughness, hitAt,
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

test('the wave forms below the horizon and lands above the beach, which ends at the plate', () => {
  assert.ok(WAVE.formY > HORIZON && WAVE.breakY > WAVE.formY);
  assert.ok(WAVE.breakY < BEACH.y0);
  assert.ok(BEACH.y0 < BEACH.y1 && BEACH.y1 <= plateShare + 1e-9);
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
  const roll = 12000;
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
  for (let t = 0; t < 12000; t += 120) {
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
  const fine = paint(PHASE.noon, { ...EMPTY, kind: 'clear', code: 0, cloudCover: 0 }, 5000);
  const wet = paint(PHASE.noon, { ...EMPTY, kind: 'rain', code: 61, cloudCover: 100 }, 5000);
  const night = paint(PHASE.night, { ...EMPTY, kind: 'clear', code: 0, cloudCover: 0 }, 5000);
  const has = (ctx) => [...ctx.fills].some((f) => f.startsWith(`rgba(${NAZARE.umbrellas[0].join(', ')}, `));
  assert.ok(has(fine), 'umbrellas on a fine noon');
  assert.ok(!has(wet), 'none in the rain');
  assert.ok(!has(night), 'none at night');
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
