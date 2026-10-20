// The weather function: one own-origin endpoint that asks Open-Meteo once for
// every city on the table and hands the page a tidy body. The browser never
// calls the vendor. Reads nothing from the request (no query, no body).
// Runs as a Vercel Node function and, for local use, inside tools/serve.mjs.
import { PLACES } from '../src/cities/places.js';

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const FIELDS = 'temperature_2m,weather_code,cloud_cover,is_day,wind_speed_10m,wind_direction_10m';
const FORECAST_DAYS = 5;
const CACHE = 'public, max-age=0, s-maxage=900';

export function openMeteoUrl(places) {
  const lat = places.map((p) => p.lat).join(',');
  const lon = places.map((p) => p.lon).join(',');
  // Each location's own zone, so daily.time is that city's local date. (current.time
  // is therefore local too; it is not read.)
  const zones = places.map((p) => encodeURIComponent(p.zone)).join(',');
  return `${ENDPOINT}?latitude=${lat}&longitude=${lon}&current=${FIELDS}&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=${FORECAST_DAYS}&timezone=${zones}`;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// The vendor's daily block (parallel arrays) -> at most five { date, code, high, low }.
function dailyRows(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.time)) return [];
  const at = (a, i) => (Array.isArray(a) ? num(a[i]) : null);
  const rows = [];
  for (let i = 0; i < d.time.length && rows.length < FORECAST_DAYS; i++) {
    const date = d.time[i];
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    rows.push({ date, code: at(d.weather_code, i), high: at(d.temperature_2m_max, i), low: at(d.temperature_2m_min, i) });
  }
  return rows;
}

// The vendor body (an object for one place, an array for several) ->
// { v, fetchedAt, ok, cities }. Six numeric fields (wind in km/h and degrees
// the wind comes from) and the daily rows are kept.
export function normalise(payload, places, nowMs = Date.now()) {
  const list = Array.isArray(payload) ? payload : [payload];
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
    };
  });
  return { v: 1, fetchedAt: new Date(nowMs).toISOString(), ok: Object.keys(cities).length > 0, cities };
}

const empty = (nowMs) => ({ v: 1, fetchedAt: new Date(nowMs).toISOString(), ok: false, cities: {} });

export async function fetchWeather(places, { fetchImpl = globalThis.fetch, nowMs = Date.now() } = {}) {
  try {
    const res = await fetchImpl(openMeteoUrl(places), { signal: AbortSignal.timeout(4000) });
    if (!res || !res.ok) return empty(nowMs);
    return normalise(await res.json(), places, nowMs);
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
