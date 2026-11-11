import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCRUB_MAX_MIN, SCRUB_STEP_MIN, clampScrub, offsetText, scrubMoment, hourlyAt, previewWeather, rowAt, seaHourlyAt, previewSea } from '../src/scrub.js';
import { EMPTY, fromEntry } from '../src/weather.js';
import { wallToMs } from '../src/placeclock.js';
import { readFileSync } from 'node:fs';

const ZONE = 'Europe/Warsaw';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/weather.json', import.meta.url), 'utf8'));
const hourly = fixture.hourly.time.map((time, i) => ({
  time,
  temperature: fixture.hourly.temperature_2m[i],
  code: fixture.hourly.weather_code[i],
  cloudCover: fixture.hourly.cloud_cover[i],
  isDay: fixture.hourly.is_day[i],
  windSpeed: fixture.hourly.wind_speed_10m[i],
  windDir: fixture.hourly.wind_direction_10m[i],
}));
const weather = fromEntry({ temperature: 12.3, code: 61, cloudCover: 80, isDay: 1, windSpeed: 18, windDir: 250, daily: [{ date: '2026-10-18', code: 61, high: 14, low: 8, sunrise: '07:05', sunset: '17:32' }], sea: null, hourly });
const at = (hhmm) => wallToMs(`2026-10-18T${hhmm}`, ZONE);

test('constants', () => {
  assert.equal(SCRUB_MAX_MIN, 1440);
  assert.equal(SCRUB_STEP_MIN, 30);
});

test('clampScrub snaps to the step and stays within 0..1440', () => {
  assert.equal(clampScrub(0), 0);
  assert.equal(clampScrub(44), 30);
  assert.equal(clampScrub(46), 60);
  assert.equal(clampScrub(-50), 0);
  assert.equal(clampScrub(99999), 1440);
  assert.equal(clampScrub(330), 330);
});

test('clampScrub: non-numbers are 0', () => {
  for (const v of [NaN, Infinity, undefined, null, '60', {}]) assert.equal(clampScrub(v), 0, String(v));
});

test('offsetText: now, whole hours, half hours', () => {
  assert.equal(offsetText(0), 'now');
  assert.equal(offsetText(30), '+½ h');
  assert.equal(offsetText(60), '+1 h');
  assert.equal(offsetText(330), '+5½ h');
  assert.equal(offsetText(300), '+5 h');
  assert.equal(offsetText(1440), '+24 h');
});

test('scrubMoment adds the clamped minutes', () => {
  assert.equal(scrubMoment(1000, 60), 1000 + 3600000);
  assert.equal(scrubMoment(1000, 0), 1000);
  assert.equal(scrubMoment(1000, 99999), 1000 + 1440 * 60000);
});

test('hourlyAt picks the covering row', () => {
  assert.equal(hourlyAt(weather, at('15:00'), ZONE).temperature, 16.2);
  assert.equal(hourlyAt(weather, at('15:40'), ZONE).temperature, 16.2);
  assert.equal(hourlyAt(weather, at('14:00'), ZONE).temperature, 17.7);
});

test('hourlyAt is null before the first row, past the last + 60 min, with no hourly or an unknown zone', () => {
  assert.equal(hourlyAt(weather, at('00:00') - 1, ZONE), null);
  assert.equal(hourlyAt(weather, wallToMs('2026-10-19T00:00', ZONE) + 3600000 + 1, ZONE), null);
  assert.notEqual(hourlyAt(weather, wallToMs('2026-10-19T00:00', ZONE) + 3600000, ZONE), null);
  assert.equal(hourlyAt(EMPTY, at('15:00'), ZONE), null);
  assert.equal(hourlyAt(null, at('15:00'), ZONE), null);
  assert.equal(hourlyAt(weather, at('15:00'), 'Nowhere/Land'), null);
  assert.equal(hourlyAt(weather, NaN, ZONE), null);
});

test('previewWeather substitutes the six fields and recomputes kind and known', () => {
  const w = previewWeather(weather, at('15:00'), ZONE);
  assert.notEqual(w, weather);
  assert.equal(w.temperature, 16.2);
  assert.equal(w.code, 61);
  assert.equal(w.kind, 'rain');
  assert.equal(w.known, true);
  assert.equal(w.cloudCover, hourly[15].cloudCover);
  assert.equal(w.windSpeed, hourly[15].windSpeed);
  assert.equal(w.windDir, hourly[15].windDir);
  assert.equal(w.isDay, hourly[15].isDay);
  assert.equal(previewWeather(weather, at('21:00'), ZONE).kind, 'clear');
});

