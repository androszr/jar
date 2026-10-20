// Adapted from Memory Lane (vir-sunset) src/realclock.js, 2026-10-18
// The real clock: where the drawn day is right now for the viewer, from their
// own clock alone. Pure and Node-importable: every function takes the moment
// (`nowMs`, ms since the epoch) and the place as arguments and never reads the
// wall clock, so the same moment always gives the same phase (convention 5).
//
// The place is guessed from the time-zone setting (no permission prompt, no
// network); today's sunrise and sunset there are computed with NOAA's
// simplified formula; and the drawn day is stretched or squeezed piecewise
// linearly so its sunrise and sunset land on the real ones.

import { KEYFRAMES, wrap, clamp } from './clock.js';

const DAY_MS = 86400000;
const MIN_MS = 60000;
const HOUR_MS = 3600000;
const RAD = Math.PI / 180;

export const DEFAULT_LAT = 45;
// The longest and shortest day the anchors allow. 20 h keeps `night`
// (set + 90 min) at least 80 min before `predawn` (next rise - 70 min).
export const MAX_DAY_H = 20;
export const MIN_DAY_H = 2;

// Zones with an exact place.
const PLACES = {
  'Europe/Warsaw': { lat: 52.23, lon: 21.01 },
  'Europe/Zagreb': { lat: 45.8, lon: 16.0 },
  'Australia/Sydney': { lat: -33.9, lon: 151.2 },
  'America/Lima': { lat: -12.0, lon: -77.0 },
  'America/Santiago': { lat: -33.4, lon: -70.7 },
};

// Otherwise a latitude for the zone's region.
const REGION_LAT = {
  Europe: 48,
  America: 40,
  Asia: 30,
  Africa: 5,
  Australia: -30,
  Pacific: -20,
};

// Where the viewer probably is: `timeZone` is an IANA name (or anything),
// `offsetMinutes` is `Date.prototype.getTimezoneOffset()` (minutes *behind*
// UTC, so -120 is UTC+2). Never throws.
export function placeGuess(timeZone, offsetMinutes) {
  const offset = Number.isFinite(offsetMinutes) ? offsetMinutes : 0;
  const zone = typeof timeZone === 'string' ? timeZone : '';
  const exact = Object.prototype.hasOwnProperty.call(PLACES, zone) ? PLACES[zone] : null;
  if (exact) return { lat: exact.lat, lon: exact.lon, offsetMinutes: offset };
  const region = zone.split('/')[0];
  const lat = Object.prototype.hasOwnProperty.call(REGION_LAT, region) ? REGION_LAT[region] : DEFAULT_LAT;
  // `+ 0` turns a -0 (offset 0) into 0.
  return { lat, lon: -offset / 4 + 0, offsetMinutes: offset };
}

// Day of the year (1..366) of the UTC day `dayIndex` (days since the epoch).
// A Date built from a number is calendar arithmetic, not the wall clock.
function dayOfYear(dayIndex) {
  const year = new Date(dayIndex * DAY_MS).getUTCFullYear();
  return dayIndex - Math.floor(Date.UTC(year, 0, 1) / DAY_MS) + 1;
}

// Sunrise and sunset, fractional UTC hours, on the UTC day `dayIndex` at
// `lat`/`lon` (degrees, east positive). The day length is clamped to
// MIN_DAY_H..MAX_DAY_H, so polar days and nights still have both.
export function sunTimes(dayIndex, lat, lon) {
  const n = dayOfYear(dayIndex);
  const decl = 23.44 * Math.sin((2 * Math.PI * (284 + n)) / 365) * RAD;
  const g = (2 * Math.PI * (n - 1)) / 365;
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const noon = 12 - lon / 15 - eqTime / 60;
  const phi = clamp(lat, -90, 90) * RAD;
  const cosW = (Math.sin(-0.833 * RAD) - Math.sin(phi) * Math.sin(decl)) / (Math.cos(phi) * Math.cos(decl));
  let dayH;
  if (!(cosW >= -1)) dayH = MAX_DAY_H; // midnight sun (or a pole: cos(phi) = 0)
  else if (cosW > 1) dayH = MIN_DAY_H; // polar night
  else dayH = clamp((2 * Math.acos(cosW)) / RAD / 15, MIN_DAY_H, MAX_DAY_H);
  return { rise: noon - dayH / 2, set: noon + dayH / 2 };
}

// The phase values, read from the keyframe table by name. `night` appears
// twice: its first entry starts the night, its last ends it.
const phaseOf = (name, last = false) => {
  const hits = KEYFRAMES.filter((k) => k.name === name);
  return (last ? hits[hits.length - 1] : hits[0]).at;
};
const PHASE = {
  dawn: phaseOf('dawn'),
  sunrise: phaseOf('sunrise'),
  noon: phaseOf('noon'),
  sunset: phaseOf('sunset'),
  dusk: phaseOf('dusk'),
  night: phaseOf('night'),
  predawn: phaseOf('night', true),
};

// Local ms since local midnight of the local day `dayIndex` for the sun's
// rise and set that day.
function localSun(dayIndex, place) {
  const { rise, set } = sunTimes(dayIndex, place.lat, place.lon);
  const shift = -place.offsetMinutes * MIN_MS;
  return { rise: rise * HOUR_MS + shift, set: set * HOUR_MS + shift };
}

// The last three days' anchors, so a per-frame call costs a lookup.
const CACHE_MAX = 3;
const cache = new Map();
export const anchorCacheSize = () => cache.size;

// The phase/time pairs of one local day, times in local ms since that day's
// local midnight, strictly increasing, ending on the next day's dawn at 1.
export function dayAnchors(dayIndex, place) {
  const key = `${dayIndex}|${place.lat}|${place.lon}|${place.offsetMinutes}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const today = localSun(dayIndex, place);
  const next = localSun(dayIndex + 1, place);
  const nextDawn = DAY_MS + next.rise - 40 * MIN_MS;
  const anchors = [
    { phase: PHASE.dawn, ms: today.rise - 40 * MIN_MS },
    { phase: PHASE.sunrise, ms: today.rise },
    { phase: PHASE.noon, ms: (today.rise + today.set) / 2 },
    { phase: PHASE.sunset, ms: today.set },
    { phase: PHASE.dusk, ms: today.set + 40 * MIN_MS },
    { phase: PHASE.night, ms: today.set + 90 * MIN_MS },
    { phase: PHASE.predawn, ms: nextDawn - 30 * MIN_MS },
    { phase: 1, ms: nextDawn },
  ];
  cache.set(key, anchors);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return anchors;
}

// The drawn day's phase (0..1) at `nowMs` for `place` ({ lat, lon,
// offsetMinutes }): linear between the anchors bracketing the local time of
// day, across yesterday, today and tomorrow.
export function realPhase(nowMs, place) {
  const localMs = nowMs - place.offsetMinutes * MIN_MS;
  const dayIndex = Math.floor(localMs / DAY_MS);
  const tod = localMs - dayIndex * DAY_MS;
  const points = [];
  for (let k = -1; k <= 1; k++) {
    const list = dayAnchors(dayIndex + k, place);
    const upto = k === 1 ? list.length : list.length - 1; // each day's last is the next one's first
    for (let i = 0; i < upto; i++) points.push({ phase: k + list[i].phase, ms: k * DAY_MS + list[i].ms });
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (tod >= a.ms && tod < b.ms) return wrap(a.phase + ((tod - a.ms) / (b.ms - a.ms)) * (b.phase - a.phase));
  }
  return wrap(points[0].phase);
}
