// Adapted from Memory Lane (vir-sunset) test/realclock.test.js, 2026-10-18
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  placeGuess, sunTimes, dayAnchors, realPhase, anchorCacheSize, MAX_DAY_H, MIN_DAY_H, DEFAULT_LAT,
} from '../src/realclock.js';

// Every case names its offset explicitly: nothing here reads the runner's zone.
const DAY_MS = 86400000;
const dayIndexOf = (y, m, d) => Date.UTC(y, m, d) / DAY_MS;
const hhmm = (h) => h * 60; // hours -> minutes
const ZAGREB = { lat: 45.8, lon: 16.0, offsetMinutes: -120 }; // CEST

test('placeGuess: an exact zone, an unknown zone and no zone at all', () => {
  const z = placeGuess('Europe/Zagreb', -120);
  assert.equal(z.lat, 45.8);
  assert.equal(z.lon, 16);
  assert.equal(z.offsetMinutes, -120);
  const mars = placeGuess('Mars/Olympus', 300);
  assert.equal(mars.lat, 45);
  assert.equal(mars.lon, -75);
  const none = placeGuess(undefined, 0);
  assert.equal(none.lat, DEFAULT_LAT);
  assert.equal(none.lon, 0);
  assert.equal(placeGuess('Asia/Tokyo', -540).lat, 30);
  assert.equal(placeGuess('Asia/Tokyo', -540).lon, 135);
  assert.doesNotThrow(() => placeGuess(42, Number.NaN));
  assert.ok(Number.isFinite(placeGuess(null, 'junk').lon));
});

test('the equator at the March equinox: sunrise near 06:00 UTC, sunset near 18:00 UTC', () => {
  const { rise, set } = sunTimes(dayIndexOf(2026, 2, 20), 0, 0);
  assert.ok(Math.abs(hhmm(rise) - hhmm(6)) < 15, `rise ${rise}`);
  assert.ok(Math.abs(hhmm(set) - hhmm(18)) < 15, `set ${set}`);
});

test('latitude 60: a long June day and a short December day', () => {
  const june = sunTimes(dayIndexOf(2026, 5, 21), 60, 0);
  const dec = sunTimes(dayIndexOf(2026, 11, 21), 60, 0);
  assert.ok(june.set - june.rise > 18, `June ${june.set - june.rise}`);
  assert.ok(dec.set - dec.rise < 7, `December ${dec.set - dec.rise}`);
});

test('latitude 80: clamped days, no NaN, anchors strictly increasing', () => {
  const place = { lat: 80, lon: 15, offsetMinutes: -60 };
  for (const [m, want] of [[5, MAX_DAY_H], [11, MIN_DAY_H]]) {
    const d = dayIndexOf(2026, m, 21);
    const { rise, set } = sunTimes(d, place.lat, place.lon);
    assert.ok(Number.isFinite(rise) && Number.isFinite(set));
    assert.ok(Math.abs(set - rise - want) < 1e-9, `month ${m}: ${set - rise}`);
    const a = dayAnchors(d, place);
    for (let i = 1; i < a.length; i++) {
      assert.ok(a[i].ms > a[i - 1].ms, `month ${m}: anchor ${i} out of order`);
      assert.ok(a[i].phase > a[i - 1].phase);
    }
    for (let h = 0; h < 24; h += 0.25) {
      const p = realPhase(Date.UTC(2026, m, 21) + h * 3600e3, place);
      assert.ok(Number.isFinite(p) && p >= 0 && p < 1, `month ${m} hour ${h}: ${p}`);
    }
  }
});

