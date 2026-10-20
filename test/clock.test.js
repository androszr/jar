// Adapted from Memory Lane (vir-sunset) test/clock.test.js, 2026-10-18
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayPhase, sample, bracket, sunAltitude, sunPos, moonPos, lightLevel, isNight, LAMP_THRESHOLD, KEYFRAMES, readOptions, DEFAULT_DAY_LENGTH } from '../src/clock.js';

test('sample is look-free: light plus the two bracketing keyframe names and the blend', () => {
  const s = sample(0.3);
  assert.deepEqual(Object.keys(s).sort(), ['a', 'b', 'light', 't']);
  assert.equal(s.a, 'morning');
  assert.equal(s.b, 'noon');
  assert.ok(s.t >= 0 && s.t <= 1);
  assert.ok(s.light > 0.9 && s.light < 1);
});

test('the light level closes the loop and never jumps between neighbouring moments', () => {
  assert.ok(Math.abs(sample(0.9999).light - sample(0).light) < 0.01);
  const step = 1 / 20000;
  let prev = sample(0);
  for (let i = 1; i <= 20000; i++) {
    const cur = sample(i * step);
    assert.ok(Math.abs(cur.light - prev.light) < 0.01, `light jumps at ${(i * step).toFixed(5)}`);
    prev = cur;
  }
});

test('the keyframes are in order and the named ones sit where the day expects', () => {
  for (let i = 1; i < KEYFRAMES.length; i++) assert.ok(KEYFRAMES[i].at > KEYFRAMES[i - 1].at);
  const names = new Set(KEYFRAMES.map((k) => k.name));
  for (const n of ['dawn', 'sunrise', 'morning', 'noon', 'afternoon', 'golden', 'sunset', 'dusk', 'night']) assert.ok(names.has(n), n);
  const at = Object.fromEntries(KEYFRAMES.map((k) => [k.name, k.at]));
  assert.equal(at.dawn, 0);
  assert.equal(at.noon, 0.4);
  assert.equal(at.sunset, 0.76);
  assert.ok(lightLevel(0.4) > lightLevel(0.76) && lightLevel(0.76) > lightLevel(0.9));
  assert.ok(isNight(0.9) && !isNight(0.4));
  assert.ok(LAMP_THRESHOLD > 0.08 && LAMP_THRESHOLD < 0.8);
  assert.equal(bracket(0.4).a.name, 'noon');
});

test('the sun is below the horizon at night and above it through the day', () => {
  for (let p = 0.84; p <= 0.98; p += 0.002) assert.ok(sunAltitude(p) < 0, `night ${p}`);
  for (let p = 0.12; p <= 0.72; p += 0.002) assert.ok(sunAltitude(p) > 0, `day ${p}`);
  assert.ok(Math.abs(sunAltitude(0.9999) - sunAltitude(0)) < 0.01);
  assert.ok(Math.abs(moonPos(0.9999).y - moonPos(0).y) < 1);
  assert.ok(sunPos(0.4).y < sunPos(0.7).y, 'the sun is lower in the evening');
});

test('dayPhase wraps at every whole number of days', () => {
  for (const L of [240, 600, 37.5]) {
    for (let k = 0; k < 6; k++) assert.ok(Math.abs(dayPhase(k * L, L)) < 1e-9, `k=${k} L=${L}`);
    assert.ok(Math.abs(dayPhase(2.5 * L, L) - 0.5) < 1e-9);
    assert.ok(Math.abs(dayPhase(-0.25 * L, L) - 0.75) < 1e-9);
  }
});

test('URL options: ?jar names a jar, ?day and ?at are read, junk falls back', () => {
  assert.equal(readOptions('?jar=warsaw').jar, 'warsaw');
  assert.equal(readOptions('').jar, null);
  assert.equal(readOptions('?jar=').jar, null);
  assert.equal(readOptions('?day=600&at=0.7').dayLength, 600);
  assert.equal(readOptions('?day=600&at=0.7').startPhase, 0.7);
  assert.equal(readOptions('?day=-3').dayLength, DEFAULT_DAY_LENGTH);
  assert.equal(readOptions('?at=1.25').startPhase, 0.25);
  assert.deepEqual(Object.keys(readOptions('')).sort(), ['clock', 'dayLength', 'jar', 'startPhase']);
});
