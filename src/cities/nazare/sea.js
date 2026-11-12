// The sea off Nazare, as numbers: the swell bands, the wave's size, the roll
// period and the surfers' plan. Pure and canvas-free, so Node tests it. Every
// mover is sampled from `nowMs` (read, never accumulated), so the same moment
// draws the same picture.
import { LAMP_THRESHOLD, clamp, wrap, lerp } from '../../clock.js';
import { hash2 } from '../../skyweather.js';
import { REDUCED_DRIFT, cloudAmount } from '../../weather.js';

// [name, upper bound in metres): calm under 1 m, moderate 1-3, big 3-6, giant 6+.
export const BANDS = [['calm', 1], ['moderate', 3], ['big', 6], ['giant', Infinity]];
export const DEFAULT_WAVE_M = 2;

// metres -> share of the jar body's height (the crest above its base). A giant
// towers: at ten metres the crest stands about level with the foot of the fort.
export const SIZES = [[0, 0.02], [1, 0.05], [3, 0.10], [6, 0.19], [10, 0.29]];

export function waveHeightOf(weather) {
  const h = weather && weather.sea ? weather.sea.waveHeight : null;
  return typeof h === 'number' && Number.isFinite(h) ? h : DEFAULT_WAVE_M;
}

export function waveBand(h) {
  for (const [name, upTo] of BANDS) if (h < upTo) return name;
  return 'giant';
}

export function waveSize(h) {
  const m = clamp(h, 0, 10);
  for (let i = 1; i < SIZES.length; i++) {
    if (m <= SIZES[i][0]) {
      const [x0, y0] = SIZES[i - 1];
      const [x1, y1] = SIZES[i];
      return lerp(y0, y1, (m - x0) / (x1 - x0));
    }
  }
  return SIZES[SIZES.length - 1][1];
}

// Waves come less often than the swell period says: every roll is stretched by
// this factor.
export const ROLL_STRETCH = 1.5;

// One roll of the wave, in ms: the swell period, 8..18 s (12 s unknown), times
// ROLL_STRETCH, a further 2.5x slower under reduced motion.
export function rollMs(weather, reduced = false) {
  const p = weather && weather.sea ? weather.sea.wavePeriod : null;
  const s = typeof p === 'number' && Number.isFinite(p) ? clamp(p, 8, 18) : 12;
  return (1000 * s * ROLL_STRETCH) / (reduced ? REDUCED_DRIFT : 1);
}

export const wavePhase = (nowMs, roll) => wrap(nowMs / roll);

// Who is on the wave: nobody in the dark, nobody on a calm day.
export function surferPlan(band, light) {
  if (!(light >= LAMP_THRESHOLD)) return [];
  if (band === 'moderate' || band === 'big') {
    return [{ kind: 'rider', lane: 0 }, { kind: 'rider', lane: 1 }, { kind: 'paddler', lane: 2 }];
  }
  if (band === 'giant') return [{ kind: 'rider', lane: 0 }, { kind: 'ski', lane: 1 }];
  return [];
}

// 0..1 along the face from the peak to the shoulder for surfer `i`.
export const surferProgress = (i, nowMs, roll) => wrap(hash2(i, 0x5ea) + nowMs / (roll * (0.6 + 0.2 * i)));

// They fade over the last 0.1 of light before the lamps come on.
export const surferAlpha = (light) => clamp((light - LAMP_THRESHOLD) / 0.1);

// The lines of swell marching in over the far sea: `n` of them, each a share
// `u` of the way from the horizon to the shore (one trip per roll, evenly
// spaced), with `t` its depth after perspective (spacing opens toward us) and
// `a` its strength, 0..1: faint on a calm day, pronounced on a giant one, and
// fading in and out at both ends of its trip. Sampled from `nowMs`, never kept.
export const SWELL_LINES = 7;
export const swellStrength = (size) => 0.2 + 0.8 * clamp(size / 0.18);
export function swellLines(size, roll, nowMs, n = SWELL_LINES) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const u = wrap(nowMs / roll + k / n);
    out.push({ k, u, t: u ** 1.7, a: swellStrength(size) * Math.sin(Math.PI * u) ** 1.5 });
  }
  return out;
}

// How many lines of swell are on the water at once: a short period packs them
// close, a long one spreads them out (12 s when the period is unknown).
export function swellCount(weather) {
  const p = weather && weather.sea ? weather.sea.wavePeriod : null;
  const s = typeof p === 'number' && Number.isFinite(p) ? clamp(p, 8, 18) : 12;
  return Math.round(clamp(110 / s, 6, 12));
}

// How hard the wind tears spray off the crest, 0..1 (a light air with no reading).
export function windBlow(weather) {
  const v = weather ? weather.windSpeed : null;
  return typeof v === 'number' && Number.isFinite(v) ? clamp(v / 40, 0.1, 1) : 0.3;
}

// The beach follows the season and the swell. Umbrellas come out only on a
// warm, fair day with a calm or moderate sea and no gale (0..1, fading with the
// daylight); the red flag flies on a big or giant day, and a few people come
// down to watch it when the weather is fair. With no temperature the calendar
// decides: June to September is warm. Without a reading at all the sand stays
// empty: nobody can say it is a beach day.
export const WARM_C = 18;
export const SUMMER_MONTHS = [5, 6, 7, 8];
export const UMBRELLA_WIND_KMH = 40;
export function beachLife(weather, band, light, nowMs = 0) {
  const known = !!(weather && weather.known);
  const kind = weather && weather.kind ? weather.kind : 'cloud';
  const t = weather ? weather.temperature : null;
  const warm = typeof t === 'number' && Number.isFinite(t) ? t >= WARM_C : SUMMER_MONTHS.includes(new Date(nowMs).getUTCMonth());
  const fair = kind === 'clear' || (kind === 'cloud' && cloudAmount(weather ? weather.cloudCover : null, kind) < 0.7);
  const wind = weather && typeof weather.windSpeed === 'number' && Number.isFinite(weather.windSpeed) ? weather.windSpeed : 0;
  const day = clamp(((typeof light === 'number' ? light : 0) - 0.55) / 0.2);
  const gentle = band === 'calm' || band === 'moderate';
  const flag = band === 'big' || band === 'giant';
  return {
    umbrellas: known && warm && fair && gentle && wind < UMBRELLA_WIND_KMH ? day : 0,
    flag,
    onlookers: flag && fair && day > 0 ? 3 : 0,
  };
}

// The fishing boats working the horizon at night: three lights on a quiet sea,
// two on a big one, none in a giant swell, a storm or fog, and none by day.
// Each is { xs, ys } in shares of the body, drifting very slowly with the clock.
export const BOATS = [0.12, 0.3, 0.45];
export function boatLights(band, kind, night, nowMs, horizon = 0.5) {
  if (!(night > 0.3) || band === 'giant' || kind === 'storm' || kind === 'fog') return [];
  const n = band === 'big' ? 2 : 3;
  return BOATS.slice(0, n).map((x, k) => ({
    xs: x + 0.018 * Math.sin(nowMs / 90000 + 2.1 * k),
    ys: horizon + 0.007 + 0.004 * (k % 2),
    a: clamp((night - 0.3) / 0.4),
  }));
}
