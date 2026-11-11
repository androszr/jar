// El Chalten: Fitz Roy seen from the east shore of Laguna de los Tres, looking
// west. The question the town asks every morning, can you see Fitz Roy today,
// is answered by the weather: the wall stands clear, smokes a banner cloud,
// wears a cap of cloud, or is gone, and the label's fourth line says which.
import { PLACES } from '../places.js';
import { drawPrecipitation, drawStormFlash } from '../../skyweather.js';
import { minutesToSunrise, visibilityBand, plumeLength, glowStrength, cadenceOf, deckHeight } from './massif.js';
import { SHORE, buildPlates, layout, mood, drawSky, drawWall, drawGlacier, drawMoraine, drawPlume, drawDeck } from './scene.js';
import { drawLake } from './water.js';
import { drawShore } from './shore.js';

// Read once, here, never inside a draw call (and not at all in Node).
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const place = PLACES.find((p) => p.id === 'el-chalten');
const location = { lat: place.lat, lon: place.lon, zone: place.zone };

export default {
  id: 'el-chalten',
  title: place.title,
  country: place.country,
  location,
  lid: 'cork',
  label: { inks: { plate: 'plate', ink: 'labelInk' } },
  seed: 0xf172,
  // the view faces west: the sun never rises in frame, so the shared sun is declined
  sky: { sun: false },
  buildPlates,
  // the fourth line of the label; none without a reading
  labelLine: (weather) => (weather && weather.known ? `FITZ ROY · ${visibilityBand(weather).toUpperCase()}` : null),
  // ms between redraws: wind moves the plume, deck and ripples; headlamps flicker before dawn
  cadenceMs: (weather, opts = {}) => cadenceOf(weather, opts, location),
  paint(ctx, rect, phase, tint, weather, plates, nowMs) {
    const L = layout(rect.w, rect.h, rect.x, rect.y);
    const m = mood(tint, weather, nowMs, location);
    const seen = m.band !== 'hidden';
    drawSky(ctx, L, phase, tint, plates, m);
    if (seen) {
      drawWall(ctx, L, phase, tint, plates, m);
      drawGlacier(ctx, L, phase, tint, plates, m);
    }
    drawMoraine(ctx, L, phase, tint, plates, m);
    drawPlume(ctx, L, phase, tint, plates, nowMs, m);
    drawDeck(ctx, L, phase, tint, plates, nowMs, m);
    drawLake(ctx, L, phase, tint, plates, nowMs, m, () => {
      if (seen) {
        // the deck hides the spires from the water too: reflect only what sits below it
        ctx.save();
        if (m.band === 'capped') {
          ctx.beginPath();
          ctx.rect(L.ox, L.Y(deckHeight(m.cover)), L.w, L.Y(SHORE) - L.Y(deckHeight(m.cover)));
          ctx.clip();
        }
        drawWall(ctx, L, phase, tint, plates, m);
        drawGlacier(ctx, L, phase, tint, plates, m);
        ctx.restore();
      }
      // ... and the deck itself, so the water under a cap does not look like open sky
      if (m.band === 'capped') drawDeck(ctx, L, phase, tint, plates, nowMs, m);
      drawMoraine(ctx, L, phase, tint, plates, m);
      drawPlume(ctx, L, phase, tint, plates, nowMs, m);
    });
    const shore = drawShore(ctx, L, phase, tint, plates, nowMs, m, minutesToSunrise(nowMs, location));
    // the scene covers the shared sky, so the rain and snow fall again in front of it
    drawPrecipitation(ctx, rect, weather, nowMs);
    drawStormFlash(ctx, rect, weather, nowMs, { reduced });
    return {
      band: m.band,
      plume: m.band === 'clear' || m.band === 'smoking' ? plumeLength(m.wind) : 0,
      glow: seen ? glowStrength(phase) : 0,
      mirror: m.mirror,
      frozen: m.frozen,
      headlamps: shore.headlamps,
      hiker: shore.hiker,
      condor: shore.condor,
      season: m.season,
    };
  },
};
