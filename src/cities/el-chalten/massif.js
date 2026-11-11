// El Chalten's numbers: the visibility of the peak and everything the weather
// and the clock turn into plain figures for the drawing. Pure, canvas-free.
import { clamp, lerp, smoothstep } from '../../clock.js';
import { cloudAmount } from '../../weather.js';
import { sunTimes } from '../../realclock.js';
import { zoneOffsetMinutes, localDate as wallDay } from '../../placeclock.js';

export const HIDDEN_COVER = 85;
export const CAPPED_COVER = 60;
export const SMOKING_WIND = 25;
export const PLUME_FROM = 12;
export const MIRROR_STILL = 10;
export const MIRROR_GONE = 45;
export const DEFAULT_WIND = 15;
export const MAX_WIND = 150; // km/h: a bad answer cannot make any loop or figure unbounded
export const HEADLAMP_MINUTES = 90;
export const GLOW_WALK = 0.025; // phase: about 40 minutes at midsummer's pace, about 22 at midwinter's
export const BANDS = ['clear', 'smoking', 'capped', 'hidden'];

const WET = new Set(['fog', 'drizzle', 'rain', 'snow', 'storm']);
const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const MIN_MS = 60000;

// Cloud cover, 0..100: the reading, or a figure for the kind.
export function coverOf(weather) {
  const c = weather ? weather.cloudCover : null;
  if (typeof c === 'number' && Number.isFinite(c)) return c;
  return cloudAmount(c, weather ? weather.kind : 'cloud') * 100;
}

// Wind, km/h: the reading held between 0 and MAX_WIND, or a light default.
export function windOf(weather) {
  const w = weather ? weather.windSpeed : null;
  return typeof w === 'number' && Number.isFinite(w) ? clamp(w, 0, MAX_WIND) : DEFAULT_WIND;
}

// Can you see Fitz Roy today? With no reading the peak is clear.
export function visibilityBand(weather) {
  if (!weather || !weather.known) return 'clear';
  const cover = coverOf(weather);
  if (WET.has(weather.kind) || cover >= HIDDEN_COVER) return 'hidden';
  if (cover >= CAPPED_COVER) return 'capped';
  if (windOf(weather) >= SMOKING_WIND) return 'smoking';
  return 'clear';
}

// The banner cloud's length as a share of the body width.
export function plumeLength(windKmh) {
  if (!Number.isFinite(windKmh) || windKmh < PLUME_FROM) return 0;
  return 0.04 + 0.36 * clamp((windKmh - 10) / 90);
}

// Which way the wind carries things on screen. The view faces west, so
// screen-right is north: from the south-west (225) is +, from the north-west -.
export function plumeSide(windDir) {
  if (typeof windDir !== 'number' || !Number.isFinite(windDir)) return 0;
  const v = -Math.cos((windDir * Math.PI) / 180);
  return Math.abs(v) < 1e-9 ? 0 : v;
}

// How well the lake mirrors the wall: 1 in still air, none in a gale or frozen.
export function mirrorAmount(windKmh, band, frozen) {
  if (frozen) return 0;
  const w = Number.isFinite(windKmh) ? windKmh : DEFAULT_WIND;
  return clamp((MIRROR_GONE - w) / (MIRROR_GONE - MIRROR_STILL)) * (band === 'hidden' ? 0.3 : 1);
}

// The cloud deck's lower edge, a share of the body height.
export const deckHeight = (cover) => lerp(0.26, 0.44, clamp((cover - CAPPED_COVER) / 34));

// First light: the strength of the glow, and its lower edge walking down the wall.
export function glowStrength(phase) {
  if (!(phase > 0.07 && phase < 0.08 + GLOW_WALK)) return 0;
  return smoothstep((phase - 0.07) / 0.01) * (1 - smoothstep((phase - 0.08 - GLOW_WALK + 0.008) / 0.008));
}
export function glowLine(phase) {
  if (!(phase > 0.07 && phase < 0.08 + GLOW_WALK)) return 0;
  return lerp(0.25, 0.5, clamp((phase - 0.08) / GLOW_WALK));
}

// The wall against the setting sun: 0 until golden, 1 at sunset, 0 by night.
export function silhouetteAmount(phase) {
  const p = phase - Math.floor(phase);
  if (p < 0.68 || p >= 0.88) return 0;
  return p < 0.76 ? smoothstep((p - 0.68) / 0.08) : 1 - smoothstep((p - 0.76) / 0.12);
}

// Seasons run the southern way round.
export function monthAt(nowMs, zone) {
  const d = wallDay(nowMs, zone);
  return d ? Number(d.slice(5, 7)) : null;
}
export function seasonOf(month) {
  if (!Number.isFinite(month)) return 'summer';
  if (month === 12 || month <= 2) return 'summer';
  if (month <= 5) return 'autumn';
  if (month <= 8) return 'winter';
  return 'spring';
}
export function shrubTone(month) {
  if (month === 4) return 1;
  return month === 3 || month === 5 ? 0.6 : 0;
}
export const freshSnow = (temperature) => (typeof temperature === 'number' && Number.isFinite(temperature) && temperature < 0 ? 1 : 0);

// Minutes until the city's next sunrise, from the jar's own sunrise maths; null
// for an unknown zone or moment.
export function minutesToSunrise(nowMs, location) {
  if (!location) return null;
  const offset = zoneOffsetMinutes(nowMs, location.zone);
  if (offset === null) return null;
  const day = Math.floor((nowMs - offset * MIN_MS) / DAY_MS);
  for (const d of [day, day + 1]) {
    const at = d * DAY_MS + sunTimes(d, location.lat, location.lon).rise * HOUR_MS;
    if (at > nowMs) return (at - nowMs) / MIN_MS;
  }
  return null;
}

// Headlamps on the shore: none until ninety minutes before sunrise, two then,
// seven from half an hour out until the sun is up.
export function headlampCount(minutes) {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0 || minutes > HEADLAMP_MINUTES) return 0;
  return 2 + Math.round(5 * clamp((HEADLAMP_MINUTES - minutes) / 60));
}

// 0..1 brightness of a face turned `facing` (-1 screen-left/south .. 1 right/north).
// The sun crosses the northern sky, so the right-hand faces are lit; flat at night
// and when the wall is a silhouette.
export function facetShade(facing, phase, light) {
  const p = phase - Math.floor(phase);
  const day = clamp((light - 0.1) / 0.5);
  const gain = (p < 0.4 ? 0.45 : 0.9) * day * (1 - silhouetteAmount(p));
  return clamp(0.5 + 0.5 * clamp(facing, -1, 1) * gain);
}

// ms between redraws the jar needs: the plume, the ripples and the deck move in
// wind, the headlamps flicker before dawn. Still otherwise.
export function cadenceOf(weather, opts, location) {
  const o = opts || {};
  const band = visibilityBand(weather);
  const picks = [];
  if (windOf(weather) >= PLUME_FROM || band === 'capped' || band === 'hidden') picks.push(250);
  if (headlampCount(minutesToSunrise(o.nowMs, location)) > 0) picks.push(400);
  const base = picks.length ? Math.min(...picks) : 0;
  return o.reduced ? base * 2 : base;
}
