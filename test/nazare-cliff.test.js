import { test } from 'node:test';
import assert from 'node:assert/strict';
import nazare from '../src/cities/nazare/index.js';
import { CLIFF, FORT, TOWER, WAVE, STREAK_CLEAR, buildPlates, layout, cliffFaceX, waveStates } from '../src/cities/nazare/scene.js';
import {
  CROWD, MERLON, SPECTATOR_SPOTS, spectatorCount, cheerAmount, GULLS, gullSpots, wetAt, rockWet, PATH, PATH_LAMPS, DOOR, BOARDS, RESCUE, rescueSpot,
  PATH_HIDDEN, pathPieces, pathGaps, RUNNELS, runnelAt, fallAt, runnels,
} from '../src/cities/nazare/cliff.js';
import { NAZARE } from '../src/cities/nazare/palette.js';
import { EMPTY } from '../src/weather.js';
import { tint } from '../src/look/index.js';
import { sample } from '../src/clock.js';
import { LABEL } from '../src/jar-geometry.js';
import { bodyRect } from '../src/jar.js';

const rect = { x: 0, y: 0, w: 340, h: 396 };
const PHASE = { noon: 0.4, dusk: 0.84, night: 0.92 };
const plateShare = (LABEL.y - bodyRect().y) / 396;
const L = layout(340, 396);
const plates = buildPlates(340, 396);
const sea = (h, more = {}) => ({ ...EMPTY, sea: { waveHeight: h, wavePeriod: 12, waveDir: 300 }, ...more });
const lightAt = (phase) => tint(sample(phase)).light;
const rgbaOf = (c) => `rgba(${c.join(', ')},`;

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

function paint(phase, weather = EMPTY, nowMs = 0) {
  const ctx = recordingCtx();
  const real = Math.random;
  Math.random = () => { throw new Error('Math.random in a draw function'); };
  try {
    const out = nazare.paint(ctx, rect, phase, tint(sample(phase)), weather, plates, nowMs);
    return Object.assign(ctx, { out });
  } finally {
    Math.random = real;
  }
}
const has = (set, colour) => [...set].some((s) => s.startsWith(rgbaOf(colour)));

test('the crowd grows with the swell, goes home at night and halves in bad weather', () => {
  const noon = lightAt(PHASE.noon);
  assert.deepEqual(['calm', 'moderate', 'big', 'giant'].map((b) => spectatorCount(b, noon)), [0, 3, 7, 12]);
  assert.ok(CROWD.giant <= SPECTATOR_SPOTS.length);
  assert.equal(spectatorCount('giant', lightAt(PHASE.night)), 0);
  assert.equal(spectatorCount('giant', noon, 'storm'), 6);
  assert.equal(spectatorCount('giant', null), 0);
});

test('spectators stand on the fort roof, in the gaps of the battlements, clear of the tower', () => {
  assert.equal(new Set(SPECTATOR_SPOTS).size, SPECTATOR_SPOTS.length);
  for (const x of SPECTATOR_SPOTS) {
    assert.ok(x > FORT.x0 && x < FORT.x1, `spot ${x} off the fort`);
    assert.ok(x < TOWER.x0 || x > TOWER.x1, `spot ${x} inside the tower`);
    const along = (x - FORT.x0) % MERLON.step;
    assert.ok(along > MERLON.w, `spot ${x} behind a merlon`);
  }
});

test('paint reports the crowd, the gulls and the safety ski, by band and by hour', () => {
  assert.deepEqual([paint(PHASE.noon).out.spectators, paint(PHASE.noon).out.gulls, paint(PHASE.noon).out.rescue], [3, 3, false]);
  const giant = paint(PHASE.noon, sea(8)).out;
  assert.deepEqual([giant.spectators, giant.gulls], [12, 3]);
  const calm = paint(PHASE.noon, sea(0.5)).out;
  assert.deepEqual([calm.spectators, calm.rescue], [0, false]);
  const night = paint(PHASE.night, sea(8)).out;
  assert.deepEqual([night.spectators, night.gulls, night.rescue], [0, 0, false]);
  assert.equal(paint(PHASE.noon, sea(8, { kind: 'storm' })).out.gulls, 0);
  assert.equal(paint(PHASE.noon, sea(8, { kind: 'fog' })).out.gulls, 0);
});

test('the crowd cheers a big wave hitting the rock and never a small one', () => {
  const peak = (h) => {
    let best = 0;
    for (let t = 0; t < 18000; t += 250) best = Math.max(best, cheerAmount(waveStates(L, sea(h), t, false)));
    return best;
  };
  assert.ok(peak(8) > 0.5, `giant peak ${peak(8)}`);
  assert.equal(peak(2), 0);
});

