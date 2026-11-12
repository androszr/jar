// El Chalten's numbers: the visibility of the peak and everything the weather
// and the clock turn into plain figures for the drawing. Pure, canvas-free.
import { clamp, lerp, smoothstep, moonPos } from '../../clock.js';
import { moonPhase } from '../../moon.js';
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
// Where the light starts on the tips and where it ends, as shares of the body height.
export const GLOW_TOP = 0.13;
export const GLOW_FOOT = 0.52;
// A hidden day: the ragged cloud base (a share of the body height: the moraine's foot and
// the shore stay in view under it), and the brief thin window that shows a ghost of the wall.
export const HIDDEN_EDGE = 0.405;
export const GHOST_EVERY_MS = 38000;
export const GHOST_MS = 7000;
export const SPINDRIFT_FROM = 30;
export const LENS_FROM = 16;
export const WHITECAP_FROM = 26;

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
  return 0.06 + 0.34 * clamp((windKmh - 10) / 60);
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
  return lerp(GLOW_TOP, GLOW_FOOT, clamp((phase - 0.072) / 0.03));
}
// How much of the first light reaches a height `y` (a share of the body) with the line at
// `line`: full on the tips, none at the line. `top` is the summit's height.
export function glowAt(y, line, top) {
  if (!(line > top)) return 0;
  return clamp((line - y) / (line - top));
}

// The wall against the evening sun: the sun goes behind the massif long before it
// sets, so the wall darkens through the late afternoon, is a silhouette from about
// an hour and a half before sunset, and fades into the night after it.
export function silhouetteAmount(phase) {
  const p = phase - Math.floor(phase);
  if (p < 0.63 || p >= 0.88) return 0;
  return p < 0.76 ? smoothstep((p - 0.63) / 0.1) : 1 - smoothstep((p - 0.76) / 0.12);
}
// The evening sun behind the wall: how strong its glow is (0..1) and how far it has
// sunk (0 high above the col, 1 gone down behind it).
export function eveningSun(phase) {
  const p = phase - Math.floor(phase);
  if (p < 0.58 || p > 0.86) return { k: 0, sink: 0 };
  return { k: smoothstep((p - 0.58) / 0.08) * (1 - smoothstep((p - 0.79) / 0.07)), sink: clamp((p - 0.6) / 0.17) };
}

// The moon the shared sky draws, worked out the same way (the sky does not hand it
// to a scene): where it stands as shares of the jar, and how much light it gives,
// 0 when it is down or new, 1 for a full moon high up.
export function moonLight(phase, nowMs) {
  const mp = moonPos(phase);
  if (!(mp.alt > 0)) return { up: false, x: 0.5, y: 0.4, k: 0 };
  return {
    up: true,
    x: clamp((mp.x - 400) / 1000, 0.15, 0.85),
    y: 0.4 - 0.28 * mp.alt,
    k: moonPhase(nowMs).illumination * clamp(mp.alt * 2.5),
  };
}

// A hidden day's thin window: 0 almost always, rising to 1 and back over GHOST_MS
// once every GHOST_EVERY_MS. None under reduced motion, or without a moment.
export function ghostWindow(nowMs, reduced = false) {
  if (reduced || typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return 0;
  const t = ((nowMs % GHOST_EVERY_MS) + GHOST_EVERY_MS) % GHOST_EVERY_MS;
  if (t >= GHOST_MS) return 0;
  const s = Math.sin((Math.PI * t) / GHOST_MS);
  return s * s;
}

// Wind's other marks, each 0..1: snow blowing off the ridges, a lens of cloud by
// the summit on a windy clear day, and how many whitecaps the lake carries.
export const spindriftAmount = (windKmh) => (Number.isFinite(windKmh) ? clamp((windKmh - SPINDRIFT_FROM) / 30) : 0);
export function lensAmount(windKmh, band, cover) {
  if (band !== 'clear' && band !== 'smoking') return 0;
  if (!Number.isFinite(windKmh)) return 0;
  return smoothstep((windKmh - LENS_FROM) / 8) * (1 - clamp((cover || 0) / 100) * 0.5);
}
export function whitecapCount(windKmh, frozen) {
  if (frozen || !Number.isFinite(windKmh) || windKmh < WHITECAP_FROM) return 0;
  return Math.min(26, 5 + Math.round((windKmh - WHITECAP_FROM) * 0.5));
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
  // the morning sun stands behind the viewer and lights every face; by noon it is round to the north
  const gain = lerp(0.6, 0.96, smoothstep((p - 0.18) / 0.22)) * day * (1 - silhouetteAmount(p));
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
