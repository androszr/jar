// The page's weather: fetches the own-origin /api/weather once at start and
// every 15 minutes after, only while the tab is visible. Keeps the last good
// answer on any failure for STALE_MS (45 minutes, measured by the feed's own
// clock from when it was accepted), then answers EMPTY until the next good
// one. A failed attempt is tried again soon (RETRY_MS), so a visitor who
// arrives during a vendor hiccup is not left without weather for 15 minutes.
// Never throws.
import { EMPTY, NO_ANCHOR, fromEntry, nextCloudAnchor, weatherKind } from './weather.js';

export const REFRESH_MS = 15 * 60 * 1000;
// After a failed attempt: 5 s, 15 s, 30 s, 60 s, then back to the 15-minute
// schedule, so a long outage costs four extra calls per page and no more.
export const RETRY_MS = [5000, 15000, 30000, 60000];
export const STALE_MS = 3 * REFRESH_MS; // 45 minutes: three missed refreshes and the held answer is no longer shown

export class WeatherFeed {
  constructor({ fetchImpl = globalThis.fetch?.bind(globalThis), now = () => Date.now(), visible = () => true } = {}) {
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.visible = visible;
    this.cities = {};
    this.lastMs = null;
    this.goodAt = null; // feed-clock ms of the last accepted answer
    this.revision = 0;
    this.busy = false;
    this.fails = 0; // failed attempts in a row
    this.stopped = true;
    this.key = '';
    // city id -> when this session saw its fog lift. Memory only, never stored:
    // a reload forgets the dew.
    this.fogClearedAt = new Map();
    this.inFog = new Set(); // cities whose last coded answer was fog
    this.anchors = new Map(); // city id -> { sinceMs, carry }, memory only like fogClearedAt
    this.winds = new Map(); // city id -> the wind its anchor was set for, kept across an answer that leaves the city out
  }

  start() {
    this.stopped = false;
    return this.refresh();
  }

  stop() {
    this.stopped = true;
  }

  // Strict >, so exactly STALE_MS is fresh and a negative age (a pinned or
  // rewound clock) is fresh too.
  isStale(nowMs = this.now()) {
    return this.goodAt !== null && nowMs - this.goodAt > STALE_MS;
  }

  get(id) {
    return this.isStale() ? EMPTY : (this.cities[id] || EMPTY);
  }

  // Ms since this session saw `id`'s fog lift, or null when it has not.
  dewSince(id, nowMs) {
    return this.fogClearedAt.has(id) ? nowMs - this.fogClearedAt.get(id) : null;
  }

  // The cloud-travel anchor for `id`; NO_ANCHOR before any answer.
  cloudAnchor(id) {
    return this.anchors.get(id) || NO_ANCHOR;
  }

  nextRefreshAt(lastMs) {
    return lastMs + REFRESH_MS;
  }

  // When the next attempt is due: soon after a failure, else on the schedule.
  dueAt(lastMs = this.lastMs) {
    const soon = this.fails > 0 ? RETRY_MS[this.fails - 1] : undefined;
    return soon === undefined ? this.nextRefreshAt(lastMs) : lastMs + soon;
  }

  // Take a /api/weather body; true when the answer changed what is drawn.
  applyResponse(body, atMs = this.now()) {
    if (!body || typeof body !== 'object' || body.v !== 1 || !body.cities || typeof body.cities !== 'object') return false;
    const next = {};
    for (const [id, entry] of Object.entries(body.cities)) next[id] = fromEntry(entry);
    const key = JSON.stringify(next);
    if (Object.keys(next).length === 0) return false;
    for (const [id, now] of Object.entries(next)) {
      // An answer with no usable code says nothing about fog either way.
      if (!now.known) continue;
      if (weatherKind(now.code) === 'fog') {
        this.fogClearedAt.delete(id);
        this.inFog.add(id);
      } else if (this.inFog.delete(id)) this.fogClearedAt.set(id, this.now());
    }
    for (const [id, now] of Object.entries(next)) {
      const prev = this.winds.get(id);
      if (!prev || !this.anchors.has(id)) this.anchors.set(id, nextCloudAnchor(null, null, atMs));
      else if (prev.windSpeed !== now.windSpeed || prev.windDir !== now.windDir) {
        this.anchors.set(id, nextCloudAnchor(prev, this.anchors.get(id), atMs));
      }
      this.winds.set(id, { windSpeed: now.windSpeed, windDir: now.windDir });
    }
    // goodAt moves only on an accepted body, never on a failed attempt (lastMs does).
    const wasStale = this.isStale();
    this.goodAt = this.now();
    this.cities = next;
    if (key === this.key && !wasStale) return false;
    this.key = key;
    this.revision += 1;
    return true;
  }

  async refresh() {
    if (this.busy || !this.fetchImpl) return;
    this.busy = true;
    // Counted as an attempt either way, so a failing vendor is retried on the
    // schedule rather than every frame.
    this.lastMs = this.now();
    let good = false;
    try {
      const res = await this.fetchImpl('/api/weather');
      if (res && res.ok) {
        this.applyResponse(await res.json());
        good = true;
      }
    } catch {
      // keep the last good answer; the jar draws from the clock alone
    } finally {
      this.fails = good ? 0 : this.fails + 1;
      this.busy = false;
    }
  }

  // Called from the render loop: refetch only when due and the tab is visible.
  tick(nowMs) {
    if (this.stopped || this.busy) return null;
    if (this.lastMs !== null && nowMs < this.dueAt()) return null;
    if (!this.visible()) return null;
    return this.refresh();
  }
}
