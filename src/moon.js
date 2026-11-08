// The moon's phase from the moment alone, by the mean synodic month counted
// from the new moon of 6 January 2000 18:14 UTC (the usual reference epoch).
// Colour-free: how the disc looks lives in the look (moonDisc). The mean
// cycle drifts up to about 14 hours from the true phase, which never crosses
// an eighth of the cycle.

export const SYNODIC_MS = 29.530588853 * 86400000;
export const REFERENCE_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);
export const PHASE_NAMES = ['new', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full', 'waning gibbous', 'last quarter', 'waning crescent'];

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function moonAgeMs(nowMs) {
  return (((nowMs - REFERENCE_NEW_MOON_MS) % SYNODIC_MS) + SYNODIC_MS) % SYNODIC_MS;
}

// { fraction, illumination, waxing, name }; no moment given draws a full moon.
export function moonPhase(nowMs) {
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) {
    return { fraction: 0.5, illumination: 1, waxing: false, name: 'full' };
  }
  const fraction = moonAgeMs(nowMs) / SYNODIC_MS;
  return {
    fraction,
    illumination: (1 - Math.cos(2 * Math.PI * fraction)) / 2,
    waxing: fraction < 0.5,
    name: PHASE_NAMES[Math.round(fraction * 8) % 8],
  };
}

// The factor every moon glow is multiplied by: a new moon keeps a trace.
export function moonGlow(illumination) {
  return 0.12 + 0.88 * clamp01(illumination);
}
