import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler, { openMeteoUrl, normalise, fetchWeather, resetMemo } from '../api/weather.js';
import { PLACES } from '../src/cities/places.js';
import { readFileSync } from 'node:fs';

const fixture = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const warsaw = PLACES[0];
const two = [warsaw, { id: 'paris', title: 'Paris', lat: 48.85, lon: 2.35, zone: 'Europe/Paris' }];
const NOW = Date.UTC(2026, 9, 18, 12);

test('openMeteoUrl builds one request for one place', () => {
  const u = new URL(openMeteoUrl([warsaw]));
  assert.equal(u.host, 'api.open-meteo.com');
  assert.equal(u.pathname, '/v1/forecast');
  assert.equal(u.searchParams.get('latitude'), '52.23');
  assert.equal(u.searchParams.get('longitude'), '21.01');
  assert.equal(u.searchParams.get('current'), 'temperature_2m,weather_code,cloud_cover,is_day,wind_speed_10m,wind_direction_10m');
  assert.equal(u.searchParams.get('timezone'), 'Europe/Warsaw');
  assert.equal(u.searchParams.get('daily'), 'weather_code,temperature_2m_max,temperature_2m_min');
  assert.equal(u.searchParams.get('forecast_days'), '5');
});

test('openMeteoUrl joins the coordinates of every place in order', () => {
  const u = new URL(openMeteoUrl(two));
  assert.equal(u.searchParams.get('latitude'), '52.23,48.85');
  assert.equal(u.searchParams.get('longitude'), '21.01,2.35');
  assert.equal(u.searchParams.get('timezone'), 'Europe/Warsaw,Europe/Paris');
  assert.equal(u.searchParams.get('forecast_days'), '5');
});

test('normalise: the one-city object body', () => {
  const r = normalise(fixture('weather.json'), [warsaw], NOW);
  assert.equal(r.v, 1);
  assert.equal(r.ok, true);
  assert.equal(r.fetchedAt, new Date(NOW).toISOString());
  assert.deepEqual({ ...r.cities.warsaw, daily: undefined }, { temperature: 12.3, code: 61, cloudCover: 80, isDay: 1, windSpeed: 18.4, windDir: 250, daily: undefined });
  assert.equal(r.cities.warsaw.daily.length, 5);
});

test('normalise: the many-city array body keeps request order', () => {
  const r = normalise(fixture('weather-two.json'), two, NOW);
  assert.deepEqual(Object.keys(r.cities), ['warsaw', 'paris']);
  assert.equal(r.cities.paris.temperature, -3.6);
  assert.equal(r.cities.paris.code, 71);
});

test('normalise: a body without current gives no city and ok false', () => {
  const r = normalise({ latitude: 1 }, [warsaw], NOW);
  assert.deepEqual(r.cities, {});
  assert.equal(r.ok, false);
  assert.equal(normalise(null, [warsaw], NOW).ok, false);
  assert.equal(normalise([], [warsaw], NOW).ok, false);
});

test('normalise: missing fields are null, non-numeric fields are null', () => {
  const r = normalise({ current: { temperature_2m: '12', weather_code: 3, cloud_cover: NaN } }, [warsaw], NOW);
  assert.deepEqual(r.cities.warsaw, { temperature: null, code: 3, cloudCover: null, isDay: null, windSpeed: null, windDir: null, daily: [] });
});

test('normalise: extra keys are ignored', () => {
  const r = normalise({ current: { temperature_2m: 1, weather_code: 0, cloud_cover: 0, is_day: 0, wind: 9 }, hourly: {} }, [warsaw], NOW);
  assert.deepEqual(Object.keys(r.cities.warsaw).sort(), ['cloudCover', 'code', 'daily', 'isDay', 'temperature', 'windDir', 'windSpeed']);
});

test('a partly short array still answers the cities it has', () => {
  const r = normalise([fixture('weather.json')], two, NOW);
  assert.deepEqual(Object.keys(r.cities), ['warsaw']);
  assert.equal(r.ok, true);
});

test('fetchWeather makes exactly one call, to the vendor host, and returns the tidy body', async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return { ok: true, json: async () => fixture('weather-two.json') }; };
  const r = await fetchWeather(two, { fetchImpl, nowMs: NOW });
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0]).host, 'api.open-meteo.com');
  assert.equal(r.ok, true);
  assert.equal(r.cities.warsaw.temperature, 12.3);
});

test('fetchWeather answers the empty shape when the vendor throws, 500s or sends junk', async () => {
  const cases = {
    throws: async () => { throw new Error('down'); },
    status500: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    badJson: async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } }),
    noResponse: async () => undefined,
  };
  for (const [name, fetchImpl] of Object.entries(cases)) {
    const r = await fetchWeather([warsaw], { fetchImpl, nowMs: NOW });
    assert.deepEqual([r.v, r.ok, r.cities], [1, false, {}], name);
  }
});

const fakeRes = () => {
  const r = { headers: {}, setHeader(k, v) { r.headers[k] = v; }, end(b) { r.body = b; } };
  return r;
};

