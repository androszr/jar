import { clamp, smoothstep } from './clock.js';

// Weather vocabulary shared by the page and the weather function: WMO weather
// codes folded to seven kinds, cloud amount, the label's temperature text.
// Pure and Node-importable.

export const KINDS = ['clear', 'cloud', 'fog', 'drizzle', 'rain', 'snow', 'storm'];

// What a jar draws from before any answer has arrived, or after a bad one.
export const EMPTY = Object.freeze({ temperature: null, code: null, cloudCover: null, isDay: null, windSpeed: null, windDir: null, kind: 'cloud', known: false, daily: Object.freeze([]), hourly: Object.freeze([]), sea: null });

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
    const hm = (v) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : null);
    rows.push({ date: r.date, code, high: num(r.high), low: num(r.low), sunrise: hm(r.sunrise), sunset: hm(r.sunset), kind: weatherKind(code) });
  }
  return rows;
}

// The body's hourly rows (the next day, hour by hour) as the page draws from
// them; junk gives []. `time` is the city's local wall clock "YYYY-MM-DDTHH:MM"
// and is only ever read through wallToMs(time, zone).
export function normaliseHourly(list) {
  if (!Array.isArray(list)) return [];
  const rows = [];
  for (const r of list) {
    if (rows.length >= 25) break;
    if (!r || typeof r !== 'object' || typeof r.time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(r.time)) continue;
    const code = num(r.code);
    rows.push({ time: r.time, temperature: num(r.temperature), code, cloudCover: num(r.cloudCover), isDay: num(r.isDay), windSpeed: num(r.windSpeed), windDir: num(r.windDir), kind: weatherKind(code) });
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
export function upcomingRows(weather, today = null) {
  let rows = weather && Array.isArray(weather.daily) ? weather.daily : [];
  if (typeof today === 'string') rows = rows.filter((r) => r.date >= today);
  return rows;
}

// Today's { sunrise, sunset } ('HH:MM') off the first surviving row, or null
// unless both are present.
export function sunTimesFor(weather, today = null) {
  const r = upcomingRows(weather, today)[0];
  if (!r || typeof r.sunrise !== 'string' || typeof r.sunset !== 'string') return null;
  return { sunrise: r.sunrise, sunset: r.sunset };
}

// "2.4 m" (one decimal), or null for no reading.
export function formatWaveHeight(h) {
  return typeof h === 'number' && Number.isFinite(h) ? `${h.toFixed(1)} m` : null;
}

// "12 s" (rounded), or null for no reading.
export function formatPeriod(p) {
  return typeof p === 'number' && Number.isFinite(p) ? `${Math.round(p)} s` : null;
}

// "2.4 m · 12 s", "2.4 m" without a period, null without a height.
export function formatSwell(sea) {
  if (!sea || typeof sea !== 'object') return null;
  const h = formatWaveHeight(sea.waveHeight);
  if (h === null) return null;
  const p = formatPeriod(sea.wavePeriod);
  return p === null ? h : `${h} · ${p}`;
}

// The sea's daily rows as the page draws from them; junk gives [].
export function normaliseSeaDaily(list) {
  if (!Array.isArray(list)) return [];
  const rows = [];
  for (const r of list) {
    if (rows.length >= 5) break;
    if (!r || typeof r !== 'object' || typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
    rows.push({ date: r.date, waveHeightMax: num(r.waveHeightMax), wavePeriodMax: num(r.wavePeriodMax) });
  }
  return rows;
}

// The sea's hourly rows ({ time, waveHeight }, at most 25) as the page draws
// from them; junk gives [].
export function normaliseSeaHourly(list) {
  if (!Array.isArray(list)) return [];
  const rows = [];
  for (const r of list) {
    if (rows.length >= 25) break;
    if (!r || typeof r !== 'object' || typeof r.time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(r.time)) continue;
    rows.push({ time: r.time, waveHeight: num(r.waveHeight) });
  }
  return rows;
}

// { height, period } formatted for a date, joined by date string; null when none.
export function swellFor(weather, date) {
  const rows = weather && weather.sea && Array.isArray(weather.sea.daily) ? weather.sea.daily : [];
  const r = rows.find((x) => x && x.date === date);
  const height = r ? formatWaveHeight(r.waveHeightMax) : null;
  return height === null ? null : { height, period: formatPeriod(r.wavePeriodMax) };
}

export function forecastCells(weather, today = null) {
  const rows = upcomingRows(weather, today);
  const cells = [];
  for (let i = 0; i < 5; i++) {
    const r = rows[i];
    cells.push(r
      ? { day: dayName(r.date), kind: r.kind || weatherKind(r.code), high: formatTemp(r.high), low: formatTemp(r.low), today: typeof today === 'string' && i === 0 && r.date === today, swell: swellFor(weather, r.date) }
      : { day: '—', kind: 'cloud', high: '—°', low: '—°', today: false, swell: null });
  }
  return cells;
}

// The sea reading of an entry, or null when it is not an object.
function fromSea(s) {
  if (!s || typeof s !== 'object') return null;
  return { waveHeight: num(s.waveHeight), wavePeriod: num(s.wavePeriod), waveDir: num(s.waveDir), daily: normaliseSeaDaily(s.daily), hourly: normaliseSeaHourly(s.hourly) };
}

// The spoken five-day sentence; "today" goes before any cell flagged today,
// and a day with a swell reading says its peak wave height.
export function forecastSentence(cells) {
  if (!Array.isArray(cells) || !cells.length || cells[0].day === '—') return '';
  return `Next five days: ${cells.map((c) => `${c.today ? 'today ' : ''}${c.day} ${c.high} to ${c.low}${c.swell ? ` swell ${c.swell.height}` : ''}`).join(', ')}.`;
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
    hourly: normaliseHourly(e.hourly),
    sea: fromSea(e.sea),
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

// A cloud-travel anchor: when the current reading took effect and how far the
// clouds had already travelled by then (unreduced, in jar widths).
export const NO_ANCHOR = Object.freeze({ sinceMs: 0, carry: 0 });

// Cloud travel carried across readings: the carry plus what this reading's wind
// has pushed since `sinceMs`. `reduced` scales the whole sum, so the carry stays
// unreduced and a swap is continuous under either setting.
export function cloudTravel(windSpeed, windDir, nowMs, { sinceMs = 0, carry = 0, reduced = false } = {}) {
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return 0;
  const since = Number.isFinite(sinceMs) ? sinceMs : 0;
  const base = Number.isFinite(carry) ? carry : 0;
  return (reduced ? REDUCED_DRIFT : 1) * (base + cloudDrift(windSpeed, windDir, nowMs - since));
}

// The anchor for a reading landing at `atMs`. A first reading starts from the
// shared origin (NO_ANCHOR, whatever its fetchedAt: the answer is cached, so a
// fetch time would differ between an old page and a fresh one); a later one re-anchors at the landing moment carrying the old travel, so the
// position is the same just before and just after and only the pace changes.
export function nextCloudAnchor(prev, prevAnchor, atMs) {
  if (!prev || typeof prev !== 'object' || !prevAnchor || typeof prevAnchor !== 'object') {
    return NO_ANCHOR;
  }
  return Object.freeze({
    sinceMs: atMs,
    carry: cloudTravel(prev.windSpeed, prev.windDir, atMs, { sinceMs: prevAnchor.sinceMs, carry: prevAnchor.carry }),
  });
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
