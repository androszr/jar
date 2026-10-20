// Adapted from Memory Lane (vir-sunset) test/placeclock.test.js, 2026-10-18
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localTimeText, zoneOffsetMinutes, placeAt, therePhase, formatterCacheSize, FORMATTER_MAX } from '../src/placeclock.js';
import { realPhase } from '../src/realclock.js';
import { findCity } from '../src/cities/index.js';

const JAN = Date.UTC(2026, 0, 15, 12);
const JUN = Date.UTC(2026, 5, 21, 12);

test('Zagreb: summer -120, winter -60', () => {
  assert.equal(zoneOffsetMinutes(JUN, 'Europe/Zagreb'), -120);
  assert.equal(zoneOffsetMinutes(JAN, 'Europe/Zagreb'), -60);
});

test('Sydney: its summer in January (-660), winter in June (-600)', () => {
  assert.equal(zoneOffsetMinutes(JAN, 'Australia/Sydney'), -660);
  assert.equal(zoneOffsetMinutes(JUN, 'Australia/Sydney'), -600);
});

test('Lima and Punta Arenas keep one offset all year; Santiago does not match Punta Arenas', () => {
  assert.equal(zoneOffsetMinutes(JAN, 'America/Lima'), 300);
  assert.equal(zoneOffsetMinutes(JUN, 'America/Lima'), 300);
  assert.equal(zoneOffsetMinutes(JAN, 'America/Punta_Arenas'), 180);
  assert.equal(zoneOffsetMinutes(JUN, 'America/Punta_Arenas'), 180);
  const differs = [JAN, JUN].some((t) => zoneOffsetMinutes(t, 'America/Santiago') !== zoneOffsetMinutes(t, 'America/Punta_Arenas'));
  assert.ok(differs, 'Santiago changes its clock in winter; Magallanes does not');
});

test('Zagreb flips to summer time at the exact minute (01:00 UTC, 29 March 2026)', () => {
  assert.equal(zoneOffsetMinutes(Date.UTC(2026, 2, 29, 0, 59, 59), 'Europe/Zagreb'), -60);
  assert.equal(zoneOffsetMinutes(Date.UTC(2026, 2, 29, 1, 0, 0), 'Europe/Zagreb'), -120);
});

test('an unknown zone gives null, never a wrong number or a throw, twice over', () => {
  for (const junk of ['Mars/Olympus', '', undefined, 42]) {
    assert.equal(zoneOffsetMinutes(JUN, junk), null, `first call: ${String(junk)}`);
    assert.equal(zoneOffsetMinutes(JUN, junk), null, `cached miss: ${String(junk)}`);
  }
});

test('placeAt: a full location is a real-clock place; anything less is null', () => {
  assert.deepEqual(placeAt(JUN, { lat: 44.3, lon: 15.08, zone: 'Europe/Zagreb' }), { lat: 44.3, lon: 15.08, offsetMinutes: -120 });
  assert.equal(placeAt(JUN, undefined), null);
  assert.equal(placeAt(JUN, { zone: 'Europe/Zagreb' }), null);
  assert.equal(placeAt(JUN, { lat: 1, lon: 2, zone: 'Nope/Nope' }), null);
});

test('the formatter cache stays bounded after 50 distinct zone names', () => {
  const real = ['Europe/Zagreb', 'Australia/Sydney', 'America/Lima', 'America/Punta_Arenas', 'Europe/London', 'Asia/Tokyo'];
  for (let i = 0; i < 50; i++) zoneOffsetMinutes(JUN, i < real.length ? real[i] : `Junk/Zone_${i}`);
  assert.ok(formatterCacheSize() <= FORMATTER_MAX, `${formatterCacheSize()} <= ${FORMATTER_MAX}`);
  // Evicted zones still answer correctly when asked again.
  assert.equal(zoneOffsetMinutes(JUN, 'Europe/Zagreb'), -120);
});

test('at one instant Warsaw is at evening and Sydney at night, each on its own place clock', () => {
  const T = Date.UTC(2026, 5, 21, 17);
  const P = { lat: 45.8, lon: 16, offsetMinutes: -120 };
  const warsaw = findCity('warsaw').location;
  const sydney = { lat: -33.9, lon: 151.2, zone: 'Australia/Sydney' };
  const wPhase = therePhase(T, warsaw, P);
  const sPhase = therePhase(T, sydney, P);
  assert.ok(wPhase < 0.85, `Warsaw at 19:00 is evening, not yet night (${wPhase})`);
  assert.ok(sPhase > 0.85, `Sydney at 03:00 is night (${sPhase})`);
  assert.equal(wPhase, realPhase(T, placeAt(T, warsaw)));
  assert.equal(sPhase, realPhase(T, placeAt(T, sydney)));
});

test('without a usable location the room follows the viewer', () => {
  const T = Date.UTC(2026, 5, 21, 17);
  const P = { lat: 45.8, lon: 16, offsetMinutes: -120 };
  assert.equal(therePhase(T, undefined, P), realPhase(T, P));
  assert.equal(therePhase(T, { lat: 1, lon: 2, zone: 'Nope/Nope' }, P), realPhase(T, P));
});

test('localTimeText: Warsaw in summer and winter, midnight as 00:00, unknown zone as --:--', () => {
  assert.equal(localTimeText(Date.UTC(2026, 5, 15, 12, 5), 'Europe/Warsaw'), '14:05');
  assert.equal(localTimeText(Date.UTC(2026, 0, 15, 12, 5), 'Europe/Warsaw'), '13:05');
  assert.equal(localTimeText(Date.UTC(2026, 0, 14, 23, 0), 'Europe/Warsaw'), '00:00');
  assert.equal(localTimeText(Date.UTC(2026, 5, 15, 12, 5), 'Nowhere/Land'), '--:--');
  assert.equal(localTimeText(NaN, 'Europe/Warsaw'), '--:--');
  assert.equal(localTimeText(Date.UTC(2026, 5, 15, 12, 5), undefined), '--:--');
});
