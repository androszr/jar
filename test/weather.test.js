import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, weatherKind, cloudAmount, formatTemp, EMPTY, isUsable, fromEntry, normaliseDaily, dayName, forecastCells, forecastSentence, sunTimesFor, formatSwell, windCompass, tidesFor, tideSentence, formatTideStrip, formatTideHeight, tideCurve, formatRainChance, formatWindSpeed } from '../src/weather.js';

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
  const dash = { day: '—', kind: 'cloud', high: '—°', low: '—°', today: false, swell: null, rain: null, wind: null, windArrow: null, windFrom: null };
  assert.deepEqual(forecastCells(EMPTY), [dash, dash, dash, dash, dash]);
  assert.deepEqual(forecastCells(null), [dash, dash, dash, dash, dash]);
  const w = fromEntry({ temperature: 1, code: 0, daily: [
    { date: '2026-10-18', code: 61, high: 14.2, low: -0.4 },
    { date: '2026-10-19', code: 71, high: 2, low: -3 },
    { date: '2026-10-20', code: 95, high: 8, low: 3 },
  ] });
  const cells = forecastCells(w);
  assert.equal(cells.length, 5);
  assert.deepEqual(cells[0], { day: 'SUN', kind: 'rain', high: '14°', low: '0°', today: false, swell: null, rain: null, wind: null, windArrow: null, windFrom: null });
  assert.equal(cells[1].kind, 'snow');
  assert.equal(cells[2].kind, 'storm');
  assert.deepEqual(cells[3], dash);
});