test('Zagreb, 24 September 2026: the room reads exactly sunset at the real sunset', () => {
  // Almanac: sunrise 06:44, sunset 18:52 local (CEST, UTC+2).
  const d = dayIndexOf(2026, 8, 24);
  const { rise, set } = sunTimes(d, ZAGREB.lat, ZAGREB.lon);
  const riseLocal = rise + 2;
  const setLocal = set + 2;
  assert.ok(Math.abs(hhmm(riseLocal) - (6 * 60 + 44)) <= 10, `rise ${riseLocal}`);
  assert.ok(Math.abs(hhmm(setLocal) - (18 * 60 + 52)) <= 10, `set ${setLocal}`);
  const setMs = Date.UTC(2026, 8, 24) + set * 3600e3;
  const riseMs = Date.UTC(2026, 8, 24) + rise * 3600e3;
  assert.ok(Math.abs(realPhase(setMs, ZAGREB) - 0.76) < 1e-9, `sunset phase ${realPhase(setMs, ZAGREB)}`);
  assert.ok(Math.abs(realPhase(riseMs, ZAGREB) - 0.08) < 1e-9, `sunrise phase ${realPhase(riseMs, ZAGREB)}`);
});

test('solar noon reads 0.40 and local midnight reads night', () => {
  const d = dayIndexOf(2026, 8, 24);
  const { rise, set } = sunTimes(d, ZAGREB.lat, ZAGREB.lon);
  const noonMs = Date.UTC(2026, 8, 24) + ((rise + set) / 2) * 3600e3;
  assert.ok(Math.abs(realPhase(noonMs, ZAGREB) - 0.4) < 1e-9);
  const midnight = Date.UTC(2026, 8, 24) + ZAGREB.offsetMinutes * 60000; // 00:00 local
  const p = realPhase(midnight, ZAGREB);
  assert.ok(p > 0.88 && p < 0.98, `midnight ${p}`);
});

test('continuity: over 48 hours the phase only moves forward, in small steps, wrapping twice', () => {
  const place = { lat: 45.8, lon: 16, offsetMinutes: -60 };
  const start = Date.UTC(2026, 0, 1);
  let prev = realPhase(start, place);
  let wraps = 0;
  for (let m = 1; m <= 48 * 60; m++) {
    const p = realPhase(start + m * 60000, place);
    let step = p - prev;
    if (step < -0.5) {
      wraps += 1;
      step += 1;
    }
    assert.ok(step >= 0, `minute ${m}: backwards by ${step}`);
    assert.ok(step < 0.01, `minute ${m}: jumps by ${step}`);
    prev = p;
  }
  assert.equal(wraps, 2);
});

test('purity: the same arguments give the same number; the offset matters', () => {
  const t = Date.UTC(2026, 5, 21, 17, 0);
  assert.equal(realPhase(t, ZAGREB), realPhase(t, ZAGREB));
  // A guessed place follows its offset: the sun moves with the zone's longitude.
  const east = placeGuess('Europe/Nowhere', -120);
  const west = placeGuess('Europe/Nowhere', -60);
  assert.notEqual(realPhase(t, east), realPhase(t, west));
});

test('the anchor cache never holds more than three days', () => {
  const start = Date.UTC(2026, 0, 1);
  for (let d = 0; d < 1000; d++) realPhase(start + d * DAY_MS + 12 * 3600e3, ZAGREB);
  assert.ok(anchorCacheSize() <= 3, `${anchorCacheSize()} entries`);
});

test('the anchors read their phases from the keyframe table', () => {
  const a = dayAnchors(dayIndexOf(2026, 8, 24), ZAGREB).map((x) => x.phase);
  assert.deepEqual(a, [0, 0.08, 0.4, 0.76, 0.82, 0.88, 0.98, 1]);
});

test('Sydney and Lima: the southern hemisphere gets a long December day', () => {
  const syd = placeGuess('Australia/Sydney', -660);
  const dec = sunTimes(dayIndexOf(2026, 11, 21), syd.lat, syd.lon);
  const jun = sunTimes(dayIndexOf(2026, 5, 21), syd.lat, syd.lon);
  assert.ok(dec.set - dec.rise > jun.set - jun.rise);
  const lima = placeGuess('America/Lima', 300);
  assert.equal(lima.lat, -12);
  assert.equal(lima.lon, -77);
});
