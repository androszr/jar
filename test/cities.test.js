import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { CITIES, findCity } from '../src/cities/index.js';
import { PLACES } from '../src/cities/places.js';
import { PALETTE } from '../src/look/index.js';

const DIR = new URL('../src/cities/', import.meta.url).pathname;

test('every city meets the contract', () => {
  assert.ok(CITIES.length >= 1);
  assert.equal(CITIES.length, 1, 'one jar is one city (plans/2026-10-18-warsaw-forecast-and-skyline.md): a second view of a city is a scene change, not a second jar');
  for (const c of CITIES) {
    assert.equal(typeof c.id, 'string');
    assert.equal(typeof c.title, 'string');
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
    assert.deepEqual(c.location, { lat: p.lat, lon: p.lon, zone: p.zone });
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
