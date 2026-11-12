// The scrub model: a lifted jar previewed at a moment up to a day ahead. Pure
// and Node-importable; every function takes its moment as an argument and none
// reads the clock (convention 4). The offset is minutes ahead of now.
import { weatherKind } from './weather.js';
import { wallToMs } from './placeclock.js';

export const SCRUB_MAX_MIN = 1440;
export const SCRUB_STEP_MIN = 30;

// A slider value -> a whole number of steps in 0..SCRUB_MAX_MIN; junk -> 0.
export function clampScrub(min) {
  if (typeof min !== 'number' || !Number.isFinite(min)) return 0;
  const snapped = Math.round(min / SCRUB_STEP_MIN) * SCRUB_STEP_MIN;
  return Math.max(0, Math.min(SCRUB_MAX_MIN, snapped)) + 0;
}

// "now", "+5 h", "+5½ h" (the one non-ASCII glyph; the monospace stack has it).
export function offsetText(min) {
  const m = clampScrub(min);
  if (m === 0) return 'now';
  const h = Math.floor(m / 60);
  const half = m % 60 ? '½' : '';
  return `+${h === 0 ? '' : h}${half} h`;
}

// A preview may reach further than the slider: a day pressed on the forecast
// card. Whole minutes in 0..PREVIEW_MAX_MIN; junk -> 0.
export const PREVIEW_MAX_MIN = 5 * 1440;
export function clampPreview(min) {
  if (typeof min !== 'number' || !Number.isFinite(min)) return 0;
  return Math.max(0, Math.min(PREVIEW_MAX_MIN, Math.round(min))) + 0;
}

// The label of any preview: the slider's own wording up to a day ahead, then
// days and hours ("+2 d 3 h", "+3 d").
export function offsetLabel(min) {
  const m = clampPreview(min);
  if (m <= SCRUB_MAX_MIN) return offsetText(m);
  let d = Math.floor(m / 1440);
  let h = Math.round((m % 1440) / 60);
  if (h === 24) { d += 1; h = 0; }
  return `+${d} d${h ? ` ${h} h` : ''}`;
}

// Minutes from `nowMs` to the early afternoon (13:00 on the city's own wall
// clock) of `date` ("YYYY-MM-DD"): where a pressed forecast day previews. 0
// when that moment is not ahead of now, or the date cannot be read.
export const DAY_PREVIEW_HOUR = 13;
export function dayPreviewMin(nowMs, date, zone) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 0;
  const at = wallToMs(`${date}T${String(DAY_PREVIEW_HOUR).padStart(2, '0')}:00`, zone);
  if (at === null || !Number.isFinite(nowMs) || at <= nowMs) return 0;
  return clampPreview((at - nowMs) / 60000);
}

export function scrubMoment(nowMs, min) {
  return nowMs + clampScrub(min) * 60000;
}

// The row covering `atMs`: of `rows` ({ time } in `zone`'s wall clock), the
// latest at or before it and within 60 minutes of it; else null.
export function rowAt(rows, atMs, zone) {
  if (!Array.isArray(rows) || !Number.isFinite(atMs)) return null;
  let best = null;
  let bestMs = -Infinity;
  for (const row of rows) {
    const t = wallToMs(row && row.time, zone);
    if (t === null || t > atMs || atMs - t > 3600000) continue;
    if (t > bestMs) { best = row; bestMs = t; }
  }
  return best;
}

// The hourly weather row covering `atMs`, or null.
export function hourlyAt(weather, atMs, zone) {
  return rowAt(weather && weather.hourly, atMs, zone);
}

// The hourly sea row covering `atMs` whose waveHeight is a finite number, or null.
export function seaHourlyAt(sea, atMs, zone) {
  const row = rowAt(sea && sea.hourly, atMs, zone);
  return row && typeof row.waveHeight === 'number' && Number.isFinite(row.waveHeight) ? row : null;
}

// `sea` as it will be at `atMs`: the identical object when no hourly row
// applies, else a copy with only the wave height swapped.
export function previewSea(sea, atMs, zone) {
  const row = seaHourlyAt(sea, atMs, zone);
  return row ? { ...sea, waveHeight: row.waveHeight } : sea;
}

// `weather` as it will be at `atMs`: the same object when neither an hourly
// weather row nor an hourly sea row applies, else a copy whose six current
// fields (and kind, known) come from the weather row and whose sea comes from
// previewSea, whichever apply.
export function previewWeather(weather, atMs, zone) {
  const row = hourlyAt(weather, atMs, zone);
  const sea = weather ? previewSea(weather.sea, atMs, zone) : weather;
  const seaMoved = !!weather && sea !== weather.sea;
  if (!row && !seaMoved) return weather;
  const out = { ...weather, sea };
  if (!row) return out;
  const code = typeof row.code === 'number' ? row.code : null;
  return {
    ...out,
    temperature: row.temperature ?? null,
    code,
    cloudCover: row.cloudCover ?? null,
    isDay: row.isDay ?? null,
    windSpeed: row.windSpeed ?? null,
    windDir: row.windDir ?? null,
    kind: weatherKind(code),
    known: code !== null,
  };
}
