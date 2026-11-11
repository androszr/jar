// The sea off Nazare, as numbers: the swell bands, the wave's size, the roll
// period and the surfers' plan. Pure and canvas-free, so Node tests it. Every
// mover is sampled from `nowMs` (read, never accumulated), so the same moment
// draws the same picture.
import { LAMP_THRESHOLD, clamp, wrap, lerp } from '../../clock.js';
import { hash2 } from '../../skyweather.js';
import { REDUCED_DRIFT } from '../../weather.js';

// [name, upper bound in metres): calm under 1 m, moderate 1-3, big 3-6, giant 6+.
export const BANDS = [['calm', 1], ['moderate', 3], ['big', 6], ['giant', Infinity]];
export const DEFAULT_WAVE_M = 2;

// metres -> share of the jar body's height (the crest above its base)
const SIZES = [[0, 0.02], [1, 0.05], [3, 0.10], [6, 0.18], [10, 0.26]];

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