test('two handler calls inside the window make one vendor call; after it, a second', async () => {
  resetMemo();
  let n = 0;
  const fetchImpl = async () => { n += 1; return { ok: true, json: async () => fixture('weather.json') }; };
  const a = fakeRes();
  const b = fakeRes();
  await handler({ method: 'GET' }, a, { fetchImpl, nowMs: NOW });
  await handler({ method: 'GET', url: '/api/weather?x=1' }, b, { fetchImpl, nowMs: NOW + 899000 });
  assert.equal(n, 1);
  assert.equal(JSON.parse(b.body).cities.warsaw.temperature, 12.3);
  await handler({ method: 'GET' }, fakeRes(), { fetchImpl, nowMs: NOW + 901000 });
  assert.equal(n, 2);
  resetMemo();
  await handler({ method: 'GET' }, fakeRes(), { fetchImpl, nowMs: NOW + 902000 });
  assert.equal(n, 3, 'resetMemo clears it');
});

test('a failed vendor call is never memoised', async () => {
  resetMemo();
  let n = 0;
  const fetchImpl = async () => { n += 1; throw new Error('down'); };
  const r = fakeRes();
  await handler({ method: 'GET' }, r, { fetchImpl, nowMs: NOW });
  await handler({ method: 'GET' }, fakeRes(), { fetchImpl, nowMs: NOW + 1000 });
  assert.equal(n, 2);
  assert.equal(r.statusCode, 502);
});

const cur = { temperature_2m: 1, weather_code: 0, cloud_cover: 0, is_day: 0 };

test('normalise: five daily rows from the fixture', () => {
  const r = normalise(fixture('weather.json'), [warsaw], NOW);
  assert.equal(r.cities.warsaw.daily.length, 5);
  assert.deepEqual(r.cities.warsaw.daily[0], { date: '2026-10-18', code: 61, high: 14.2, low: 8.7 });
  assert.equal(r.cities.warsaw.daily[3].low, -2.4);
});

test('normalise: daily keeps request order across cities', () => {
  const r = normalise(fixture('weather-two.json'), two, NOW);
  assert.equal(r.cities.paris.daily[0].code, 71);
  assert.equal(r.cities.warsaw.daily[0].code, 61);
});

test('normalise: a missing or junk daily block gives []', () => {
  for (const daily of [undefined, null, {}, 'x', [], { time: 'x' }, { time: [] }]) {
    assert.deepEqual(normalise({ current: cur, daily }, [warsaw], NOW).cities.warsaw.daily, [], String(JSON.stringify(daily)));
  }
});

test('normalise: arrays of unequal length give nulls, not a crash', () => {
  const daily = { time: ['2026-10-18', '2026-10-19'], weather_code: [1], temperature_2m_max: [5, 6], temperature_2m_min: null };
  const rows = normalise({ current: cur, daily }, [warsaw], NOW).cities.warsaw.daily;
  assert.deepEqual(rows, [
    { date: '2026-10-18', code: 1, high: 5, low: null },
    { date: '2026-10-19', code: null, high: 6, low: null },
  ]);
});

test('normalise: a row with a bad date is dropped, a bad high is null, five at most', () => {
  const time = ['2026-10-18', 'tomorrow', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'];
  const daily = { time, weather_code: time.map(() => 1), temperature_2m_max: time.map((_, i) => (i === 0 ? '9' : i)), temperature_2m_min: time.map(() => 0) };
  const rows = normalise({ current: cur, daily }, [warsaw], NOW).cities.warsaw.daily;
  assert.equal(rows.length, 5);
  assert.equal(rows[0].high, null);
  assert.ok(rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date)));
  assert.equal(rows[1].date, '2026-10-20');
});

test('openMeteoUrl asks for wind in the one current list, exactly once, in one request', () => {
  const url = openMeteoUrl([warsaw]);
  assert.equal(url.split('wind_speed_10m,wind_direction_10m').length - 1, 1);
  assert.equal(new URL(url).searchParams.getAll('current').length, 1);
  assert.equal(new URL(url).host, 'api.open-meteo.com');
});

test('normalise: wind speed and direction pass through when present', () => {
  const r = normalise(fixture('weather-storm.json'), [warsaw], NOW);
  assert.equal(r.cities.warsaw.windSpeed, 31);
  assert.equal(r.cities.warsaw.windDir, 270);
  assert.equal(r.v, 1);
});

test('normalise: an answer without wind gives null, not an error', () => {
  const r = normalise(fixture('weather-nowind.json'), [warsaw], NOW);
  assert.equal(r.ok, true);
  assert.equal(r.cities.warsaw.windSpeed, null);
  assert.equal(r.cities.warsaw.windDir, null);
  assert.equal(r.cities.warsaw.temperature, 12.3);
});

test('normalise: a string wind direction is null', () => {
  const r = normalise({ current: { temperature_2m: 1, wind_speed_10m: 5, wind_direction_10m: '270' } }, [warsaw], NOW);
  assert.equal(r.cities.warsaw.windDir, null);
  assert.equal(r.cities.warsaw.windSpeed, 5);
});

test('normalise: a non-finite wind speed is null', () => {
  const r = normalise({ current: { temperature_2m: 1, wind_speed_10m: Infinity } }, [warsaw], NOW);
  assert.equal(r.cities.warsaw.windSpeed, null);
});
