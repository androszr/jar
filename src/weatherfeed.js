// The page's weather: fetches the own-origin /api/weather once at start and
// every 15 minutes after, only while the tab is visible. Keeps the last good
// answer on any failure and never throws.
import { EMPTY, fromEntry, weatherKind } from './weather.js';

export const REFRESH_MS = 15 * 60 * 1000;

export class WeatherFeed {
  constructor({ fetchImpl = globalThis.fetch?.bind(globalThis), now = () => Date.now(), visible = () => true } = {}) {
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.visible = visible;
    this.cities = {};
    this.lastMs = null;
    this.revision = 0;
    this.busy = false;
    this.stopped = true;
    this.key = '';
    // city id -> when this session saw its fog lift. Memory only, never stored:
    // a reload forgets the dew.
    this.fogClearedAt = new Map();
    this.inFog = new Set(); // cities whose last coded answer was fog
  }

  start() {
    this.stopped = false;
    return this.refresh();
  }

  stop() {
    this.stopped = true;
  }

  get(id) {
    return this.cities[id] || EMPTY;
  }

  // Ms since this session saw `id`'s fog lift, or null when it has not.
  dewSince(id, nowMs) {
    return this.fogClearedAt.has(id) ? nowMs - this.fogClearedAt.get(id) : null;
  }

  nextRefreshAt(lastMs) {
    return lastMs + REFRESH_MS;
  }

  // Take a /api/weather body; true when the answer changed what is drawn.
  applyResponse(body) {
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
    this.cities = next;
    if (key === this.key) return false;
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
    try {
      const res = await this.fetchImpl('/api/weather');
      if (res && res.ok) this.applyResponse(await res.json());
    } catch {
      // keep the last good answer; the jar draws from the clock alone
    } finally {
      this.busy = false;
    }
  }

  // Called from the render loop: refetch only when due and the tab is visible.
  tick(nowMs) {
    if (this.stopped || this.busy) return null;
    if (this.lastMs !== null && nowMs < this.nextRefreshAt(this.lastMs)) return null;
    if (!this.visible()) return null;
    return this.refresh();
  }
}
