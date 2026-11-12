import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_WIND, HIDDEN_COVER, CAPPED_COVER, SMOKING_WIND, BANDS, coverOf, windOf, visibilityBand, plumeLength, plumeSide, glowLine, glowStrength,
  silhouetteAmount, mirrorAmount, glowAt, eveningSun, moonLight, ghostWindow, spindriftAmount, lensAmount, whitecapCount, GHOST_EVERY_MS, GHOST_MS, GLOW_TOP, GLOW_FOOT, deckHeight, seasonOf, monthAt, shrubTone, freshSnow, minutesToSunrise, headlampCount, facetShade, cadenceOf,
} from '../src/cities/el-chalten/massif.js';
import { EMPTY, KINDS } from '../src/weather.js';

const location = { lat: -49.33, lon: -72.89, zone: 'America/Argentina/Rio_Gallegos' };
const T_NOON = Date.UTC(2026, 11, 21, 16, 0);
const T_LAMPS = Date.UTC(2026, 11, 21, 7, 30);
const reading = (over) => ({ ...EMPTY, known: true, temperature: 8, code: 0, kind: 'clear', cloudCover: 10, windSpeed: 5, windDir: 225, ...over });

test('the thresholds are named, and the bands run clear, smoking, capped, hidden', () => {
  assert.deepEqual(BANDS, ['clear', 'smoking', 'capped', 'hidden']);
  assert.deepEqual([HIDDEN_COVER, CAPPED_COVER, SMOKING_WIND], [85, 60, 25]);
});

test('cloud decides capped and hidden at 60 and 85', () => {
  for (const [cover, band] of [[0, 'clear'], [59, 'clear'], [60, 'capped'], [84, 'capped'], [85, 'hidden'], [100, 'hidden']]) {
    assert.equal(visibilityBand(reading({ cloudCover: cover, windSpeed: 0 })), band, `cover ${cover}`);
  }
});

test('wind decides smoking at 25 km/h when the sky is fairly open', () => {
  assert.equal(visibilityBand(reading({ cloudCover: 20, windSpeed: 24 })), 'clear');
  assert.equal(visibilityBand(reading({ cloudCover: 20, windSpeed: 25 })), 'smoking');
  assert.equal(visibilityBand(reading({ cloudCover: 70, windSpeed: 60 })), 'capped', 'cloud outranks wind');
});

test('fog, drizzle, rain, snow and storm hide the peak; clear and cloud do not', () => {
  for (const kind of KINDS) {
    const hidden = ['fog', 'drizzle', 'rain', 'snow', 'storm'].includes(kind);
    assert.equal(visibilityBand(reading({ kind, cloudCover: 10 })) === 'hidden', hidden, kind);
  }
});

test('no reading is clear; a known reading with no cover falls back on the kind', () => {
  assert.equal(visibilityBand(EMPTY), 'clear');
  assert.equal(visibilityBand(undefined), 'clear');
  assert.equal(visibilityBand(reading({ kind: 'cloud', cloudCover: null })), 'capped');
  assert.equal(coverOf(reading({ cloudCover: 33 })), 33);
  assert.equal(windOf(EMPTY), 15);
  assert.equal(windOf(reading({ windSpeed: 7 })), 7);
});

test('wind is held between 0 and a ceiling, so a bad answer cannot run away', () => {
  assert.equal(windOf(reading({ windSpeed: 1e9 })), MAX_WIND);
  assert.equal(windOf(reading({ windSpeed: Infinity })), 15, 'a non-finite reading is the default');
  assert.equal(windOf(reading({ windSpeed: -40 })), 0);
  assert.equal(windOf(reading({ windSpeed: 80 })), 80);
});

test('the plume: none in light air, longer with wind, monotone up to a gale', () => {
  assert.equal(plumeLength(0), 0);
  assert.equal(plumeLength(11), 0);
  assert.ok(plumeLength(30) > 0);
  let last = 0;
  for (let w = 12; w <= 100; w += 4) {
    const v = plumeLength(w);
    assert.ok(v >= last, `wind ${w}`);
    last = v;
  }
  assert.ok(plumeLength(100) <= 0.4 + 1e-9);
  assert.ok(plumeLength(60) > 0.2);
});

test('the plume goes right (north) from the south-west, left from the north-west, at you from the west', () => {
  assert.ok(plumeSide(225) > 0.7);
  assert.ok(plumeSide(315) < -0.7);
  assert.ok(Math.abs(plumeSide(270)) < 1e-9);
  assert.equal(plumeSide(null), 0);
  assert.equal(plumeSide(undefined), 0);
});

