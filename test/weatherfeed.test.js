import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WeatherFeed, REFRESH_MS } from '../src/weatherfeed.js';
import { EMPTY, NO_ANCHOR, cloudTravel } from '../src/weather.js';

const body = (temp, code = 61) => ({ v: 1, cities: { warsaw: { temperature: temp, code, cloudCover: 50, isDay: 1 } } });
const windy = (temp, speed, dir, fetchedAt) => ({ v: 1, ...(fetchedAt === undefined ? {} : { fetchedAt }), cities: { warsaw: { temperature: temp, code: 3, cloudCover: 85, isDay: 1, windSpeed: speed, windDir: dir } } });
const okFetch = (b) => async () => ({ ok: true, json: async () => b });
const settle = () => new Promise((r) => setTimeout(r, 0));

test('nextRefreshAt is fifteen minutes on', () => {
  const f = new WeatherFeed({ fetchImpl: okFetch(body(1)) });
  assert.equal(f.nextRefreshAt(1000), 1000 + 15 * 60 * 1000);
  assert.equal(REFRESH_MS, 900000);
});

test('get returns EMPTY for an unknown id and before any answer', () => {
  const f = new WeatherFeed({ fetchImpl: okFetch(body(1)) });
  assert.equal(f.get('warsaw'), EMPTY);
  assert.equal(f.get('nowhere'), EMPTY);
});

test('start fetches the relative address once and applies the answer', async () => {
  const urls = [];
  const f = new WeatherFeed({ fetchImpl: async (u) => { urls.push(u); return { ok: true, json: async () => body(12.3) }; }, now: () => 5 });
  await f.start();
  assert.deepEqual(urls, ['/api/weather']);
  assert.equal(f.get('warsaw').temperature, 12.3);
  assert.equal(f.get('warsaw').kind, 'rain');
});

test('tick skips when hidden, skips when not due, refetches when due and visible', async () => {
  let n = 0;
  let visible = true;
  let clock = 0;
  const f = new WeatherFeed({ fetchImpl: async () => { n += 1; return { ok: true, json: async () => body(n) }; }, now: () => clock, visible: () => visible });
  await f.start();
  assert.equal(n, 1);
  assert.equal(f.tick(REFRESH_MS - 1), null);
  visible = false;
  assert.equal(f.tick(REFRESH_MS + 1), null, 'a hidden tab never fetches');
  assert.equal(n, 1);
  visible = true;
  clock = REFRESH_MS + 1;
  await f.tick(REFRESH_MS + 1);
  assert.equal(n, 2);
  assert.equal(f.get('warsaw').temperature, 2);
});

test('a failed or malformed answer keeps the last good one and never throws', async () => {
  let mode = 'ok';
  let clock = 0;
  const f = new WeatherFeed({
    fetchImpl: async () => {
      if (mode === 'throw') throw new Error('offline');
      if (mode === '500') return { ok: false };
      if (mode === 'junk') return { ok: true, json: async () => ({ nope: 1 }) };
      return { ok: true, json: async () => body(7) };
    },
    now: () => clock,
  });
  await f.start();
  const rev = f.revision;
  for (const m of ['throw', '500', 'junk']) {
    mode = m;
    clock += REFRESH_MS + 1;
    await f.tick(clock);
    assert.equal(f.get('warsaw').temperature, 7, m);
  }
  assert.equal(f.revision, rev);
});

test('revision bumps only on a changed answer', async () => {
  const f = new WeatherFeed({ fetchImpl: okFetch(body(1)) });
  assert.equal(f.applyResponse(body(1)), true);
  assert.equal(f.revision, 1);
  assert.equal(f.applyResponse(body(1)), false);
  assert.equal(f.revision, 1);
  assert.equal(f.applyResponse(body(2)), true);
  assert.equal(f.revision, 2);
  assert.equal(f.applyResponse({ v: 2, cities: {} }), false);
  assert.equal(f.applyResponse(null), false);
  await settle();
});

test('stop silences tick', async () => {
  const f = new WeatherFeed({ fetchImpl: okFetch(body(1)) });
  await f.start();
  f.stop();
  assert.equal(f.tick(REFRESH_MS * 5), null);
});

