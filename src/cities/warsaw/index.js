// Warsaw: the downtown cluster as a floodlit poster (Varso, the Palace of Culture
// and Science, Warsaw Spire, Zlota 44), the river above the label plate, and the
// Mermaid on her plinth on the left bank.
import { PLACES } from '../places.js';
import { buildPlates, drawSkyline, drawRiver, drawMermaid } from './scene.js';

const place = PLACES.find((p) => p.id === 'warsaw');

export default {
  id: 'warsaw',
  title: place.title,
  location: { lat: place.lat, lon: place.lon, zone: place.zone },
  lid: 'cork',
  label: { inks: { plate: 'plate', ink: 'labelInk' } },
  buildPlates,
  paint(ctx, rect, phase, tint, weather, plates, nowMs) {
    drawSkyline(ctx, rect, phase, tint, plates, weather);
    drawRiver(ctx, rect, phase, tint, weather, nowMs);
    drawMermaid(ctx, rect, phase, tint, weather);
  },
};
