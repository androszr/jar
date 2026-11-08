// Nazare: the Sitio headland, its fort and red-roofed lighthouse, and the Praia
// do Norte wave, sized by the real swell off the coast. The wave and the beam
// are functions of the clock, so this city asks the page for a ten-a-second tick.
import { PLACES } from '../places.js';
import { waveHeightOf, waveBand, waveSize } from './sea.js';
import {
  buildPlates, drawFarSea, drawHeadland, drawFort, drawWave, drawBeach, drawSurfers, drawBeam,
} from './scene.js';

const place = PLACES.find((p) => p.id === 'nazare');

// Read once, here, never inside a draw call (and not at all in Node).
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export default {
  id: 'nazare',
  title: place.title,
  location: { lat: place.lat, lon: place.lon, zone: place.zone, sea: place.sea },
  lid: 'tin',
  label: { inks: { plate: 'plate', ink: 'labelInk' } },
  seed: 0x5ea,
  buildPlates,
  // ms between redraws the sea needs
  cadenceMs: (weather, opts = {}) => (opts.reduced ? 250 : 100),
  paint(ctx, rect, phase, tint, weather, plates, nowMs) {
    drawFarSea(ctx, rect, phase, tint, weather, nowMs);
    drawHeadland(ctx, rect, phase, tint, weather, plates);
    drawFort(ctx, rect, phase, tint, weather, plates);
    drawWave(ctx, rect, phase, tint, weather, plates, nowMs, reduced);
    drawBeach(ctx, rect, phase, tint, weather, plates, nowMs, reduced);
    const surfers = drawSurfers(ctx, rect, phase, tint, weather, plates, nowMs, reduced);
    drawBeam(ctx, rect, phase, tint, weather, plates, nowMs, reduced);
    const metres = waveHeightOf(weather);
    return { band: waveBand(metres), waveSize: waveSize(metres), surfers };
  },
};
