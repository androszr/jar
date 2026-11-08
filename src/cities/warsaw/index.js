// Warsaw: the skyline seen from the Praga bank (Varso, the Palace of Culture and
// Science, Zlota 44, the InterContinental, Warsaw Spire, the Cosmopolitan), the
// narrow Vistula, the Swietokrzyski Bridge landing on the near bank, and a small
// Mermaid on the far quay beside the bridge.
import { PLACES } from '../places.js';
import { buildPlates, drawSkyline, drawRiver, drawMermaid } from './scene.js';
import { drawBridge } from './bridge.js';

const place = PLACES.find((p) => p.id === 'warsaw');

export default {
  id: 'warsaw',
  title: place.title,
  country: place.country,
  location: { lat: place.lat, lon: place.lon, zone: place.zone },
  lid: 'cork',
  label: { inks: { plate: 'plate', ink: 'labelInk' } },
  buildPlates,
  paint(ctx, rect, phase, tint, weather, plates, nowMs) {
    drawSkyline(ctx, rect, phase, tint, plates, weather, nowMs);
    drawRiver(ctx, rect, phase, tint, weather, nowMs);
    drawBridge(ctx, rect, phase, tint, weather);
    drawMermaid(ctx, rect, phase, tint, weather);
  },
};
