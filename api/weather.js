// The weather function: one own-origin endpoint that asks Open-Meteo once for
// every city on the table and hands the page a tidy body. The browser never
// calls the vendor. Reads nothing from the request (no query, no body).
// Runs as a Vercel Node function and, for local use, inside tools/serve.mjs.
import { PLACES } from '../src/cities/places.js';

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const FIELDS = 'temperature_2m,weather_code,cloud_cover,is_day,wind_speed_10m,wind_direction_10m';
// The sea: the wave height, period and direction off each city that has an
// offshore point (`sea` in places.js), from Open-Meteo's marine service.
const MARINE_ENDPOINT = 'https://marine-api.open-meteo.com/v1/marine';
const MARINE_FIELDS = 'wave_height,wave_period,wave_direction';
const MARINE_DAILY = 'wave_height_max,wave_period_max';
// One hourly list over all five days: the sea level (the tide times are its
// extremes) and the wave height (the lifted jar's scrub). No forecast_hours: it
// would cut today's earlier tides.
const MARINE_HOURLY = 'wave_height,sea_level_height_msl';
const FORECAST_DAYS = 5;
// Five days hour by hour (the lifted jar's scrub, and a day pressed on its
// forecast card): the same six fields as `current`, 120 rows.
const HOURLY_FIELDS = 'temperature_2m,weather_code,cloud_cover,is_day,wind_speed_10m,wind_direction_10m';
const FORECAST_HOURS = 120;
const CACHE = 'public, max-age=0, s-maxage=900';

export function openMeteoUrl(places) {
  const lat = places.map((p) => p.lat).join(',');
  const lon = places.map((p) => p.lon).join(',');
  // Each location's own zone, so daily.time is that city's local date. (current.time
  // is therefore local too; it is not read.)
  const zones = places.map((p) => encodeURIComponent(p.zone)).join(',');
  return `${ENDPOINT}?latitude=${lat}&longitude=${lon}&current=${FIELDS}&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant&hourly=${HOURLY_FIELDS}&forecast_hours=${FORECAST_HOURS}&forecast_days=${FORECAST_DAYS}&timezone=${zones}`;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// The places that carry a finite offshore point.
export function seaPlaces(places) {
  return places.filter((p) => p && p.sea && Number.isFinite(p.sea.lat) && Number.isFinite(p.sea.lon));
}

export function marineUrl(places) {
  const sea = seaPlaces(places);
  const lat = sea.map((p) => p.sea.lat).join(',');
  const lon = sea.map((p) => p.sea.lon).join(',');
  // Each sea place's own zone, so daily.time is that city's local date.
  const zones = sea.map((p) => encodeURIComponent(p.zone)).join(',');
  return `${MARINE_ENDPOINT}?latitude=${lat}&longitude=${lon}&current=${MARINE_FIELDS}&daily=${MARINE_DAILY}&hourly=${MARINE_HOURLY}&forecast_days=${FORECAST_DAYS}&timezone=${zones}&cell_selection=sea`;
}

// Hourly sea level (the city's local wall clock) -> { [date]: [{ time, kind, height }] },
// the high and low tides found as local extremes of three finite neighbours, the
// moment refined by the parabola through them. Minute arithmetic on the vendor's
// own string, never through Date (the server's zone is not the city's). An extreme
// at the very first or last hour of the series has no neighbour and is not found.
export function tideExtremes(hourly) {
  if (!hourly || typeof hourly !== 'object' || !Array.isArray(hourly.time) || !Array.isArray(hourly.sea_level_height_msl)) return {};
  const t = hourly.time;
  const h = hourly.sea_level_height_msl;
  const n = Math.min(t.length, h.length);
  const out = {};
  for (let i = 1; i < n - 1; i++) {
    const a = num(h[i - 1]);
    const b = num(h[i]);
    const c = num(h[i + 1]);
    if (a === null || b === null || c === null) continue;
    const kind = b > a && b >= c ? 'high' : b < a && b <= c ? 'low' : null;
    if (!kind) continue;
    const m = typeof t[i] === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(t[i]);
    if (!m) continue;
    const den = a - 2 * b + c;
    const off = den === 0 ? 0 : Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den));
    // Minutes since the start of the entry's own date, then rolled over midnight.
    let day = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    let mins = Math.round(+m[4] * 60 + +m[5] + off * 60);
    day += Math.floor(mins / 1440) * 86400000;
    mins = ((mins % 1440) + 1440) % 1440;
    const date = new Date(day).toISOString().slice(0, 10);
    const time = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    (out[date] = out[date] || []).push({ time, kind, height: Math.round(b * 100) / 100 });
  }
  for (const k of Object.keys(out)) out[k].sort((x, y) => (x.time < y.time ? -1 : x.time > y.time ? 1 : 0));
  return out;
}