test('normaliseDaily and fromEntry tolerate junk; EMPTY.daily is frozen and empty', () => {
  assert.deepEqual(normaliseDaily('junk'), []);
  assert.deepEqual(normaliseDaily([null, { date: 'x' }, { date: '2026-10-18', code: 0, high: '3', low: 1 }]),
    [{ date: '2026-10-18', code: 0, high: null, low: 1, sunrise: null, sunset: null, rainChance: null, windMax: null, windMaxDir: null, kind: 'clear' }]);
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

const sunW = () => fromEntry({ temperature: 1, code: 0, daily: [
  { date: '2026-10-18', code: 61, high: 14, low: 8, sunrise: '07:05', sunset: '17:32' },
  { date: '2026-10-19', code: 3, high: 12, low: 5, sunrise: '07:07', sunset: '17:30' },
  { date: '2026-10-20', code: 0, high: 9, low: 2, sunrise: '07:09', sunset: null },
] });

test('forecastCells marks only the first cell, only when it is today', () => {
  const w = sunW();
  assert.deepEqual(forecastCells(w, '2026-10-18').map((c) => c.today), [true, false, false, false, false]);
  const c = forecastCells(w, '2026-10-19');
  assert.equal(c[0].today, true);
  assert.equal(c[0].day, 'MON');
  assert.ok(forecastCells(w).every((k) => !k.today));
  assert.ok(forecastCells(EMPTY, '2026-10-18').every((k) => !k.today));
  assert.ok(forecastCells(w, '2026-10-17').every((k) => !k.today));
});

test('forecastSentence says today before the flagged day only', () => {
  const w = sunW();
  const s = forecastSentence(forecastCells(w, '2026-10-18'));
  assert.ok(s.startsWith('Next five days: today '));
  assert.equal((s.match(/today /g) || []).length, 1);
  assert.ok(s.endsWith('.'));
  const plain = forecastSentence(forecastCells(w));
  assert.ok(!plain.includes('today'));
  assert.equal(plain, s.replace('today ', ''));
  const cs = forecastCells(w, '2026-10-18');
  cs[0].today = false;
  cs[2].today = true;
  const s2 = forecastSentence(cs);
  assert.equal((s2.match(/today /g) || []).length, 1);
  assert.ok(s2.includes(`, today ${cs[2].day} `));
  assert.equal(forecastSentence(forecastCells(EMPTY)), '');
  assert.equal(forecastSentence([]), '');
  assert.equal(forecastSentence(null), '');
});

test('sunTimesFor picks today\'s row and needs both times', () => {
  const w = sunW();
  assert.deepEqual(sunTimesFor(w, '2026-10-18'), { sunrise: '07:05', sunset: '17:32' });
  assert.deepEqual(sunTimesFor(w, '2026-10-19'), { sunrise: '07:07', sunset: '17:30' });
  assert.equal(sunTimesFor(w, '2026-10-20'), null);
  assert.equal(sunTimesFor(EMPTY, '2026-10-18'), null);
  assert.equal(sunTimesFor(null), null);
});

test('normaliseDaily keeps HH:MM sun times and nulls junk', () => {
  const row = (v) => normaliseDaily([{ date: '2026-10-18', code: 0, high: 1, low: 0, sunrise: v, sunset: v }])[0];
  assert.equal(row('07:05').sunrise, '07:05');
  for (const v of ['7:05', '2026-10-18T07:05', 705, undefined]) {
    assert.equal(row(v).sunrise, null, String(v));
    assert.equal(row(v).sunset, null, String(v));
  }
});

test('the sea reading (swell): EMPTY has none, fromEntry folds it and tolerates junk', () => {
  assert.equal(EMPTY.sea, null);
  assert.deepEqual(fromEntry({ sea: { waveHeight: 4.2 } }).sea, { waveHeight: 4.2, wavePeriod: null, waveDir: null, daily: [] });
  assert.equal(fromEntry({}).sea, null);
  assert.equal(fromEntry({ sea: 'junk' }).sea, null);
  assert.equal(fromEntry({ sea: { waveHeight: 'x' } }).sea.waveHeight, null);
});

test('swell: formatSwell gives height and period, height alone, nothing', () => {
  assert.equal(formatSwell({ waveHeight: 2.37, wavePeriod: 12.4 }), '2.4 m · 12 s');
  assert.equal(formatSwell({ waveHeight: 2.37, wavePeriod: null }), '2.4 m');
  assert.equal(formatSwell({ waveHeight: null, wavePeriod: 12 }), null);
  assert.equal(formatSwell(null), null);
});

test('the sea daily rows: folded by fromEntry, junk gives [], the swell joins forecast cells by date', () => {
  const row = { date: '2026-11-08', waveHeightMax: 2.4, wavePeriodMax: 12, tides: [] };
  assert.deepEqual(fromEntry({ sea: { waveHeight: 1, daily: [row] } }).sea.daily, [row]);
  assert.deepEqual(fromEntry({ sea: { waveHeight: 1, daily: 'junk' } }).sea.daily, []);
  const w = fromEntry({
    temperature: 10,
    daily: [{ date: '2026-11-08', code: 0, high: 1, low: 0 }, { date: '2026-11-09', code: 0, high: 1, low: 0 }],
    sea: { waveHeight: 1, daily: [row] },
  });
  const cells = forecastCells(w, '2026-11-08');
  assert.deepEqual(cells[0].swell, { height: '2.4 m', period: '12 s' });
  assert.equal(cells[1].swell, null, 'a date with no marine row');
  assert.ok(forecastCells(EMPTY).every((c) => c.swell === null));
});

test('forecastSentence says the swell after a day that has one', () => {
  const cs = [{ day: 'MON', high: '18°', low: '12°', today: true, swell: { height: '4.2 m', period: '14 s' } }, { day: 'TUE', high: '17°', low: '11°', today: false, swell: null }];
  assert.equal(forecastSentence(cs), 'Next five days: today MON 18° to 12° swell 4.2 m, TUE 17° to 11°.');
});

test('normaliseDaily keeps rain and wind through num and defaults them to null', () => {
  const [a, b] = normaliseDaily([
    { date: '2026-10-18', code: 0, rainChance: 40, windMax: 23.4, windMaxDir: 315 },
    { date: '2026-10-19', code: 0, rainChance: '40', windMax: NaN, windMaxDir: undefined },
  ]);
  assert.deepEqual([a.rainChance, a.windMax, a.windMaxDir], [40, 23.4, 315]);
  assert.deepEqual([b.rainChance, b.windMax, b.windMaxDir], [null, null, null]);
});

test('normaliseSeaDaily keeps valid tides, drops the rest, defaults to []', () => {
  const tides = [{ time: '03:12', kind: 'high', height: 1.5 }, { time: '9:25', kind: 'low' }, { time: '09:25', kind: 'mid' }, { time: '09:25', kind: 'low', height: 'x' }, null];
  const r = fromEntry({ sea: { daily: [{ date: '2026-10-18', tides }, { date: '2026-10-19', tides: 'junk' }, { date: '2026-10-20' }] } }).sea.daily;
  assert.deepEqual(r[0].tides, [{ time: '03:12', kind: 'high', height: 1.5 }, { time: '09:25', kind: 'low', height: null }]);
  assert.deepEqual(r[1].tides, []);
  assert.deepEqual(r[2].tides, []);
});

test('windCompass: eight points, arrows point where the wind blows to, null without a degree', () => {
  assert.deepEqual(windCompass(0), { abbr: 'N', name: 'north', arrow: '↓' });
  assert.deepEqual(windCompass(45), { abbr: 'NE', name: 'north-east', arrow: '↙' });
  assert.deepEqual(windCompass(315), { abbr: 'NW', name: 'north-west', arrow: '↘' });
  assert.equal(windCompass(359.9).abbr, 'N');
  assert.equal(windCompass(-45).abbr, 'NW');
  assert.equal(windCompass(null), null);
  assert.equal(windCompass('NW'), null);
  assert.equal(windCompass(NaN), null);
});

test('formatRainChance and formatWindSpeed round, and give null for no reading', () => {
  assert.equal(formatRainChance(39.6), '40%');
  assert.equal(formatRainChance(0), '0%');
  assert.equal(formatRainChance(null), null);
  assert.equal(formatWindSpeed(23.4), '23 km/h');
  assert.equal(formatWindSpeed(undefined), null);
});

test('forecastCells carries rain, wind, arrow and direction, and nulls for a row without them', () => {
  const w = fromEntry({ temperature: 1, daily: [
    { date: '2026-10-18', code: 61, high: 14, low: 8, rainChance: 40, windMax: 23.4, windMaxDir: 315 },
    { date: '2026-10-19', code: 61, high: 14, low: 8, rainChance: null, windMax: 10, windMaxDir: null },
  ] });
  const cells = forecastCells(w, '2026-10-18');
  assert.deepEqual([cells[0].rain, cells[0].wind, cells[0].windArrow, cells[0].windFrom], ['40%', '23 km/h', '↘', 'north-west']);
  assert.deepEqual([cells[1].rain, cells[1].wind, cells[1].windArrow, cells[1].windFrom], [null, '10 km/h', null, null]);
  assert.ok(forecastCells(EMPTY).every((c) => c.rain === null && c.wind === null));
});

test('tidesFor picks today\'s row, else []', () => {
  const t = [{ time: '03:12', kind: 'high', height: 1.5 }];
  const w = fromEntry({ temperature: 1, sea: { daily: [{ date: '2026-10-18', tides: t }, { date: '2026-10-19', tides: [] }] } });
  assert.deepEqual(tidesFor(w, '2026-10-18'), t);
  assert.deepEqual(tidesFor(w, '2026-10-19'), []);
  assert.deepEqual(tidesFor(w, '2026-10-25'), []);
  assert.deepEqual(tidesFor(w), []);
  assert.deepEqual(tidesFor(EMPTY, '2026-10-18'), []);
  assert.deepEqual(tidesFor(null, '2026-10-18'), []);
});

test('formatTideHeight: one decimal with the unit, null otherwise', () => {
  assert.equal(formatTideHeight(3.14), '3.1 m');
  assert.equal(formatTideHeight(-0.44), '-0.4 m');
  assert.equal(formatTideHeight(-0.04), '0.0 m');
  assert.equal(formatTideHeight(null), null);
  assert.equal(formatTideHeight(NaN), null);
});

const HT = [{ time: '03:12', kind: 'high', height: 3.1 }, { time: '09:25', kind: 'low', height: 0.4 }, { time: '15:37', kind: 'high', height: 3.3 }, { time: '21:50', kind: 'low', height: 0.6 }];
const BT = HT.map(({ time, kind }) => ({ time, kind, height: null }));

test('formatTideStrip and tideSentence: both kinds, one kind, none, with and without heights', () => {
  assert.deepEqual(formatTideStrip(HT), { highs: ['03:12 3.1 m', '15:37 3.3 m'], lows: ['09:25 0.4 m', '21:50 0.6 m'] });
  assert.deepEqual(formatTideStrip(BT), { highs: ['03:12', '15:37'], lows: ['09:25', '21:50'] });
  assert.equal(formatTideStrip([]), null);
  assert.equal(tideSentence(HT), 'High tide 03:12 at 3.1 metres and 15:37 at 3.3 metres, low tide 09:25 at 0.4 metres and 21:50 at 0.6 metres.');
  assert.equal(tideSentence([{ kind: 'low', time: '09:25', height: -0.04 }]), 'Low tide 09:25 at 0.0 metres.');
  assert.equal(tideSentence(BT), 'High tide 03:12 and 15:37, low tide 09:25 and 21:50.');
  assert.equal(tideSentence([HT[0]]), 'High tide 03:12 at 3.1 metres.');
  assert.equal(tideSentence([BT[1]]), 'Low tide 09:25.');
  assert.equal(tideSentence([]), '');
});

test('tideCurve: null without two heights, else a smooth day through the extremes', () => {
  assert.equal(tideCurve([]), null);
  assert.equal(tideCurve([HT[0]]), null);
  assert.equal(tideCurve(BT), null);
  assert.equal(tideCurve(null), null);
  const c = tideCurve(HT);
  assert.equal(c.points.length, 48);
  assert.equal(c.min, 0.4);
  assert.equal(c.max, 3.3);
  assert.equal(c.points[0].t, 0);
  assert.equal(c.points[47].t, 1);
  const mins = (s) => (Number(s.slice(0, 2)) * 60 + Number(s.slice(3))) / 1440;
  for (const e of HT) {
    const near = c.points.reduce((a, p) => (Math.abs(p.t - mins(e.time)) < Math.abs(a.t - mins(e.time)) ? p : a));
    assert.ok(Math.abs(near.h - e.height) < 0.05, `${e.time}: ${near.h} vs ${e.height}`);
  }
  for (let i = 0; i + 1 < HT.length; i++) {
    const seg = c.points.filter((p) => p.t >= mins(HT[i].time) && p.t <= mins(HT[i + 1].time));
    const up = HT[i + 1].height > HT[i].height;
    for (let k = 1; k < seg.length; k++) assert.ok(up ? seg[k].h >= seg[k - 1].h - 1e-9 : seg[k].h <= seg[k - 1].h + 1e-9);
  }
  for (const n of [null, -0.1, 1, NaN]) assert.equal(tideCurve(HT, n).now, null);
  const mid = tideCurve(HT, 0.5).now;
  assert.equal(mid.t, 0.5);
  const a = mins('09:25');
  const b = mins('15:37');
  const analytic = 0.4 + (3.3 - 0.4) * (1 - Math.cos(Math.PI * ((0.5 - a) / (b - a)))) / 2;
  assert.ok(Math.abs(mid.h - analytic) < 0.05);
});

test('forecastSentence speaks rain, wind with its direction, then swell', () => {
  const cs = [
    { day: 'MON', high: '18°', low: '12°', today: true, rain: '40%', wind: '23 km/h', windFrom: 'north-west', swell: { height: '4.2 m', period: '14 s' } },
    { day: 'TUE', high: '17°', low: '11°', today: false, swell: null },
    { day: 'WED', high: '16°', low: '10°', today: false, rain: null, wind: '9 km/h', windFrom: null, swell: null },
  ];
  assert.equal(forecastSentence(cs), 'Next five days: today MON 18° to 12° rain 40% wind 23 km/h from the north-west swell 4.2 m, TUE 17° to 11°, WED 16° to 10° wind 9 km/h.');
});

test('forecastSentence: the plan sentence, exactly, for rain, wind from a direction and swell', () => {
  const cs = [
    { day: 'MON', high: '18°', low: '12°', today: true, rain: '40%', wind: '23 km/h', windFrom: 'north-west', swell: { height: '4.2 m', period: '14 s' } },
    { day: 'TUE', high: '17°', low: '11°', today: false, rain: null, wind: null, windFrom: null, swell: null },
  ];
  assert.equal(forecastSentence(cs), 'Next five days: today MON 18° to 12° rain 40% wind 23 km/h from the north-west swell 4.2 m, TUE 17° to 11°.');
});

test('normaliseSeaDaily keeps at most six tide entries a day, in time order', () => {
  const tides = Array.from({ length: 9 }, (_, i) => ({ time: `${String(20 - i).padStart(2, '0')}:00`, kind: i % 2 ? 'low' : 'high', height: 1 }));
  const r = fromEntry({ sea: { daily: [{ date: '2026-10-18', tides }] } }).sea.daily[0].tides;
  assert.equal(r.length, 6);
  assert.deepEqual(r.map((t) => t.time), ['12:00', '13:00', '14:00', '15:00', '16:00', '17:00']);
});