test('first light lands on the summit and walks down the wall over the half hour after sunrise', () => {
  assert.equal(glowLine(0.4), 0);
  assert.equal(glowLine(0.92), 0);
  assert.ok(glowLine(0.09) > 0);
  assert.ok(glowLine(0.098) > glowLine(0.09) && glowLine(0.104) > glowLine(0.098));
  assert.equal(glowLine(0.11), 0, 'the walk is over about 25 minutes after sunrise');
  assert.ok(glowStrength(0.09) > 0.9 && glowStrength(0.4) === 0 && glowStrength(0.104) < glowStrength(0.09));
});

test('the wall is a silhouette at sunset and not before or after', () => {
  assert.equal(silhouetteAmount(0.4), 0);
  assert.equal(silhouetteAmount(0.76), 1);
  assert.equal(silhouetteAmount(0.92), 0);
  assert.ok(silhouetteAmount(0.72) > 0 && silhouetteAmount(0.72) < 1);
});

test('the lake mirrors the wall in still air, fades with wind, is gone in a gale, frozen or hidden', () => {
  assert.equal(mirrorAmount(5, 'clear', false), 1);
  assert.equal(mirrorAmount(45, 'clear', false), 0);
  const mid = mirrorAmount(25, 'clear', false);
  assert.ok(mid > 0 && mid < 1);
  assert.ok(Math.abs(mirrorAmount(5, 'hidden', false) - 0.3) < 1e-9);
  assert.equal(mirrorAmount(5, 'clear', true), 0);
});

test('the deck sits on the summits at 60 % and sinks to the moraine at 94 %', () => {
  assert.ok(deckHeight(60) < deckHeight(94));
});

test('the seasons run the southern way round', () => {
  assert.equal(seasonOf(1), 'summer');
  assert.equal(seasonOf(12), 'summer');
  assert.equal(seasonOf(7), 'winter');
  assert.equal(seasonOf(11), 'spring');
  assert.equal(seasonOf(4), 'autumn');
  assert.equal(seasonOf(null), 'summer');
  assert.equal(shrubTone(4), 1);
  assert.equal(shrubTone(3), 0.6);
  assert.equal(shrubTone(7), 0);
});

test('the month is read in El Chaltén\'s own zone, not the viewer\'s', () => {
  assert.equal(monthAt(Date.UTC(2026, 0, 1, 1), location.zone), 12, 'still 31 December in Rio Gallegos');
  assert.equal(monthAt(Date.UTC(2026, 0, 1, 4), location.zone), 1);
  assert.equal(monthAt(Date.UTC(2026, 0, 1), 'Nowhere/Nope'), null);
});

test('fresh snow falls on any day below freezing', () => {
  assert.equal(freshSnow(-1), 1);
  assert.equal(freshSnow(0), 0);
  assert.equal(freshSnow(null), 0);
});

test('minutes to sunrise come from the jar\'s own sunrise maths', () => {
  const m = minutesToSunrise(T_LAMPS, location);
  assert.ok(Math.abs(m - 71) <= 3, String(m));
  assert.equal(minutesToSunrise(T_LAMPS, { ...location, zone: 'Nowhere/Nope' }), null);
  assert.equal(minutesToSunrise(undefined, location), null);
  assert.ok(minutesToSunrise(T_NOON, location) > 600, 'after sunrise the next one is tomorrow');
});

test('headlamps: none until ninety minutes before sunrise, two then, seven from half an hour out', () => {
  assert.equal(headlampCount(120), 0);
  assert.equal(headlampCount(90), 2);
  assert.equal(headlampCount(30), 7);
  assert.equal(headlampCount(0), 7);
  assert.equal(headlampCount(null), 0);
  assert.equal(headlampCount(-5), 0);
});

test('facets are lit on the north side by day and flat at night and in silhouette', () => {
  assert.ok(facetShade(1, 0.4, 1) > facetShade(-1, 0.4, 1) + 0.2);
  assert.ok(Math.abs(facetShade(1, 0.92, 0.08) - facetShade(-1, 0.92, 0.08)) < 0.05);
  assert.ok(Math.abs(facetShade(1, 0.76, 0.58) - facetShade(-1, 0.76, 0.58)) < 0.05);
  assert.ok(facetShade(1, 0.4, 1) > facetShade(1, 0.1, 0.9), 'the morning sun lights the faces less');
});

