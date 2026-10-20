// Adapted from Memory Lane (vir-sunset) src/clock.js, 2026-10-18
// The day clock. Everything in the scene is a pure function of the day phase
// (0..1, looping), never of wall time, so the loop closes without a jump.

export const DEFAULT_DAY_LENGTH = 240; // seconds of wall time per day
export const HORIZON_Y = 456; // logical px (38% of 1200)

// Keyframes around the loop. `night` holds from 0.88 to 0.98, then the
// last stretch eases back into dawn at 1.00 == 0.00.
export const KEYFRAMES = [
  { at: 0.0, name: 'dawn', light: 0.36 },
  { at: 0.08, name: 'sunrise', light: 0.62 },
  { at: 0.2, name: 'morning', light: 0.9 },
  { at: 0.4, name: 'noon', light: 1 },
  { at: 0.55, name: 'afternoon', light: 0.95 },
  { at: 0.68, name: 'golden', light: 0.8 },
  { at: 0.76, name: 'sunset', light: 0.58 },
  { at: 0.82, name: 'dusk', light: 0.32 },
  { at: 0.88, name: 'night', light: 0.08 },
  { at: 0.98, name: 'night', light: 0.08 },
];

// Lamps and windows are lit below this light.
export const LAMP_THRESHOLD = 0.45;

export const wrap = (p) => p - Math.floor(p);
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};

// Wall seconds -> day phase in [0, 1).
export function dayPhase(t, dayLength = DEFAULT_DAY_LENGTH) {
  return wrap(t / dayLength);
}

// Which two keyframes bracket phase p, and how far between them (0..1,
// smoothstepped). The last keyframe wraps to the first at 1 + first.at.
export function bracket(p) {
  const q = wrap(p);
  const n = KEYFRAMES.length;
  for (let i = 0; i < n; i++) {
    const a = KEYFRAMES[i];
    const b = KEYFRAMES[(i + 1) % n];
    const end = i === n - 1 ? 1 + b.at : b.at;
    if (q >= a.at && q < end) return { a, b, t: smoothstep((q - a.at) / (end - a.at)) };
  }
  return { a: KEYFRAMES[0], b: KEYFRAMES[1], t: 0 };
}

// The look-free sample at phase p: the interpolated light level plus the two
// bracketing keyframe names and the blend between them. A look module does its
// own colour interpolation from { a, b, t }.
export function sample(p) {
  const { a, b, t } = bracket(p);
  return { light: lerp(a.light, b.light, t), a: a.name, b: b.name, t };
}

export function lightLevel(p) {
  return sample(p).light;
}

export function isNight(p) {
  return lightLevel(p) < LAMP_THRESHOLD;
}

// Sun altitude: rises at 0.08, peaks at noon, touches the sea at ~0.76 and is
// gone by 0.78; below the horizon the rest of the loop (continuous at both).
const RISE = 0.08;
const SET = 0.78;
export function sunAltitude(p) {
  const q = wrap(p);
  if (q >= RISE && q <= SET) return Math.sin((Math.PI * (q - RISE)) / (SET - RISE));
  const under = wrap(q - SET) / (1 - (SET - RISE));
  return -0.6 * Math.sin(Math.PI * under);
}

// Sun on the canvas (logical px): crosses left to right through the day.
export function sunPos(p) {
  const q = wrap(p);
  const alt = sunAltitude(q);
  const x = 250 + ((q - 0.4) / (SET - 0.4)) * 800;
  const y = HORIZON_Y - alt * 440;
  return { alt, x, y };
}

// Moon: rises on the right after dusk, arcs left, fades into dawn. Altitude is negative whenever it is down.
export function moonPos(p) {
  const q = wrap(p - 0.8);
  const span = 0.32;
  const alt = q <= span ? Math.sin((Math.PI * q) / span) : -0.3 * Math.sin((Math.PI * (q - span)) / (1 - span));
  const x = 1400 - (q / span) * 1000;
  const y = HORIZON_Y - Math.max(alt, -0.2) * 360;
  return { alt, x, y };
}

// Helper for motion that must loop with the day: `cycles` whole cycles per
// day, so the value at phase 1 equals the value at phase 0.
export function osc(p, cycles, offset = 0) {
  return Math.sin(2 * Math.PI * (p * cycles + offset));
}

// URL options: ?jar=<id> (open straight onto that jar, lifted), ?day=<seconds
// per day>, ?at=<0..1 start phase>, ?clock=real|there. The page always runs on
// the real clocks today; the loop options stay so a later card can reuse them.
export function readOptions(search) {
  const params = new URLSearchParams(search || '');
  const day = Number.parseFloat(params.get('day'));
  const at = Number.parseFloat(params.get('at'));
  const c = params.get('clock');
  return {
    jar: params.get('jar') || null,
    dayLength: Number.isFinite(day) && day > 0 ? day : DEFAULT_DAY_LENGTH,
    startPhase: Number.isFinite(at) ? wrap(at) : 0.3,
    clock: c === 'real' || c === 'there' ? c : 'real',
  };
}
