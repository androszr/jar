import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BANDS, DEFAULT_WAVE_M, waveHeightOf, waveBand, waveSize, rollMs, wavePhase, surferPlan, surferProgress, surferAlpha,
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
  for (const [m, s] of [[0, 0.02], [1, 0.05], [3, 0.1], [6, 0.18], [10, 0.26]]) assert.ok(Math.abs(waveSize(m) - s) < 1e-12);
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

test('the roll takes the swell period, clamped 8..18 s, 2.5x slower reduced', () => {
  assert.equal(rollMs(EMPTY), 12000);
  assert.equal(rollMs({ sea: { wavePeriod: 3 } }), 8000);
  assert.equal(rollMs({ sea: { wavePeriod: 40 } }), 18000);
  assert.equal(rollMs({ sea: { wavePeriod: 13.5 } }), 13500);
  assert.ok(Math.abs(rollMs(EMPTY, true) - 30000) < 1e-9);
});

test('wavePhase starts at 0 and wraps', () => {
  assert.equal(wavePhase(0, 12000), 0);
  assert.equal(wavePhase(6000, 12000), 0.5);
  assert.ok(wavePhase(13000, 12000) < 0.1);
});