test('daily rows reach get(id).daily, default to [], and a change bumps revision', async () => {
  const daily = (high) => [{ date: '2026-10-18', code: 61, high, low: 5, sunrise: '07:05' }];
  const withDaily = (high) => ({ v: 1, cities: { warsaw: { temperature: 1, code: 61, cloudCover: 1, isDay: 1, daily: daily(high) } } });
  const f = new WeatherFeed({ fetchImpl: okFetch(withDaily(14)) });
  await f.start();
  assert.equal(f.get('warsaw').daily[0].kind, 'rain');
  assert.equal(f.get('warsaw').daily[0].sunrise, '07:05');
  assert.equal(f.get('warsaw').daily[0].sunset, null);
  const rev = f.revision;
  f.applyResponse(withDaily(15));
  assert.ok(f.revision > rev, 'only daily changed');
  const g = new WeatherFeed({ fetchImpl: okFetch(body(1)) });
  await g.start();
  assert.deepEqual(g.get('warsaw').daily, []);
});

test('dew: fog then rain records fogClearedAt at the injected now()', () => {
  let clock = 1000;
  const f = new WeatherFeed({ fetchImpl: okFetch(body(1)), now: () => clock });
  f.applyResponse(body(6, 45));
  clock = 5000;
  f.applyResponse(body(8, 61));
  assert.equal(f.fogClearedAt.get('warsaw'), 5000);
  assert.equal(f.dewSince('warsaw', 65000), 60000);
});

test('dew: rain then clear records nothing', () => {
  const f = new WeatherFeed({ fetchImpl: okFetch(body(1)), now: () => 1 });
  f.applyResponse(body(8, 61));
  f.applyResponse(body(9, 0));
  assert.equal(f.fogClearedAt.size, 0);
  assert.equal(f.dewSince('warsaw', 10), null);
});

test('dew: a first answer that is fog records nothing', () => {
  const f = new WeatherFeed({ fetchImpl: okFetch(body(1)), now: () => 1 });
  f.applyResponse(body(6, 45));
  assert.equal(f.fogClearedAt.size, 0);
});

test('dew: fog, rain, fog clears the entry so a later clearing starts a fresh timer', () => {
  let clock = 0;
  const f = new WeatherFeed({ fetchImpl: okFetch(body(1)), now: () => clock });
  f.applyResponse(body(6, 45));
  clock = 100;
  f.applyResponse(body(8, 61));
  assert.equal(f.fogClearedAt.size, 1);
  clock = 200;
  f.applyResponse(body(6, 48));
  assert.equal(f.fogClearedAt.size, 0);
  clock = 300;
  f.applyResponse(body(8, 0));
  assert.equal(f.fogClearedAt.get('warsaw'), 300);
});

test('dew: dewSince for an unknown id is null', () => {
  const f = new WeatherFeed({ fetchImpl: okFetch(body(1)) });
  assert.equal(f.dewSince('nowhere', 123), null);
});

test('dew: a failed refresh or a malformed body records nothing and keeps an existing timer', async () => {
  let clock = 0;
  let mode = 'ok';
  const f = new WeatherFeed({ fetchImpl: async () => { if (mode === 'throw') throw new Error('down'); return { ok: true, json: async () => ({ v: 9 }) }; }, now: () => clock });
  f.applyResponse(body(6, 45));
  clock = 50;
  f.applyResponse(body(8, 61));
  mode = 'throw';
  await f.refresh();
  mode = 'ok';
  await f.refresh();
  assert.equal(f.fogClearedAt.get('warsaw'), 50);
  assert.equal(f.get('warsaw').code, 61);
});

test('dew: fog then a code-less answer records nothing, and a later real answer still clears the fog', () => {
  let clock = 0;
  const f = new WeatherFeed({ fetchImpl: okFetch(body(1)), now: () => clock });
  f.applyResponse(body(6, 45));
  clock = 100;
  f.applyResponse({ v: 1, cities: { warsaw: { temperature: 7, code: null } } });
  assert.equal(f.fogClearedAt.size, 0);
  clock = 200;
  f.applyResponse(body(8, 61));
  assert.equal(f.fogClearedAt.get('warsaw'), 200);
});

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);

