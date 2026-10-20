import { clamp, smoothstep } from './clock.js';

// Weather vocabulary shared by the page and the weather function: WMO weather
// codes folded to seven kinds, cloud amount, the label's temperature text.
// Pure and Node-importable.

export const KINDS = ['clear', 'cloud', 'fog', 'drizzle', 'rain', 'snow', 'storm'];

// What a jar draws from before any answer has arrived, or after a bad one.
export const EMPTY = Object.freeze({ temperature: null, code: null, cloudCover: null, isDay: null, windSpeed: null, windDir: null, kind: 'cloud', known: false, daily: Object.freeze([]) });

// WMO code -> kind. Unknown and null fall back to 'cloud'.
export function weatherKind(code) {
  if (typeof code !== 'number' || !Number.isFinite(code)) return 'cloud';
  if (code === 0) return 'clear';
  if (code >= 1 && code <= 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code >= 61 && code <= 67) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'rain';
  if (code === 85 || code === 86) return 'snow';
  if (code >= 95 && code <= 99) return 'storm';
  return 'cloud';
}

// How much sky is cloud, 0..1: the reported cover when there is one, else a
// figure for the kind.
export function cloudAmount(cover, kind) {
  if (typeof cover === 'number' && Number.isFinite(cover)) return Math.max(0, Math.min(1, cover / 100));
  switch (kind) {
    case 'clear': return 0;
    case 'fog': return 0.7;
    case 'drizzle': case 'rain': case 'snow': return 0.85;
    case 'storm': return 1;
    default: return 0.6;
  }
}

// "12°", "-3°"; a dash for no reading. A negative zero prints 0°.
export function formatTemp(t) {
  if (typeof t !== 'number' || !Number.isFinite(t)) return '—°';
  const r = Math.round(t) + 0;
  return `${Object.is(r, -0) ? 0 : r}°`;
}

