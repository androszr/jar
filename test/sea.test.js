import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BANDS, DEFAULT_WAVE_M, waveHeightOf, waveBand, waveSize, rollMs, wavePhase, surferPlan, surferProgress, surferAlpha, swellLines, swellStrength, SWELL_LINES,
  SIZES, swellCount, windBlow, beachLife, WARM_C, UMBRELLA_WIND_KMH, boatLights, BOATS,
} from '../src/cities/nazare/sea.js';
import { EMPTY } from '../src/weather.js';

test('the four bands break at 1, 3 and 6 metres', () => {
  assert.deepEqual(BANDS.map((b) => b[0]), ['calm', 'moderate', 'big', 'giant']);
  const cases = [[0.3, 'calm'], [1, 'moderate'], [2.9, 'moderate'], [3, 'big'], [5.99, 'big'], [6, 'giant'], [25, 'giant']];
  for (const [m, band] of cases) assert.equal(waveBand(m), band, `${m} m`);
});

test('the size grows smoothly with the metres and stops at ten', () => {
  let prev = -1;
  for (let m = 0; m <= 12; m += 0.25) {
    const s = waveSize(m);
    assert.ok(s >= prev, `monotonic at ${m}`);
    prev = s;
  }
  assert.equal(waveSize(12), waveSize(10));
  for (const [m, s] of [[0, 0.02], [1, 0.05], [3, 0.1], [6, 0.19], [10, 0.29]]) assert.ok(Math.abs(waveSize(m) - s) < 1e-12);
  assert.deepEqual(SIZES, [[0, 0.02], [1, 0.05], [3, 0.1], [6, 0.19], [10, 0.29]]);
  // the giant band is clearly taller than the big one, and a calm sea stays small
  assert.ok(waveSize(9) > 1.8 * waveSize(4.5) && waveSize(0.5) < 0.04);
});

test('no sea reading, or junk, is the 2 m default', () => {
  assert.equal(DEFAULT_WAVE_M, 2);
  assert.equal(waveHeightOf(EMPTY), 2);
  assert.equal(waveHeightOf({ sea: null }), 2);
  assert.equal(waveHeightOf({ sea: { waveHeight: 'x' } }), 2);
  assert.equal(waveHeightOf({ sea: { waveHeight: null } }), 2);
  assert.equal(waveHeightOf({ sea: { waveHeight: 7 } }), 7);
  assert.equal(waveHeightOf(undefined), 2);
});

test('surfers by band at noon: none, three, three, the tow-in pair', () => {
  assert.deepEqual(['calm', 'moderate', 'big', 'giant'].map((b) => surferPlan(b, 1).length), [0, 3, 3, 2]);
  assert.deepEqual(surferPlan('giant', 1).map((s) => s.kind), ['rider', 'ski']);
  assert.deepEqual(surferPlan('big', 1).map((s) => s.kind), ['rider', 'rider', 'paddler']);
});

test('nobody surfs in the dark', () => {
  for (const b of ['calm', 'moderate', 'big', 'giant']) assert.equal(surferPlan(b, 0.08).length, 0, b);
  assert.equal(surferAlpha(0.08), 0);
  assert.equal(surferAlpha(1), 1);
  assert.ok(surferAlpha(0.5) > 0 && surferAlpha(0.5) < 1);
});

test('surfers are sampled from the clock: same moment, same place; later, elsewhere', () => {
  const roll = rollMs(EMPTY);
  for (let i = 0; i < 3; i++) {
    assert.equal(surferProgress(i, 1e9, roll), surferProgress(i, 1e9, roll));
    assert.notEqual(surferProgress(i, 1e9, roll), surferProgress(i, 1e9 + 3000, roll));
    const q = surferProgress(i, 1e9, roll);
    assert.ok(q >= 0 && q < 1);
  }
});

test('the roll takes the swell period, clamped 8..18 s, stretched 1.5x, 2.5x slower reduced', () => {
  assert.equal(rollMs(EMPTY), 18000);
  assert.equal(rollMs({ sea: { wavePeriod: 3 } }), 12000);
  assert.equal(rollMs({ sea: { wavePeriod: 40 } }), 27000);
  assert.equal(rollMs({ sea: { wavePeriod: 13.5 } }), 20250);
  assert.ok(Math.abs(rollMs(EMPTY, true) - 45000) < 1e-9);
});

test('wavePhase starts at 0 and wraps', () => {
  assert.equal(wavePhase(0, 12000), 0);
  assert.equal(wavePhase(6000, 12000), 0.5);
  assert.ok(wavePhase(13000, 12000) < 0.1);
});

test('swell lines: evenly spaced, one trip per roll, stronger on a bigger sea', () => {
  const roll = 18000;
  const a = swellLines(0.1, roll, 5000);
  assert.equal(a.length, SWELL_LINES);
  for (const l of a) assert.ok(l.u >= 0 && l.u < 1 && l.t >= 0 && l.t < 1 && l.a >= 0 && l.a <= 1);
  // a full roll later the same lines are in the same places
  const b = swellLines(0.1, roll, 5000 + roll);
  a.forEach((l, i) => assert.ok(Math.abs(l.u - b[i].u) < 1e-9));
  assert.deepEqual(swellLines(0.1, roll, 5000), a);
  assert.ok(swellStrength(0.26) > swellStrength(0.02) * 2);
  const sum = (size) => swellLines(size, roll, 1234).reduce((t, l) => t + l.a, 0);
  assert.ok(sum(0.26) > sum(0.02));
});

