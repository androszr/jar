import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JAR, labelLines, bodyRect, QUALITY } from '../src/jar.js';
import { TABLE_Y, WINDOW } from '../src/shed.js';
import { TABLE_FOOT } from '../src/shelf.js';
import { SCENE } from '../src/framing.js';
import { findCity } from '../src/cities/index.js';
import { EMPTY } from '../src/weather.js';

const warsaw = findCity('warsaw');
const NOW = Date.UTC(2026, 5, 15, 12, 5);

test('labelLines with weather: [TITLE, temperature, HH:MM in the city zone]', () => {
  const lines = labelLines(warsaw, { temperature: 12.3 }, NOW);
  assert.deepEqual(lines, ['WARSAW', '12°', '14:05']);
});

test('labelLines without weather reads a dash for the temperature', () => {
  assert.deepEqual(labelLines(warsaw, EMPTY, NOW), ['WARSAW', '—°', '14:05']);
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