export function isUsable(w) {
  return !!w && typeof w === 'object' && typeof w.temperature === 'number' && Number.isFinite(w.temperature);
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// The body's daily rows as the page draws from them; junk gives [].
export function normaliseDaily(list) {
  if (!Array.isArray(list)) return [];
  const rows = [];
  for (const r of list) {
    if (rows.length >= 5) break;
    if (!r || typeof r !== 'object' || typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
    const code = num(r.code);
    rows.push({ date: r.date, code, high: num(r.high), low: num(r.low), kind: weatherKind(code) });
  }
  return rows;
}

export const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// "2026-10-18" -> "SUN". Worked from the string, never the clock.
export function dayName(date) {
  if (typeof date !== 'string') return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return '—';
  return DAY_NAMES[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
}

// Exactly five { day, kind, high, low } cells, dashes where missing. `today`
// (the city's local "YYYY-MM-DD" at the drawn moment, optional) drops rows
// that are already past, so a stale answer never opens on yesterday.
export function forecastCells(weather, today = null) {
  let rows = weather && Array.isArray(weather.daily) ? weather.daily : [];
  if (typeof today === 'string') rows = rows.filter((r) => r.date >= today);
  const cells = [];
  for (let i = 0; i < 5; i++) {
    const r = rows[i];
    cells.push(r
      ? { day: dayName(r.date), kind: r.kind || weatherKind(r.code), high: formatTemp(r.high), low: formatTemp(r.low) }
      : { day: '—', kind: 'cloud', high: '—°', low: '—°' });
  }
  return cells;
}

// One city's entry from the function's body, as the page draws from it.
export function fromEntry(e) {
  if (!e || typeof e !== 'object') return EMPTY;
  const code = num(e.code);
  return {
    temperature: num(e.temperature),
    code,
    cloudCover: num(e.cloudCover),
    isDay: num(e.isDay),
    windSpeed: num(e.windSpeed),
    windDir: num(e.windDir),
    kind: weatherKind(code),
    known: code !== null,
    daily: normaliseDaily(e.daily),
  };
}

// ---- weather nuances: wind lean, storm flashes, dew after fog --------------
// Pure functions of their inputs, never of the clock they are not handed.

export const WIND_REF_KMH = 40;
// Radians of lean at (and past) the reference wind.
export const SLANT_MAX = Object.freeze({ rain: 0.5, drizzle: 0.35, snow: 0.7 });

// Lean of falling rain or snow in radians; positive puts the foot of a streak
// to screen-right (east). `windDir` is meteorological (where the wind comes
// FROM), so a wind from 270 degrees pushes east. Null, non-finite or calm wind,
// and a kind that does not fall, give 0. A storm falls like rain.
export function windSlant(windSpeed, windDir, kind) {
  const max = SLANT_MAX[kind === 'storm' ? 'rain' : kind];
  if (typeof max !== 'number') return 0;
  return windPush(windSpeed, windDir) * max;
}

// The wind's east-west push, -1..1; positive is screen-right (east). One
// formula for the rain's lean and the clouds' drift. Exactly 0 (never -0) for a
// missing, non-finite or calm wind.
export function windPush(windSpeed, windDir) {
  if (typeof windSpeed !== 'number' || !Number.isFinite(windSpeed) || windSpeed <= 0) return 0;
  if (typeof windDir !== 'number' || !Number.isFinite(windDir)) return 0;
  const v = clamp((-Math.sin((windDir * Math.PI) / 180) * windSpeed) / WIND_REF_KMH, -1, 1);
  return Math.abs(v) < 1e-9 ? 0 : v; // due north or south: no sideways push, never -0
}

// One jar width of cloud travel per this many ms at full push.
export const CLOUD_DRIFT_MS = 90000;
// Under reduced motion the push is scaled to this share, never to zero.
export const REDUCED_DRIFT = 0.4;

// The wind term of a cloud's position, in jar widths (unbounded; the caller
// wraps). A pure function of the reading and `nowMs`; calm or missing wind is 0.
export function cloudDrift(windSpeed, windDir, nowMs, { reduced = false } = {}) {
  const push = windPush(windSpeed, windDir);
  if (push === 0 || typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return 0;
  return (push * (reduced ? REDUCED_DRIFT : 1) * nowMs) / CLOUD_DRIFT_MS;
}

// Each burst is [atFraction of the period, length in ms, peak 0..1].
const STORM = { periodMs: 14000, bursts: [[0.12, 90, 1.0], [0.145, 60, 0.55], [0.71, 70, 0.7]] };
const HAIL = { periodMs: 8000, bursts: [[0.1, 90, 1.0], [0.13, 50, 0.6], [0.52, 80, 0.85], [0.86, 60, 0.5]] };
export const FLASH = Object.freeze({ 95: STORM, 96: HAIL, 97: STORM, 98: STORM, 99: HAIL });

const REDUCED_PEAK = 0.45;
const REDUCED_HALF_MS = 1500;
const burstAt = (periodMs, b) => Math.round(b[0] * periodMs);

// Lightning at `nowMs` for a WMO code, 0..1. Zero outside a thunderstorm.
// Sharp: each burst starts at its peak and fades linearly over its length.
// Reduced motion: a slow bell of at most 0.45 around each burst instead.
export function flashIntensity(code, nowMs, { reduced = false } = {}) {
  if (weatherKind(code) !== 'storm') return 0;
  const f = FLASH[code];
  if (!f || typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return 0;
  const t = ((nowMs % f.periodMs) + f.periodMs) % f.periodMs;
  let v = 0;
  for (const b of f.bursts) {
    const at = burstAt(f.periodMs, b);
    if (reduced) {
      const d = Math.abs(t - at);
      const dist = Math.min(d, f.periodMs - d);
      v = Math.max(v, REDUCED_PEAK * smoothstep(1 - dist / REDUCED_HALF_MS));
    } else {
      const d = t - at;
      if (d >= 0 && d < b[1]) v += b[2] * (1 - d / b[1]);
    }
  }
  return clamp(v, 0, 1);
}

// The first moment at or after `fromMs` (whole ms) when the strongest burst of
// a storm code is at its peak; null for a code that is not a storm.
export function nextFlashPeak(code, fromMs) {
  if (weatherKind(code) !== 'storm' || !FLASH[code]) return null;
  const f = FLASH[code];
  const at = burstAt(f.periodMs, f.bursts[0]);
  const k = Math.ceil((fromMs - at) / f.periodMs);
  return at + k * f.periodMs;
}

export const DEW_MS = 45 * 60 * 1000;

// How much dew is left `sinceMs` after a fog cleared: 1 at once, fading to 0
// at DEW_MS. Null, negative or past the end is 0.
export function dewAmount(sinceMs) {
  if (typeof sinceMs !== 'number' || !Number.isFinite(sinceMs) || sinceMs < 0 || sinceMs >= DEW_MS) return 0;
  return 1 - smoothstep(sinceMs / DEW_MS);
}
