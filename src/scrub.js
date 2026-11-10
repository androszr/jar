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