test('the cadence: still in calm, 250 in wind or cloud, 400 for headlamps, doubled when reduced', () => {
  const calm = reading({ windSpeed: 4 });
  assert.equal(cadenceOf(EMPTY, {}, location), 250, 'the default wind moves the short plume');
  assert.equal(cadenceOf(calm, { nowMs: T_NOON }, location), 0);
  assert.equal(cadenceOf(calm, { nowMs: T_LAMPS }, location), 400);
  assert.equal(cadenceOf(calm, {}, location), 0, 'no moment, no headlamps');
  assert.equal(cadenceOf(reading({ windSpeed: 4, cloudCover: 70 }), { nowMs: T_NOON }, location), 250, 'a capped deck drifts');
  assert.equal(cadenceOf(reading({ windSpeed: 30 }), { nowMs: T_LAMPS }, location), 250, 'the smallest wins');
  assert.equal(cadenceOf(calm, { nowMs: T_LAMPS, reduced: true }, location), 800);
  assert.equal(cadenceOf(calm, { nowMs: T_NOON, reduced: true }, location), 0);
});

test('the first light starts on the tips and reaches the foot; a height above the line has it, below has none', () => {
  assert.ok(glowLine(0.073) < GLOW_TOP + 0.03, 'only the tips at first');
  assert.ok(Math.abs(glowLine(0.103) - GLOW_FOOT) < 1e-9, 'the whole wall at the end');
  assert.equal(glowAt(0.085, 0.3, 0.085), 1);
  assert.equal(glowAt(0.3, 0.3, 0.085), 0);
  assert.equal(glowAt(0.4, 0.3, 0.085), 0);
  assert.ok(glowAt(0.2, 0.3, 0.085) > 0 && glowAt(0.2, 0.3, 0.085) < 1);
  assert.equal(glowAt(0.2, 0, 0.085), 0, 'no line, no light');
});

test('the evening sun: none at noon or at night, strong in the evening, sinking all the while', () => {
  assert.equal(eveningSun(0.4).k, 0);
  assert.equal(eveningSun(0.92).k, 0);
  assert.ok(eveningSun(0.7).k > 0.9);
  assert.ok(eveningSun(0.74).sink > eveningSun(0.66).sink);
  assert.ok(silhouetteAmount(0.7) > 0.7, 'the wall is already a silhouette an hour and a half before sunset');
});

test('the moon: down by day, up at night; a full one high up gives light, a new one none', () => {
  const full = Date.UTC(2026, 0, 3, 4, 0);
  const newMoon = Date.UTC(2026, 0, 18, 22, 0);
  assert.equal(moonLight(0.4, full).up, false);
  assert.equal(moonLight(0.4, full).k, 0);
  const high = moonLight(0.96, full);
  assert.ok(high.up && high.k > 0.8 && high.x >= 0.15 && high.x <= 0.85);
  assert.ok(moonLight(0.96, newMoon).k < 0.05);
});

test('the ghost window opens for a few seconds once in a while, never under reduced motion', () => {
  assert.equal(ghostWindow(0), 0);
  assert.ok(Math.abs(ghostWindow(GHOST_MS / 2) - 1) < 1e-9);
  assert.equal(ghostWindow(GHOST_MS), 0);
  assert.equal(ghostWindow(GHOST_EVERY_MS - 1), 0);
  assert.ok(ghostWindow(GHOST_EVERY_MS * 7 + GHOST_MS / 4) > 0.4);
  assert.equal(ghostWindow(GHOST_MS / 2, true), 0);
  assert.equal(ghostWindow(undefined), 0);
  assert.equal(ghostWindow(-GHOST_EVERY_MS + GHOST_MS / 2), 1, 'a moment before the epoch still has its windows');
});

test('wind\'s marks: spindrift in a strong wind, a lens on a windy clear day, whitecaps on open water', () => {
  assert.equal(spindriftAmount(20), 0);
  assert.ok(spindriftAmount(45) > 0 && spindriftAmount(45) < 1);
  assert.equal(spindriftAmount(200), 1);
  assert.equal(spindriftAmount(NaN), 0);
  assert.equal(lensAmount(5, 'clear', 10), 0);
  assert.equal(lensAmount(15, 'clear', 10), 0, 'the default wind with no reading makes none');
  assert.ok(lensAmount(22, 'clear', 10) > 0.5);
  assert.equal(lensAmount(40, 'capped', 70), 0);
  assert.equal(lensAmount(40, 'hidden', 95), 0);
  assert.equal(whitecapCount(10, false), 0);
  assert.ok(whitecapCount(40, false) > whitecapCount(28, false));
  assert.equal(whitecapCount(60, true), 0, 'none on ice');
  assert.ok(whitecapCount(1e9, false) <= 26);
});