test('previewWeather keeps daily, sea and hourly untouched', () => {
  const w = previewWeather(weather, at('15:00'), ZONE);
  assert.equal(w.daily, weather.daily);
  assert.equal(w.sea, weather.sea);
  assert.equal(w.hourly, weather.hourly);
});

test('previewWeather returns the identical object when no row applies, and for EMPTY', () => {
  assert.equal(previewWeather(weather, at('00:00') - 3600000 * 5, ZONE), weather);
  assert.equal(previewWeather(EMPTY, at('15:00'), ZONE), EMPTY);
});

test('previewWeather is deterministic: the same inputs give deep-equal results', () => {
  assert.deepEqual(previewWeather(weather, at('15:00'), ZONE), previewWeather(weather, at('15:00'), ZONE));
});

const seaRows = [
  { time: '2026-10-18T14:00', waveHeight: 1.2 },
  { time: '2026-10-18T15:00', waveHeight: 6.5 },
  { time: '2026-10-18T16:00', waveHeight: null },
];
const sea = { waveHeight: 4.2, wavePeriod: 14, waveDir: 300, daily: [], hourly: seaRows };
const seaWeather = { ...weather, sea };

test('rowAt picks the covering row from any list and is null on junk', () => {
  assert.equal(rowAt(seaRows, at('14:30'), ZONE), seaRows[0]);
  assert.equal(rowAt([], at('14:30'), ZONE), null);
  assert.equal(rowAt('junk', at('14:30'), ZONE), null);
  assert.equal(rowAt(seaRows, at('14:30'), 'Nowhere/Land'), null);
});

test('seaHourlyAt picks the covering row, skips a null height, and is null without rows', () => {
  assert.equal(seaHourlyAt(sea, at('15:10'), ZONE), seaRows[1]);
  assert.equal(seaHourlyAt(sea, at('16:00'), ZONE), null);
  assert.equal(seaHourlyAt(sea, at('14:00') - 1, ZONE), null);
  assert.equal(seaHourlyAt(sea, at('17:00') + 3600000, ZONE), null);
  assert.equal(seaHourlyAt(null, at('15:00'), ZONE), null);
  assert.equal(seaHourlyAt({ waveHeight: 4.2 }, at('15:00'), ZONE), null);
  assert.equal(seaHourlyAt(sea, at('15:00'), 'Nowhere/Land'), null);
});

test('previewSea swaps only the wave height; identical when no row applies, and on null', () => {
  const s = previewSea(sea, at('15:00'), ZONE);
  assert.equal(s.waveHeight, 6.5);
  assert.equal(s.wavePeriod, 14);
  assert.equal(s.waveDir, 300);
  assert.equal(s.daily, sea.daily);
  assert.equal(s.hourly, sea.hourly);
  assert.equal(previewSea(sea, at('16:00'), ZONE), sea);
  assert.equal(previewSea(null, at('15:00'), ZONE), null);
});

test('previewWeather with a sea row only swaps the sea and leaves the six fields', () => {
  const w = previewWeather({ ...seaWeather, hourly: [] }, at('15:00'), ZONE);
  assert.equal(w.sea.waveHeight, 6.5);
  assert.equal(w.temperature, weather.temperature);
  assert.equal(w.code, weather.code);
  assert.equal(w.kind, weather.kind);
});

test('previewWeather with both rows swaps both; with neither it is identical', () => {
  const w = previewWeather(seaWeather, at('15:00'), ZONE);
  assert.equal(w.sea.waveHeight, 6.5);
  assert.equal(w.temperature, 16.2);
  const none = { ...seaWeather, hourly: [], sea: { ...sea, hourly: [] } };
  assert.equal(previewWeather(none, at('15:00'), ZONE), none);
  assert.equal(previewWeather(EMPTY, at('15:00'), ZONE), EMPTY);
  assert.deepEqual(previewWeather(seaWeather, at('14:00'), ZONE), previewWeather(seaWeather, at('14:00'), ZONE));
});
