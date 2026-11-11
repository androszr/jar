// Warsaw: the skyline seen from the Praga bank (Varso, the Palace of Culture and
// Science, Zlota 44, the InterContinental, Warsaw Spire, the Cosmopolitan), the
// narrow Vistula, the Swietokrzyski Bridge landing on the near bank, and a small
// Mermaid on the far quay beside the bridge. After dark small white and red
// lights move along the deck, driven by nowMs; in a hard frost (below -5 C) ice
// floes drift right on the river. The traffic's tick carries the ice too.
import { PLACES } from '../places.js';
import { buildPlates, drawSkyline, drawRiver, drawMermaid } from './scene.js';
import { drawBridge } from './bridge.js';

const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const place = PLACES.find((p) => p.id === 'warsaw');

export default {
  id: 'warsaw',
  title: place.title,
  country: place.country,
  location: { lat: place.lat, lon: place.lon, zone: place.zone },
  lid: 'cork',
  label: { inks: { plate: 'plate', ink: 'labelInk' } },
  buildPlates,
  // the bridge traffic's 200 ms tick (400 reduced) is never slower than the ice needs (250 / 500)
  cadenceMs: (weather, opts = {}) => (opts.reduced ? 400 : 200),
  paint(ctx, rect, phase, tint, weather, plates, nowMs) {
    drawSkyline(ctx, rect, phase, tint, plates, weather, nowMs);
    drawRiver(ctx, rect, phase, tint, weather, nowMs, reduced);
    drawBridge(ctx, rect, phase, tint, weather, nowMs, reduced);
    drawMermaid(ctx, rect, phase, tint, weather);
  },
};
