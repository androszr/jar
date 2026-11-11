import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { CITIES, findCity } from '../src/cities/index.js';
import { PLACES, placeName } from '../src/cities/places.js';
import { PALETTE } from '../src/look/index.js';
import { EMPTY } from '../src/weather.js';

const DIR = new URL('../src/cities/', import.meta.url).pathname;

test('every city meets the contract', () => {
  assert.ok(CITIES.length >= 1);
  assert.equal(CITIES.length, 3, 'Warsaw, Nazare and El Chalten; one jar is one city, so a second view of a city is a scene change, not a fourth jar');
  for (const c of CITIES) {
    assert.equal(typeof c.id, 'string');
    assert.equal(typeof c.title, 'string');
    assert.equal(typeof c.country, 'string');
    assert.ok(c.country.length > 0, `${c.id} has no country`);
    for (const k of ['lat', 'lon']) assert.ok(Number.isFinite(c.location[k]), `${c.id}.location.${k}`);
    assert.equal(typeof c.location.zone, 'string');
    assert.ok(['cork', 'tin'].includes(c.lid));
    assert.ok(c.label.inks.plate in PALETTE && c.label.inks.ink in PALETTE);
    assert.equal(typeof c.buildPlates, 'function');
    assert.equal(typeof c.paint, 'function');
  }
});

test('ids are unique, kebab-case, and match PLACES', () => {
  const ids = CITIES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z]+(-[a-z]+)*$/);
  assert.deepEqual([...ids].sort(), PLACES.map((p) => p.id).sort());
  for (const c of CITIES) {
    const p = PLACES.find((x) => x.id === c.id);
    assert.deepEqual(c.location, { lat: p.lat, lon: p.lon, zone: p.zone, ...(p.sea ? { sea: p.sea } : {}) });
  }
});

test('every folder under src/cities/ is a registered city', () => {
  const folders = readdirSync(DIR).filter((f) => statSync(DIR + f).isDirectory());
  assert.deepEqual(folders.sort(), CITIES.map((c) => c.id).sort());
});

test('findCity finds by id and returns null otherwise', () => {
  assert.equal(findCity('warsaw').title, 'Warsaw');
  assert.equal(findCity('atlantis'), null);
});

test('Warsaw sits in its own zone', () => {
  assert.equal(findCity('warsaw').location.zone, 'Europe/Warsaw');
});

test('buildPlates is deterministic', () => {
  const w = findCity('warsaw');
  assert.deepEqual(w.buildPlates(340, 390), w.buildPlates(340, 390));
});

test('Nazare is the second jar, in Lisbon time, with a tin lid unlike Warsaw\'s cork', () => {
  const n = findCity('nazare');
  assert.equal(n.title, 'Nazaré');
  assert.equal(n.location.zone, 'Europe/Lisbon');
  assert.equal(CITIES[1], n);
  assert.equal(CITIES[1].id, 'nazare', 'nazare is registered right after warsaw');
  assert.notEqual(findCity('warsaw').lid, n.lid);
  assert.deepEqual(n.buildPlates(340, 396), n.buildPlates(340, 396));
});

test('Nazare asks the page for a tick of its own; Warsaw ticks for its bridge traffic, which carries the ice', () => {
  const n = findCity('nazare');
  assert.equal(typeof n.cadenceMs, 'function');
  assert.equal(n.cadenceMs(EMPTY, {}), 100);
  assert.equal(n.cadenceMs(EMPTY, { reduced: true }), 250);
  const w = findCity('warsaw');
  assert.equal(typeof w.cadenceMs, 'function');
  assert.equal(w.cadenceMs(EMPTY, {}), 200);
  assert.equal(w.cadenceMs(EMPTY, { reduced: true }), 400);
  assert.equal(w.cadenceMs({ ...EMPTY, temperature: -8, known: true }, {}), 200);
});

test('El Chalten is the third jar, in Rio Gallegos time, with a cork lid and a tick of its own', () => {
  const c = findCity('el-chalten');
  assert.equal(CITIES[2], c);
  assert.equal(c.title, 'El Chaltén');
  assert.equal(c.country, 'Argentina');
  assert.equal(c.location.zone, 'America/Argentina/Rio_Gallegos');
  assert.equal(c.lid, 'cork');
  assert.equal(c.location.sea, undefined, 'no offshore point, so no marine request');
  assert.deepEqual(c.sky, { sun: false });
  assert.deepEqual(c.buildPlates(340, 396), c.buildPlates(340, 396));
  const T_NOON = Date.UTC(2026, 11, 21, 16, 0);
  const T_LAMPS = Date.UTC(2026, 11, 21, 7, 30);
  const still = { ...EMPTY, known: true, windSpeed: 4, cloudCover: 10, code: 0, kind: 'clear' };
  assert.equal(c.cadenceMs(still, { nowMs: T_NOON }), 0, 'a still clear noon asks for no tick');
  assert.equal(c.cadenceMs({ ...still, windSpeed: 30 }, { nowMs: T_NOON }), 250, 'a plume moves');
  assert.equal(c.cadenceMs(still, { nowMs: T_LAMPS }), 400, 'headlamps flicker before dawn');
  assert.equal(c.cadenceMs(still, {}), 0, 'a missing moment means no headlamps');
  assert.equal(c.cadenceMs({ ...still, windSpeed: 30 }, { reduced: true, nowMs: T_NOON }), 500);
});

test('a city may take the moment in cadenceMs; Nazare and Warsaw ignore it', () => {
  for (const id of ['nazare', 'warsaw']) {
    const c = findCity(id);
    assert.equal(c.cadenceMs(EMPTY, { nowMs: 0 }), c.cadenceMs(EMPTY, {}));
    assert.equal(c.cadenceMs(EMPTY, { reduced: true, nowMs: 12345 }), c.cadenceMs(EMPTY, { reduced: true }));
  }
});

test('every place carries a country', () => {
  for (const p of PLACES) assert.ok(typeof p.country === 'string' && p.country.length > 0, `${p.id} has no country`);
  assert.equal(findCity('warsaw').country, 'Poland');
  assert.equal(findCity('nazare').country, 'Portugal');
});

test('placeName joins city and country, and falls back to the city', () => {
  assert.equal(placeName({ title: 'Warsaw', country: 'Poland' }), 'Warsaw, Poland');
  assert.equal(placeName({ title: 'Atlantis' }), 'Atlantis');
});