test('the swell lines are packed by the period: more of them on a short swell, fewer on a long one', () => {
  const sea = (p) => ({ sea: { waveHeight: 3, wavePeriod: p, waveDir: null } });
  assert.ok(swellCount(sea(8)) > swellCount(sea(12)) && swellCount(sea(12)) > swellCount(sea(18)));
  assert.equal(swellCount(EMPTY), swellCount(sea(12)));
  assert.equal(swellCount(sea(3)), swellCount(sea(8)));
  for (const p of [null, 8, 10, 14, 18, 40]) {
    const n = swellCount(sea(p));
    assert.ok(Number.isInteger(n) && n >= 6 && n <= 12);
    assert.equal(swellLines(0.1, 18000, 5000, n).length, n);
  }
});

test('the wind tears more spray off the crest the harder it blows, a light air with no reading', () => {
  assert.equal(windBlow(EMPTY), 0.3);
  assert.equal(windBlow(null), 0.3);
  assert.ok(windBlow({ windSpeed: 10 }) < windBlow({ windSpeed: 25 }) && windBlow({ windSpeed: 25 }) < windBlow({ windSpeed: 40 }));
  assert.equal(windBlow({ windSpeed: 90 }), 1);
  assert.ok(windBlow({ windSpeed: 0 }) > 0);
});

test('the beach follows the season and the swell: umbrellas on a warm fair gentle day, the red flag on a big or giant one', () => {
  const fine = { ...EMPTY, known: true, kind: 'clear', cloudCover: 5, temperature: 24, windSpeed: 8 };
  const noon = 1;
  assert.equal(beachLife(fine, 'calm', noon).umbrellas, 1);
  assert.equal(beachLife(fine, 'moderate', noon).umbrellas, 1);
  assert.deepEqual(beachLife(fine, 'big', noon), { umbrellas: 0, flag: true, onlookers: 3 });
  assert.deepEqual(beachLife(fine, 'giant', noon), { umbrellas: 0, flag: true, onlookers: 3 });
  assert.equal(beachLife(fine, 'calm', noon).flag, false);
  // not when it is cold, wet, overcast, blowing a gale or dark
  assert.equal(beachLife({ ...fine, temperature: WARM_C - 1 }, 'calm', noon).umbrellas, 0);
  assert.equal(beachLife({ ...fine, temperature: WARM_C }, 'calm', noon).umbrellas, 1);
  for (const kind of ['rain', 'drizzle', 'storm', 'snow', 'fog']) assert.equal(beachLife({ ...fine, kind }, 'calm', noon).umbrellas, 0, kind);
  assert.equal(beachLife({ ...fine, kind: 'cloud', cloudCover: 95 }, 'calm', noon).umbrellas, 0);
  assert.equal(beachLife({ ...fine, kind: 'cloud', cloudCover: 40 }, 'calm', noon).umbrellas, 1);
  assert.equal(beachLife({ ...fine, windSpeed: UMBRELLA_WIND_KMH }, 'calm', noon).umbrellas, 0);
  assert.equal(beachLife(fine, 'calm', 0.3).umbrellas, 0);
  assert.equal(beachLife(fine, 'calm', null).umbrellas, 0);
  // a December giant in the rain: the flag, and nobody on the sand
  assert.deepEqual(beachLife({ ...fine, kind: 'rain', temperature: 12 }, 'giant', noon), { umbrellas: 0, flag: true, onlookers: 0 });
  // with no temperature the calendar decides: July is warm, December is not
  const unknown = { ...fine, temperature: null };
  assert.equal(beachLife(unknown, 'calm', noon, Date.UTC(2026, 6, 15, 12)).umbrellas, 1);
  assert.equal(beachLife(unknown, 'calm', noon, Date.UTC(2026, 11, 10, 12)).umbrellas, 0);
  assert.equal(beachLife(EMPTY, 'calm', noon, Date.UTC(2026, 11, 10, 12)).umbrellas, 0);
  // and with no reading at all the sand stays empty, even in July
  assert.equal(beachLife(EMPTY, 'moderate', noon, Date.UTC(2026, 6, 15, 12)).umbrellas, 0);
  assert.doesNotThrow(() => beachLife(null, 'calm', noon, NaN));
});

test('boat lights: three on a quiet night, two on a big sea, none by day, in a storm, in fog or under a giant swell', () => {
  assert.equal(boatLights('moderate', 'clear', 1, 0).length, 3);
  assert.equal(boatLights('calm', 'cloud', 1, 0).length, 3);
  assert.equal(boatLights('big', 'clear', 1, 0).length, 2);
  assert.equal(boatLights('giant', 'clear', 1, 0).length, 0);
  assert.equal(boatLights('moderate', 'storm', 1, 0).length, 0);
  assert.equal(boatLights('moderate', 'fog', 1, 0).length, 0);
  assert.equal(boatLights('moderate', 'clear', 0, 0).length, 0);
  assert.equal(boatLights('moderate', 'clear', 0.2, 0).length, 0);
  // on the open water just under the horizon, left of the headland, and a pure function of the clock
  for (let t = 0; t < 600000; t += 37000) {
    for (const b of boatLights('moderate', 'clear', 1, t, 0.5)) {
      assert.ok(b.xs > 0.07 && b.xs < 0.5 && b.ys > 0.5 && b.ys < 0.52 && b.a === 1);
    }
  }
  assert.deepEqual(boatLights('moderate', 'clear', 1, 4321), boatLights('moderate', 'clear', 1, 4321));
  assert.notDeepEqual(boatLights('moderate', 'clear', 1, 4321), boatLights('moderate', 'clear', 1, 64321));
  assert.equal(BOATS.length, 3);
});
