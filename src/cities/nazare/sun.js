// Nazare's own sun. The view faces west over the Atlantic, so the sun comes up
// behind the headland (the land side, on the right), crosses the sky to the
// left and goes down into the open sea. The city declines the shared sky's sun
// (`sky: { sun: false }`) and draws this one, so there is never a second disc.
// Pure and canvas-free: every figure is a function of the phase and the weather.
import { sunAltitude, wrap, clamp, lerp, smoothstep } from '../../clock.js';
import { cloudAmount, gloom } from '../../weather.js';

export const SEA_HORIZON = 0.5;
// rise and set are the clock's own (sunAltitude crosses zero there)
export const SUN = { riseX: 0.86, setX: 0.24, top: 0.12, r: 0.038, rise: 0.08, set: 0.78 };
// no sun under a sky this heavy
export const SUN_GLOOM = 0.5;

// Where the sun is, in shares of the body: { alt, x, y }.
export function sunSpot(phase) {
  const q = wrap(phase);
  const alt = sunAltitude(q);
  const t = clamp((q - SUN.rise) / (SUN.set - SUN.rise));
  return { alt, x: lerp(SUN.riseX, SUN.setX, t), y: SEA_HORIZON - alt * (SEA_HORIZON - SUN.top) };
}

// How much of the sun the weather lets through, 0..1, whatever the hour: none
// without a reading (as the shared sky has it), none in rain, snow or fog, less
// behind cloud and nothing once the sky is heavy.
export function sunShare(weather) {
  if (!(weather && weather.known)) return 0;
  const kind = weather.kind;
  if (kind !== 'clear' && kind !== 'cloud') return 0;
  const heavy = gloom(weather);
  if (heavy >= SUN_GLOOM) return 0;
  return (1 - 0.85 * cloudAmount(weather.cloudCover, kind)) * (1 - heavy / SUN_GLOOM);
}

// How bright the disc is now, 0..1: nothing once it is under the horizon.
export function sunStrength(phase, weather) {
  const alt = sunAltitude(wrap(phase));
  if (alt <= -0.05) return 0;
  return sunShare(weather) * Math.min(1, 0.4 + Math.max(0, alt));
}

// How low the evening sun stands over the sea, 0..1: it starts about ninety
// minutes before sunset, is full as the disc nears the water and is gone
// just after it has set. Zero all morning: that sun is behind the land.
export const LOW_FROM = 0.42;
export function sunLow(phase) {
  const q = wrap(phase);
  if (q < 0.43) return 0;
  const alt = sunAltitude(q);
  if (alt <= -0.08) return 0;
  return smoothstep(clamp((LOW_FROM - alt) / 0.3)) * clamp((alt + 0.08) / 0.06);
}

// Which side the daylight falls from, 0..1: 0 from the land (the morning), 1
// from the sea (the evening), turning over the middle of the day.
export const seaSideLight = (phase) => smoothstep(clamp((wrap(phase) - 0.3) / 0.25));