test('cloudAnchor: NO_ANCHOR before any answer and for an unknown id', () => {
  const f = new WeatherFeed({ fetchImpl: okFetch(body(1)), now: () => 5 });
  assert.equal(f.cloudAnchor('warsaw'), NO_ANCHOR);
  f.applyResponse(windy(10, 30, 270, '2026-06-15T10:20:00.000Z'));
  assert.equal(f.cloudAnchor('nowhere'), NO_ANCHOR);
});

test('cloudAnchor: a first answer starts from the shared origin whatever its fetchedAt', () => {
  for (const fa of ['2026-06-15T10:20:00.000Z', undefined, 42, 'yesterday']) {
    const f = new WeatherFeed({ fetchImpl: okFetch(body(1)), now: () => 999 });
    f.applyResponse(windy(10, 30, 270, fa), 1234);
    assert.equal(f.cloudAnchor('warsaw').sinceMs, 0);
    assert.equal(f.cloudAnchor('warsaw').carry, 0);
  }
});

test('cloudAnchor: two pages with the same wind agree across a refresh', () => {
  const a = new WeatherFeed({ fetchImpl: okFetch(body(1)), now: () => 0 });
  a.applyResponse(windy(10, 30, 270, '2026-06-15T10:00:00.000Z'), Date.parse('2026-06-15T10:00:00.000Z'));
  a.applyResponse(windy(10, 30, 270, '2026-06-15T10:15:00.000Z'), Date.parse('2026-06-15T10:15:00.000Z'));
  const b = new WeatherFeed({ fetchImpl: okFetch(body(1)), now: () => 0 });
  b.applyResponse(windy(10, 30, 270, '2026-06-15T10:15:00.000Z'), Date.parse('2026-06-15T10:20:00.000Z'));
  const t = Date.parse('2026-06-15T10:30:00.000Z');
  assert.equal(cloudTravel(30, 270, t, a.cloudAnchor('warsaw')), cloudTravel(30, 270, t, b.cloudAnchor('warsaw')));
});

test('cloudAnchor: a changed wind re-anchors at the landing moment with the old travel as carry', () => {
  const f = new WeatherFeed({ fetchImpl: okFetch(body(1)), now: () => 0 });
  f.applyResponse(windy(10, 30, 270, '2026-06-15T10:20:00.000Z'));
  const first = f.cloudAnchor('warsaw');
  f.applyResponse(windy(10, 12, 90), 100000);
  const a = f.cloudAnchor('warsaw');
  assert.equal(a.sinceMs, 100000);
  const old = cloudTravel(30, 270, 100000, first);
  near(a.carry, old);
  near(cloudTravel(12, 90, 100000, a), old);
});

test('cloudAnchor: an unchanged wind keeps its anchor', () => {
  const f = new WeatherFeed({ fetchImpl: okFetch(body(1)), now: () => 0 });
  f.applyResponse(windy(10, 30, 270, '2026-06-15T10:20:00.000Z'), 5);
  const first = { ...f.cloudAnchor('warsaw') };
  f.applyResponse(windy(14, 30, 270), 100000);
  assert.deepEqual({ ...f.cloudAnchor('warsaw') }, first);
  const rev = f.revision;
  f.applyResponse(windy(14, 30, 270), 200000);
  assert.deepEqual({ ...f.cloudAnchor('warsaw') }, first);
  assert.equal(f.revision, rev);
});

test('cloudAnchor: a fresh feed forgets every anchor', () => {
  const f = new WeatherFeed({ fetchImpl: okFetch(body(1)), now: () => 0 });
  f.applyResponse(windy(10, 30, 270, '2026-06-15T10:20:00.000Z'));
  f.applyResponse(windy(10, 12, 90), 100000);
  assert.notEqual(f.cloudAnchor('warsaw'), NO_ANCHOR);
  assert.equal(new WeatherFeed({ fetchImpl: okFetch(body(1)) }).cloudAnchor('warsaw'), NO_ANCHOR);
});