// The marine daily block (parallel arrays) -> at most five { date, waveHeightMax, wavePeriodMax, tides }.
export function marineDailyRows(d, tidesByDate = {}) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.time)) return [];
  const at = (a, i) => (Array.isArray(a) ? num(a[i]) : null);
  const rows = [];
  for (let i = 0; i < d.time.length && rows.length < FORECAST_DAYS; i++) {
    const date = d.time[i];
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    rows.push({ date, waveHeightMax: at(d.wave_height_max, i), wavePeriodMax: at(d.wave_period_max, i), tides: (tidesByDate && tidesByDate[date]) || [] });
  }
  return rows;
}

// The marine hourly block (parallel arrays) -> at most 120 { time, waveHeight },
// from the hour containing `from` (the entry's `current.time`, local ISO; without
// it, from the first row). `time` is the vendor's local ISO "YYYY-MM-DDTHH:MM",
// kept as a string and compared as a string (same zone, fixed width); bad rows dropped.
export function marineHourlyRows(h, from = null) {
  if (!h || typeof h !== 'object' || !Array.isArray(h.time)) return [];
  const at = (a, i) => (Array.isArray(a) ? num(a[i]) : null);
  const m = typeof from === 'string' && /^(\d{4}-\d{2}-\d{2}T\d{2}):\d{2}/.exec(from);
  const start = m ? `${m[1]}:00` : null;
  const rows = [];
  for (let i = 0; i < h.time.length && rows.length < FORECAST_HOURS; i++) {
    const time = h.time[i];
    if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time)) continue;
    if (start !== null && time < start) continue;
    rows.push({ time, waveHeight: at(h.wave_height, i) });
  }
  return rows;
}

// The marine body (an object for one point, an array for several) ->
// { [id]: { waveHeight, wavePeriod, waveDir, daily, hourly } }. Junk gives nulls, never a throw.
export function normaliseMarine(payload, sea) {
  const list = Array.isArray(payload) ? payload : [payload];
  const out = {};
  sea.forEach((p, i) => {
    const cur = list[i] && typeof list[i] === 'object' ? list[i].current : null;
    out[p.id] = cur && typeof cur === 'object'
      ? { waveHeight: num(cur.wave_height), wavePeriod: num(cur.wave_period), waveDir: num(cur.wave_direction), daily: marineDailyRows(list[i].daily, tideExtremes(list[i].hourly)), hourly: marineHourlyRows(list[i].hourly, cur.time) }
      : null;
  });
  return out;
}

// The vendor's daily block (parallel arrays) -> at most five { date, code, high, low, sunrise, sunset,
// rainChance, windMax, windMaxDir }.
function dailyRows(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.time)) return [];
  const at = (a, i) => (Array.isArray(a) ? num(a[i]) : null);
  // 'HH:MM' from the vendor's local ISO string ("2026-10-18T07:05"), else null.
  const hhmm = (a, i) => {
    const s = Array.isArray(a) ? a[i] : null;
    const m = typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/.exec(s);
    return m ? m[1] : null;
  };
  const rows = [];
  for (let i = 0; i < d.time.length && rows.length < FORECAST_DAYS; i++) {
    const date = d.time[i];
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    rows.push({ date, code: at(d.weather_code, i), high: at(d.temperature_2m_max, i), low: at(d.temperature_2m_min, i), sunrise: hhmm(d.sunrise, i), sunset: hhmm(d.sunset, i), rainChance: at(d.precipitation_probability_max, i), windMax: at(d.wind_speed_10m_max, i), windMaxDir: at(d.wind_direction_10m_dominant, i) });
  }
  return rows;
}

