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

// How far through the city's daylight `nowMs` is: 0 at sunrise, 1 at sunset,
// below 0 before and above 1 after (unclamped), null when it cannot be known
// (bad moment, unknown zone, missing or odd 'HH:MM' times). Pure.
export function sunFraction(nowMs, zone, sun) {
  const ok = (s) => typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);
  if (!Number.isFinite(nowMs) || !sun || typeof sun !== 'object' || !ok(sun.sunrise) || !ok(sun.sunset)) return null;
  const mins = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const now = localTimeText(nowMs, zone);
  if (now === '--:--') return null;
  const rise = mins(sun.sunrise);
  const set = mins(sun.sunset);
  if (!(set > rise)) return null;
  return (mins(now) - rise) / (set - rise);
}

// How far through the city's calendar day `nowMs` is: minutes since local
// midnight / 1440 (0 <= t < 1), null for a bad moment or an unknown zone.
// The same seam as sunFraction, so the tide dot and the sun agree on "now". Pure.
export function dayFraction(nowMs, zone) {
  if (!Number.isFinite(nowMs)) return null;
  const s = localTimeText(nowMs, zone);
  if (s === '--:--') return null;
  return (Number(s.slice(0, 2)) * 60 + Number(s.slice(3))) / 1440;
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

// The epoch ms of a wall-clock "YYYY-MM-DDTHH:MM" in `zone`; null for a bad
// string or an unknown zone. The offset is read at the guess and again at the
// corrected moment, so a DST change inside that window lands on the right side.
// Pure: it never reads the clock.
export function wallToMs(localIso, zone) {
  const m = typeof localIso === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localIso);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const back = new Date(guess);
  if (!Number.isFinite(guess) || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || h > 23 || mi > 59) return null;
  const off1 = zoneOffsetMinutes(guess, zone);
  if (off1 === null) return null;
  const off2 = zoneOffsetMinutes(guess + off1 * MIN_MS, zone);
  return guess + (off2 === null ? off1 : off2) * MIN_MS;
}