test('gulls stay in the sky left of the lighthouse, are a pure function of the clock, and slow under reduced motion', () => {
  const noon = lightAt(PHASE.noon);
  for (let t = 0; t < 30000; t += 700) {
    for (const wind of [null, 60]) {
      for (const g of gullSpots(L, t, { ...EMPTY, windSpeed: wind, windDir: 270 }, noon)) {
        assert.ok(g.y < L.Y(CLIFF.top.y) && g.y > 0, `gull at y ${g.y}`);
        assert.ok(g.x > L.X(STREAK_CLEAR[0][1]) && g.x < L.X(TOWER.x0), `gull at x ${g.x}`);
      }
    }
  }
  assert.deepEqual(gullSpots(L, 4321, EMPTY, noon), gullSpots(L, 4321, EMPTY, noon));
  assert.notDeepEqual(gullSpots(L, 4321, EMPTY, noon), gullSpots(L, 5321, EMPTY, noon));
  assert.notDeepEqual(gullSpots(L, 4321, EMPTY, noon), gullSpots(L, 4321, EMPTY, noon, true));
  assert.equal(gullSpots(L, 0, EMPTY, noon).length, GULLS.length);
});

test('the rock is wet after a wave hits it, dries before the next, and a calm sea never wets it', () => {
  assert.equal(wetAt(WAVE.peelFrom - 0.01), 0);
  assert.ok(wetAt(0.6) > 0.95);
  assert.equal(wetAt(0.95), 0);
  const peak = (h) => {
    let best = { amount: 0, reach: 0 };
    for (let t = 0; t < 18000; t += 250) {
      const w = rockWet(waveStates(L, sea(h), t, false));
      if (w.amount > best.amount) best = w;
    }
    return best;
  };
  assert.equal(peak(0.5).amount, 0);
  assert.ok(peak(8).amount > peak(2).amount && peak(2).amount > 0);
  assert.ok(peak(8).reach > peak(2).reach && peak(8).reach <= 0.32);
  // the sheen is drawn only while it is wet
  const wetMoment = Array.from({ length: 72 }, (_, i) => i * 250).find((t) => rockWet(waveStates(L, sea(8), t, false)).amount > 0.8);
  assert.ok(has(paint(PHASE.noon, sea(8), wetMoment).strokes, NAZARE.rockSheen));
  assert.ok(!has(paint(PHASE.noon, sea(0.5), wetMoment).strokes, NAZARE.rockSheen));
});

test('the path runs downhill inside the rock from the fort to the beach, above the label plate, clear of the streak', () => {
  assert.equal(PATH[0][1], CLIFF.top.y);
  assert.ok(PATH[0][0] > FORT.x0 && PATH[0][0] < FORT.x1);
  for (let i = 1; i < PATH.length; i++) assert.ok(PATH[i][1] > PATH[i - 1][1], 'the path climbs');
  for (const [x, y] of PATH) {
    assert.ok(x > cliffFaceX(y, plates) + 0.02, `corner ${x},${y} off the rock`);
    assert.ok(x < STREAK_CLEAR[1][0], `corner ${x} under the streak`);
    assert.ok(y < plateShare && y <= CLIFF.bottom);
  }
  assert.equal(PATH_LAMPS.length, 4);
});

test('lamps on the path and the fort door light at night only; scrub is green by day and white in snow', () => {
  const noon = paint(PHASE.noon);
  const night = paint(PHASE.night);
  assert.ok(!has(noon.fills, NAZARE.pathLamp) && has(night.fills, NAZARE.pathLamp));
  const lamps = night.calls.filter(([m, , style]) => m === 'fillRect' && typeof style === 'string' && style.startsWith(rgbaOf(NAZARE.pathLamp)));
  assert.equal(lamps.length, PATH_LAMPS.length);
  assert.ok(has(night.fills, NAZARE.fortDoor) && !has(noon.fills, NAZARE.fortDoor));
  assert.ok(has(noon.strokes, NAZARE.scrubDay));
  const snow = paint(PHASE.noon, { ...EMPTY, kind: 'snow' });
  assert.ok(!has(snow.strokes, NAZARE.scrubDay) && has(snow.strokes, NAZARE.snowCap));
});

test('the door is under the lighthouse and the boards lean on the fort wall beside it, each its own colour', () => {
  assert.ok(DOOR.x0 >= TOWER.x0 && DOOR.x1 <= TOWER.x1 && DOOR.y0 > FORT.y0 && DOOR.y1 === FORT.y1);
  assert.equal(BOARDS.length, NAZARE.boards.length);
  for (const b of BOARDS) {
    assert.ok(b.x > DOOR.x1 && b.x < FORT.x1 - 0.02);
    assert.ok(b.len <= FORT.y1 - FORT.y0, 'a board is taller than the wall');
  }
  const noon = paint(PHASE.noon);
  for (const c of NAZARE.boards) assert.ok(has(noon.fills, c));
  const night = paint(PHASE.night);
  for (const c of NAZARE.boards) assert.ok(!has(night.fills, c), 'a board keeps its day colour at night');
});

