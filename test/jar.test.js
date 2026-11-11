import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JAR, labelLines, bodyRect, QUALITY } from '../src/jar.js';
import { TABLE_Y, WINDOW } from '../src/shed.js';
import { TABLE_FOOT } from '../src/shelf.js';
import { SCENE } from '../src/framing.js';
import { findCity } from '../src/cities/index.js';
import { EMPTY } from '../src/weather.js';
import { localTimeText } from '../src/placeclock.js';
import { fitSize } from '../src/look/lantern/draw.js';

const warsaw = findCity('warsaw');
const nazare = findCity('nazare');
const NOW = Date.UTC(2026, 5, 15, 12, 5);

test('labelLines with weather: [TITLE, temperature, HH:MM in the city zone]', () => {
  const lines = labelLines(warsaw, { temperature: 12.3 }, NOW);
  assert.deepEqual(lines, ['WARSAW, POLAND', '12°', '14:05']);
});

test('labelLines without weather reads a dash for the temperature', () => {
  assert.deepEqual(labelLines(warsaw, EMPTY, NOW), ['WARSAW, POLAND', '—°', '14:05']);
  assert.deepEqual(labelLines(warsaw, undefined, NOW)[1], '—°');
});

test('the jar fits above the table line and inside the scene', () => {
  assert.ok(JAR.h < TABLE_Y, 'the jar is shorter than the wall above the table');
  assert.ok(TABLE_FOOT - JAR.h > 0);
  assert.ok(TABLE_FOOT > TABLE_Y && TABLE_FOOT < SCENE.h);
  assert.ok(WINDOW.x + WINDOW.w < SCENE.w / 2 - JAR.w / 2, 'the window sits left of the lone jar');
  const body = bodyRect();
  assert.ok(body.y + body.h === JAR.h && body.y < JAR.lid);
  assert.ok(Number.isInteger(QUALITY) && QUALITY >= 1);
});

test('Nazare\'s label reads NAZARÉ, PORTUGAL and the time in Lisbon', () => {
  const nazare = findCity('nazare');
  const lines = labelLines(nazare, { temperature: 17.6 }, NOW);
  assert.deepEqual(lines, ['NAZARÉ, PORTUGAL', '18°', localTimeText(NOW, 'Europe/Lisbon')]);
  assert.notEqual(lines[2], labelLines(warsaw, EMPTY, NOW)[2]);
});

test('Nazare reads the swell (2.4 m · 12 s) as a fourth line; no reading, or no sea point, keeps three', () => {
  const sea = { waveHeight: 2.4, wavePeriod: 12 };
  const lines = labelLines(nazare, { temperature: 17, sea }, NOW);
  assert.equal(lines.length, 4);
  assert.equal(lines[3], '2.4 m · 12 s');
  assert.equal(labelLines(nazare, { temperature: 17, sea: null }, NOW).length, 3);
  assert.equal(labelLines(nazare, EMPTY, NOW).length, 3);
  assert.equal(labelLines(warsaw, { temperature: 17, sea }, NOW).length, 3);
});

test('El Chalten reads the view of the peak as a fourth line; no reading keeps three', () => {
  const chalten = findCity('el-chalten');
  const at = (over) => ({ known: true, temperature: 8, code: 0, kind: 'clear', cloudCover: 20, windSpeed: 30, windDir: 225, ...over });
  assert.equal(labelLines(chalten, at({}), NOW)[3], 'FITZ ROY · SMOKING');
  assert.equal(labelLines(chalten, at({ windSpeed: 5, cloudCover: 10 }), NOW)[3], 'FITZ ROY · CLEAR');
  assert.equal(labelLines(chalten, at({ cloudCover: 70, windSpeed: 5 }), NOW)[3], 'FITZ ROY · CAPPED');
  assert.equal(labelLines(chalten, at({ cloudCover: 90 }), NOW)[3], 'FITZ ROY · HIDDEN');
  assert.equal(labelLines(chalten, at({ kind: 'rain', code: 61, cloudCover: 40 }), NOW)[3], 'FITZ ROY · HIDDEN');
  assert.equal(labelLines(chalten, EMPTY, NOW).length, 3);
  assert.equal(labelLines(chalten, undefined, NOW).length, 3);
  assert.equal(labelLines(chalten, at({}), NOW)[0], 'EL CHALTÉN, ARGENTINA');
});

test('a city with no country labels as the name alone', () => {
  assert.equal(labelLines({ title: 'Atlantis', location: { zone: 'UTC' } }, EMPTY, NOW)[0], 'ATLANTIS');
});

test('fitSize leaves a short line alone and shrinks a long one, never below 0.7x', () => {
  const ctx = {
    font: '',
    measureText(str) {
      const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(this.font)[1]);
      return { width: 0.6 * size * str.length };
    },
  };
  assert.equal(fitSize(ctx, 'WARSAW, POLAND', 13.6, 188), 13.6);
  const s = fitSize(ctx, 'X'.repeat(40), 13.6, 188);
  assert.ok(s >= 13.6 * 0.7 && s < 13.6, String(s));
});

test('labelLines with a preview marks the time line with the offset', () => {
  const lines = labelLines(warsaw, { temperature: 12.3 }, NOW, { offsetMin: 300 });
  assert.deepEqual(lines, ['WARSAW, POLAND', '12°', '14:05 (+5 h)']);
  assert.equal(labelLines(warsaw, EMPTY, NOW, { offsetMin: 90 })[2], '14:05 (+1½ h)');
});

test('labelLines at offset 0 or no preview is the plain three lines, the swell still follows', () => {
  const plain = labelLines(warsaw, { temperature: 12.3 }, NOW);
  assert.deepEqual(labelLines(warsaw, { temperature: 12.3 }, NOW, { offsetMin: 0 }), plain);
  assert.deepEqual(labelLines(warsaw, { temperature: 12.3 }, NOW, null), plain);
  const sea = labelLines(nazare, { temperature: 17, sea: { waveHeight: 2.4, wavePeriod: 12 } }, NOW, { offsetMin: 300 });
  assert.equal(sea.length, 4);
  assert.match(sea[2], /^\d\d:\d\d \(\+5 h\)$/);
  assert.equal(sea[3], '2.4 m · 12 s');
});
