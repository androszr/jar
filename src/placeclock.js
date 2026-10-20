// Adapted from Memory Lane (vir-sunset) src/placeclock.js, 2026-10-18
// The place clock: the drawn day at a city's place,
// from its registry `location` ({ lat, lon, zone }). Pure and
// Node-importable: every function takes the moment (`nowMs`, ms since the
// epoch) as an argument and never reads the wall clock (convention 5). The
// zone's offset comes from the browser's own time-zone tables through
// `Intl.DateTimeFormat`: no network, no permission, nothing persisted.

import { realPhase } from './realclock.js';

const MIN_MS = 60000;

// Formatters are costly to build (~0.1-1 ms), so each zone keeps one; the
// cache is bounded so junk zone names cannot grow it without end. An unknown
// zone is cached as `null` so it is not retried every frame.
export const FORMATTER_MAX = 8;
const formatters = new Map();
export const formatterCacheSize = () => formatters.size;

// The last offset per zone, keyed on the minute, so a frame costs a lookup.
const offsets = new Map();

function formatterFor(zone) {
  const key = typeof zone === 'string' ? zone : `\u0000${typeof zone}:${String(zone)}`;
  if (formatters.has(key)) return formatters.get(key);
  let fmt = null;
  if (typeof zone === 'string' && zone !== '') {
    try {
      fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      });
    } catch (err) {
      // An unknown zone is a RangeError: the caller falls back to the viewer's
      // clock. Anything else is a real fault and is not hidden.
      if (!(err instanceof RangeError)) throw err;
      fmt = null;
    }
  }
  formatters.set(key, fmt);
  while (formatters.size > FORMATTER_MAX) {
    const oldest = formatters.keys().next().value;
    formatters.delete(oldest);
    offsets.delete(oldest);
  }
  return fmt;
}

// Minutes *behind* UTC at `nowMs` in the IANA zone `zone` (the sign of
// `Date.prototype.getTimezoneOffset`: Zagreb in summer is -120), or `null`
// for an unknown zone or a non-string. Never throws on bad input.
export function zoneOffsetMinutes(nowMs, zone) {
  if (!Number.isFinite(nowMs)) return null;
  const minute = Math.floor(nowMs / MIN_MS);
  const key = typeof zone === 'string' ? zone : null;
  if (key !== null) {
    const hit = offsets.get(key);
    if (hit && hit.minute === minute) return hit.offset;
  }
  const fmt = formatterFor(zone);
  if (!fmt) return null;
  // Formatted from the number itself: the moment given, never the wall clock.
  const parts = fmt.formatToParts(nowMs);
  const get = (type) => {
    const p = parts.find((x) => x.type === type);
    return p ? Number.parseInt(p.value, 10) : NaN;
  };
  const y = get('year');
  const mo = get('month');
  const d = get('day');
  const h = get('hour') % 24; // an engine that prints midnight as 24
  const mi = get('minute');
  const s = get('second');
  const wallMs = Date.UTC(y, mo - 1, d, h, mi, s);
  if (!Number.isFinite(wallMs)) return null;
  const offset = Math.round((Math.floor(nowMs / 1000) * 1000 - wallMs) / MIN_MS) + 0;
  if (key !== null && formatters.has(key)) offsets.set(key, { minute, offset });
  return offset;
}

// The real clock's place ({ lat, lon, offsetMinutes }) for a city's
// `location` at `nowMs`, or `null` when there is no usable location.
export function placeAt(nowMs, location) {
  if (!location || typeof location !== 'object') return null;
  const { lat, lon, zone } = location;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const offsetMinutes = zoneOffsetMinutes(nowMs, zone);
  if (offsetMinutes === null) return null;
  return { lat, lon, offsetMinutes };
}

// The drawn day's phase at `nowMs` at the city's place; without a usable
// location, the viewer's own (`viewerPlace`, a real-clock place).
export function therePhase(nowMs, location, viewerPlace) {
  return realPhase(nowMs, placeAt(nowMs, location) || viewerPlace);
}

// "HH:MM" on the wall clock of `zone` at `nowMs`, 24-hour, midnight as 00:00;
// '--:--' for an unknown zone or a bad moment.
export function localTimeText(nowMs, zone) {
  if (!Number.isFinite(nowMs)) return '--:--';
  const fmt = formatterFor(zone);
  if (!fmt) return '--:--';
  const parts = fmt.formatToParts(nowMs);
  const get = (type) => Number.parseInt(parts.find((x) => x.type === type)?.value, 10);
  const h = get('hour') % 24;
  const m = get('minute');
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '--:--';
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const dateFormatters = new Map();
// "YYYY-MM-DD" on the wall clock of `zone` at `nowMs`; null for an unknown
// zone or a bad moment. A function of its arguments, never of the clock.
export function localDate(nowMs, zone) {
  if (!Number.isFinite(nowMs) || typeof zone !== 'string') return null;
  let fmt = dateFormatters.get(zone);
  if (!fmt) {
    try {
      fmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      return null;
    }
    dateFormatters.set(zone, fmt);
  }
  const parts = fmt.formatToParts(nowMs);
  const get = (type) => parts.find((x) => x.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