test('the safety ski waits outside the break on big and giant days, by daylight, on the water', () => {
  assert.ok(RESCUE.y > 0.5 && RESCUE.y < WAVE.breakY && RESCUE.x < WAVE.rock - 0.1 && RESCUE.x > STREAK_CLEAR[0][1]);
  const noon = lightAt(PHASE.noon);
  const at = (h, light, t = 0) => rescueSpot(L, sea(h), waveStates(L, sea(h), t, false), t, light);
  assert.equal(at(2, noon), null);
  assert.equal(at(0.5, noon), null);
  assert.equal(at(8, lightAt(PHASE.night)), null);
  for (const h of [4.2, 8]) {
    const seen = Array.from({ length: 72 }, (_, i) => at(h, noon, i * 250));
    assert.ok(seen.every((r) => r && r.alpha >= 0 && r.alpha <= 1));
    assert.ok(seen.some((r) => r.alpha === 1), 'never in view');
    assert.ok(Array.from({ length: 72 }, (_, i) => paint(PHASE.noon, sea(h), i * 250).out.rescue).some(Boolean));
  }
});

test('every detail paints with no weather at all, at noon, dusk and night', () => {
  for (const ph of Object.values(PHASE)) {
    for (const t of [0, 7000, 13000]) assert.doesNotThrow(() => paint(ph, EMPTY, t));
  }
});

test('the path shows in pieces: every leg is partly hidden behind the rock, and scrub grows over each gap', () => {
  const pieces = pathPieces();
  assert.equal(pieces.length, 2 * (PATH.length - 1));
  assert.equal(pathGaps().length, PATH.length - 1);
  for (let i = 1; i < PATH.length; i++) {
    const [ax, ay] = PATH[i - 1];
    const [bx, by] = PATH[i];
    const along = ([x, y]) => ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2);
    const [[p0, p1], [p2, p3]] = [pieces[2 * (i - 1)], pieces[2 * (i - 1) + 1]];
    const ts = [p0, p1, p2, p3].map(along);
    assert.ok(ts[0] >= 0 && ts[0] < ts[1] && ts[1] < ts[2] && ts[2] < ts[3] && ts[3] <= 1, `leg ${i}: ${ts}`);
    assert.ok(Math.abs(ts[2] - ts[1] - PATH_HIDDEN) < 1e-9, 'the gap is the hidden stretch');
    const g = along(pathGaps()[i - 1]);
    assert.ok(g > ts[1] && g < ts[2], 'the scrub sits in the gap');
  }
  assert.ok(has(paint(PHASE.noon).fills, NAZARE.cliffScrub));
});

test('after a big wave hits, water drains down the rock in white runnels for a few seconds; a small sea leaves none', () => {
  assert.equal(runnelAt(WAVE.peelFrom), 0);
  assert.ok(runnelAt(0.65) > 0.95);
  assert.equal(runnelAt(0.97), 0);
  assert.equal(fallAt(0.5), 0);
  assert.equal(fallAt(0.9), 1);
  for (let p = 0.02; p <= 1; p += 0.02) assert.ok(fallAt(p) >= fallAt(p - 0.02), 'the heads only run down');
  // a few seconds of a roll: the 18 s roll of a 12 s swell drains for 3 to 8 s
  let on = 0;
  for (let p = 0; p < 1; p += 0.001) if (runnelAt(p) > 0.05) on += 0.001;
  assert.ok(on * 18 > 3 && on * 18 < 8, `drains for ${(on * 18).toFixed(1)} s`);
  const peak = (h) => {
    let best = { amount: 0, t: 0 };
    for (let t = 0; t < 18000; t += 250) {
      const r = runnels(waveStates(L, sea(h), t, false));
      if (r.amount > best.amount) best = { ...r, t };
    }
    return best;
  };
  assert.equal(peak(0.5).amount, 0);
  assert.equal(peak(2).amount, 0);
  assert.ok(peak(4.5).amount > 0.5 && peak(9).amount > 0.95 && peak(9).reach <= 0.32);
  assert.ok(RUNNELS >= 4);
  assert.ok(has(paint(PHASE.noon, sea(9), peak(9).t).strokes, NAZARE.runnel));
  assert.ok(!has(paint(PHASE.noon, sea(2), peak(9).t).strokes, NAZARE.runnel));
});

test('the safety ski patrols the back of the break and trails a white wake', () => {
  const noon = lightAt(PHASE.noon);
  let left = Infinity;
  let right = -Infinity;
  for (let t = 0; t < 30000; t += 300) {
    const r = rescueSpot(L, sea(8), waveStates(L, sea(8), t, false), t, noon);
    assert.ok(r.way >= -1 && r.way <= 1);
    left = Math.min(left, r.x);
    right = Math.max(right, r.x);
  }
  assert.ok(right - left > 0.04 * L.w && left > L.X(STREAK_CLEAR[0][1]) && right < L.X(WAVE.rock - 0.1));
  const seen = Array.from({ length: 72 }, (_, i) => paint(PHASE.noon, sea(8), i * 250)).find((c) => c.out.rescue);
  assert.ok(has(seen.fills, NAZARE.skiWake));
});
