// Warsaw: the skyline seen from the Praga bank (Varso, the Palace of Culture and
// Science, Zlota 44, the InterContinental, Warsaw Spire, the Cosmopolitan), the
// narrow Vistula, the Swietokrzyski Bridge landing on the near bank, and a small
// Mermaid on the far quay beside the bridge. In a hard frost (below -5 C) ice floes
// drift right on the river, so then, and only then, the city asks for a tick.
import { PLACES } from '../places.js';
import { buildPlates, drawSkyline, drawRiver, drawMermaid, iceAmount } from './scene.js';
import { drawBridge } from './bridge.js';

const place = PLACES.find((p) => p.id === 'warsaw');

// Read once, here, never inside a draw call (and not at all in Node).
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export default {
  id: 'warsaw',
  title: place.title,
  country: place.country,
  location: { lat: place.lat, lon: place.lon, zone: place.zone },
  lid: 'cork',
  label: { inks: { plate: 'plate', ink: 'labelInk' } },
  buildPlates,
  cadenceMs: (weather, opts = {}) => (iceAmount(weather) > 0 ? (opts.reduced ? 500 : 250) : 0),
  paint(ctx, rect, phase, tint, weather, plates, nowMs) {
    drawSkyline(ctx, rect, phase, tint, plates, weather, nowMs);
    drawRiver(ctx, rect, phase, tint, weather, nowMs, reduced);
    drawBridge(ctx, rect, phase, tint, weather);
    drawMermaid(ctx, rect, phase, tint, weather);
  },
};