// The vendor's hourly block (parallel arrays) -> at most 120
// { time, temperature, code, cloudCover, isDay, windSpeed, windDir }. `time` is
// the vendor's local ISO "YYYY-MM-DDTHH:MM", kept as a string; bad rows dropped.
export function hourlyRows(h) {
  if (!h || typeof h !== 'object' || !Array.isArray(h.time)) return [];
  const at = (a, i) => (Array.isArray(a) ? num(a[i]) : null);
  const rows = [];
  for (let i = 0; i < h.time.length && rows.length < FORECAST_HOURS; i++) {
    const time = h.time[i];
    if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time)) continue;
    rows.push({
      time,
      temperature: at(h.temperature_2m, i),
      code: at(h.weather_code, i),
      cloudCover: at(h.cloud_cover, i),
      isDay: at(h.is_day, i),
      windSpeed: at(h.wind_speed_10m, i),
      windDir: at(h.wind_direction_10m, i),
    });
  }
  return rows;
}

// The vendor body (an object for one place, an array for several) ->
// { v, fetchedAt, ok, cities }. Six numeric fields (wind in km/h and degrees
// the wind comes from) and the daily rows are kept, plus `sea` (the wave
// reading, or null) from the optional marine body, and `hourly` (the next 120
// hours, [] when the vendor leaves it out).
export function normalise(payload, places, nowMs = Date.now(), marinePayload = null) {
  const list = Array.isArray(payload) ? payload : [payload];
  const seas = marinePayload ? normaliseMarine(marinePayload, seaPlaces(places)) : {};
  const cities = {};
  places.forEach((p, i) => {
    const cur = list[i] && typeof list[i] === 'object' ? list[i].current : null;
    if (!cur || typeof cur !== 'object') return;
    cities[p.id] = {
      temperature: num(cur.temperature_2m),
      code: num(cur.weather_code),
      cloudCover: num(cur.cloud_cover),
      isDay: num(cur.is_day),
      windSpeed: num(cur.wind_speed_10m),
      windDir: num(cur.wind_direction_10m),
      daily: dailyRows(list[i].daily),
      hourly: hourlyRows(list[i].hourly),
      sea: seas[p.id] || null,
    };
  });
  return { v: 1, fetchedAt: new Date(nowMs).toISOString(), ok: Object.keys(cities).length > 0, cities };
}

const empty = (nowMs) => ({ v: 1, fetchedAt: new Date(nowMs).toISOString(), ok: false, cities: {} });

export async function fetchWeather(places, { fetchImpl = globalThis.fetch, nowMs = Date.now() } = {}) {
  try {
    // The marine call runs beside the weather call, only for places with a sea
    // point, and never decides `ok`: any failure of it is null seas.
    const marine = async () => {
      if (seaPlaces(places).length === 0) return null;
      try {
        const r = await fetchImpl(marineUrl(places), { signal: AbortSignal.timeout(4000) });
        return r && r.ok ? await r.json() : null;
      } catch {
        return null;
      }
    };
    // The weather body is read inside its own chain, so the marine call's wait
    // can never leave it unread past its own timeout.
    const weatherP = Promise.resolve(fetchImpl(openMeteoUrl(places), { signal: AbortSignal.timeout(4000) }))
      .then((r) => (r && r.ok ? r.json() : null));
    const [payload, marinePayload] = await Promise.all([weatherP, marine()]);
    if (payload === null) return empty(nowMs);
    return normalise(payload, places, nowMs, marinePayload);
  } catch {
    // A down or malformed vendor answers the empty shape; the page degrades.
    return empty(nowMs);
  }
}

// The last good body, kept per warm instance for the cache window, so a query
// string that busts the edge cache still costs no more than one vendor call
// per 15 minutes. Keyed on nothing: the request is never read.
const MEMO_MS = 900 * 1000;
let memo = null;
export function resetMemo() {
  memo = null;
}

export default async function handler(req, res, { fetchImpl, nowMs } = {}) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('allow', 'GET');
    res.setHeader('cache-control', 'no-store');
    res.end('method not allowed');
    return;
  }
  const now = nowMs ?? Date.now();
  let body;
  if (memo && now >= memo.at && now - memo.at < MEMO_MS) {
    body = memo.body;
  } else {
    body = await fetchWeather(PLACES, { fetchImpl, nowMs: now });
    if (body.ok) memo = { at: now, body };
  }
  res.statusCode = body.ok ? 200 : 502;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', body.ok ? CACHE : 'no-store');
  res.end(JSON.stringify(body));
}
