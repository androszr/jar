import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, weatherKind, cloudAmount, formatTemp, EMPTY, isUsable, fromEntry, normaliseDaily, dayName, forecastCells } from '../src/weather.js';

const CLASSES = {
  clear: [0],
  cloud: [1, 2, 3],
  fog: [45, 48],
  drizzle: [51, 53, 55, 56, 57],
  rain: [61, 63, 65, 66, 67, 80, 81, 82],
  snow: [71, 73, 75, 77, 85, 86],
  storm: [95, 96, 99],
};

for (const [kind, codes] of Object.entries(CLASSES)) {
  test(`WMO codes ${codes.join(', ')} are ${kind}`, () => {
    assert.ok(KINDS.includes(kind));
    for (const code of codes) assert.equal(weatherKind(code), kind, `code ${code}`);
  });
}

test('unknown and missing codes fall back to cloud', () => {
  for (const c of [null, undefined, NaN, 'rain', 4, 100, -1, 60]) assert.equal(weatherKind(c), 'cloud', String(c));
});

test('cloudAmount: reported cover wins, else a figure for the kind', () => {
  assert.equal(cloudAmount(80, 'rain'), 0.8);
  assert.equal(cloudAmount(0, 'cloud'), 0);
  assert.equal(cloudAmount(150, 'cloud'), 1);
  assert.equal(cloudAmount(-5, 'cloud'), 0);
  assert.equal(cloudAmount(null, 'clear'), 0);
  assert.ok(cloudAmount(null, 'storm') >= cloudAmount(null, 'cloud'));
});

test('formatTemp rounds, signs and dashes', () => {
  assert.equal(formatTemp(12.3), '12°');
  assert.equal(formatTemp(-3.6), '-4°');
  assert.equal(formatTemp(-0.4), '0°');
  assert.equal(formatTemp(0), '0°');
  assert.equal(formatTemp(null), '—°');
  assert.equal(formatTemp(NaN), '—°');
  assert.equal(formatTemp(undefined), '—°');
  assert.equal(formatTemp('12'), '—°');
});

test('isUsable and EMPTY', () => {
  assert.equal(isUsable({ temperature: 3 }), true);
  assert.equal(isUsable({ temperature: null }), false);
  assert.equal(isUsable(null), false);
  assert.equal(isUsable(EMPTY), false);
  assert.equal(EMPTY.kind, 'cloud');
  assert.equal(EMPTY.known, false);
  assert.equal(EMPTY.windSpeed, null);
  assert.equal(EMPTY.windDir, null);
});

test('fromEntry keeps only numbers and tolerates junk', () => {
  const w = fromEntry({ temperature: 12.3, code: 61, cloudCover: 80, isDay: 1, extra: 'x' });
  assert.deepEqual([w.temperature, w.code, w.kind, w.known], [12.3, 61, 'rain', true]);
  assert.equal(fromEntry({ temperature: '5' }).temperature, null);
  assert.equal(fromEntry(null), EMPTY);
  assert.equal(fromEntry({}).known, false);
});

test('a null code with a temperature present is not clear', () => {
  const w = fromEntry({ temperature: 9, code: null, cloudCover: 40, isDay: 1 });
  assert.notEqual(w.kind, 'clear');
  assert.equal(w.kind, 'cloud');
  assert.equal(w.known, false);
  assert.equal(w.temperature, 9);
});

test('dayName works from the date string alone', () => {
  const names = ['SUN', 'MON', 'TUE', 'WED', 'THU'];
  names.forEach((n, i) => assert.equal(dayName(`2026-10-${18 + i}`), n));
  assert.equal(dayName('2026-10-24'), 'SAT');
  assert.equal(dayName('nope'), '—');
  assert.equal(dayName(null), '—');
});

test('forecastCells: EMPTY is five dash cells, short lists pad, -0.4 prints 0°', () => {
  const dash = { day: '—', kind: 'cloud', high: '—°', low: '—°' };
  assert.deepEqual(forecastCells(EMPTY), [dash, dash, dash, dash, dash]);
  assert.deepEqual(forecastCells(null), [dash, dash, dash, dash, dash]);
  const w = fromEntry({ temperature: 1, code: 0, daily: [
    { date: '2026-10-18', code: 61, high: 14.2, low: -0.4 },
    { date: '2026-10-19', code: 71, high: 2, low: -3 },
    { date: '2026-10-20', code: 95, high: 8, low: 3 },
  ] });
  const cells = forecastCells(w);
  assert.equal(cells.length, 5);
  assert.deepEqual(cells[0], { day: 'SUN', kind: 'rain', high: '14°', low: '0°' });
  assert.equal(cells[1].kind, 'snow');
  assert.equal(cells[2].kind, 'storm');
  assert.deepEqual(cells[3], dash);
});

test('normaliseDaily and fromEntry tolerate junk; EMPTY.daily is frozen and empty', () => {
  assert.deepEqual(normaliseDaily('junk'), []);
  assert.deepEqual(normaliseDaily([null, { date: 'x' }, { date: '2026-10-18', code: 0, high: '3', low: 1 }]),
    [{ date: '2026-10-18', code: 0, high: null, low: 1, kind: 'clear' }]);
  assert.deepEqual(fromEntry({ temperature: 1, daily: 'junk' }).daily, []);
  assert.deepEqual(fromEntry({ temperature: 1 }).daily, []);
  assert.equal(Object.isFrozen(EMPTY.daily), true);
  assert.equal(EMPTY.daily.length, 0);
});

test('forecastCells drops days before today and pads the end', () => {
  const w = fromEntry({ temperature: 1, code: 0, daily: [
    { date: '2026-10-18', code: 61, high: 14, low: 8 },
    { date: '2026-10-19', code: 3, high: 12, low: 5 },
    { date: '2026-10-20', code: 0, high: 9, low: 2 },
    { date: '2026-10-21', code: 71, high: 2, low: -2 },
    { date: '2026-10-22', code: 95, high: 8, low: 3 },
  ] });
  const cells = forecastCells(w, '2026-10-19');
  assert.equal(cells[0].day, 'MON');
  assert.equal(cells[3].day, 'THU');
  assert.equal(cells[4].day, '—');
  assert.equal(forecastCells(w, '2026-10-18')[0].day, 'SUN');
});

test('fromEntry carries wind and defaults it to null', () => {
  const w = fromEntry({ temperature: 1, code: 61, windSpeed: 12, windDir: 270 });
  assert.deepEqual([w.windSpeed, w.windDir], [12, 270]);
  const n = fromEntry({ temperature: 1, windSpeed: '12' });
  assert.deepEqual([n.windSpeed, n.windDir], [null, null]);
});
