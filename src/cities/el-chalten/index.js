// El Chalten: Fitz Roy seen from the east shore of Laguna de los Tres, looking
// west. The question the town asks every morning, can you see Fitz Roy today,
// is answered by the weather: the wall stands clear, smokes a banner cloud,
// wears a cap of cloud, or is gone, and the label's fourth line says which.
import { PLACES } from '../places.js';
import { drawPrecipitation, drawStormFlash } from '../../skyweather.js';
import { minutesToSunrise, visibilityBand, windOf, plumeLength, glowStrength, cadenceOf, deckHeight, monthAt, seasonOf } from './massif.js';
import { SHORE, GRAVEL, buildPlates, layout, mood, drawWall, drawGlacier, drawMoraine } from './scene.js';
import { drawSky, drawPlume, drawLens, drawSpindrift, drawDeck } from './air.js';
import { drawLake } from './water.js';
import { drawShore } from './shore.js';
import { shoreFolk, sunWindow, WALK_TICK_MS } from './tourists.js';

// Read once, here, never inside a draw call (and not at all in Node).
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const place = PLACES.find((p) => p.id === 'el-chalten');
const location = { lat: place.lat, lon: place.lon, zone: place.zone };

// The daytime tick: between sunrise and sunset, in any air that moves at all
// (STILL_AIR km/h and up), something small is always moving: the condor on a
// clear day, or the water at the shore unless the lake is frozen. In dead still
// air the lake is glass and the jar keeps its once-a-minute redraw.
export const DAY_TICK_MS = 250;
export const STILL_AIR = 5;
function dayTick(weather, nowMs, season) {
  if (windOf(weather) < STILL_AIR) return false;
  const sun = sunWindow(nowMs, location);
  if (!sun || nowMs < sun.rise || nowMs > sun.set) return false;
  return season !== 'winter' || visibilityBand(weather) === 'clear';
}

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
  // ... and somebody walking along the shore asks for a quicker one
  // ... by day, unless the air is dead still, the condor circles and the water laps at the
  // shore (DAY_TICK_MS, slower under reduced motion; not by night, when neither can be seen)
  cadenceMs(weather, opts = {}) {
    const season = seasonOf(monthAt(opts.nowMs, location.zone));
    const picks = [cadenceOf(weather, opts, location)];
    if (dayTick(weather, opts.nowMs, season)) picks.push(opts.reduced ? DAY_TICK_MS * 2 : DAY_TICK_MS);
    if (shoreFolk(opts.nowMs, location, season).some((f) => f.pose === 'walk')) picks.push(opts.reduced ? WALK_TICK_MS * 2 : WALK_TICK_MS);
    const live = picks.filter((p) => p > 0);
    return live.length ? Math.min(...live) : 0;
  },
  // the open lagoon, where rain rings land: from the far shore to the gravel; none on ice
  water: (rect, scene = null) => (scene && scene.frozen ? null : { x: rect.x, y: rect.y + rect.h * SHORE, w: rect.w, h: rect.h * (GRAVEL.y0 - SHORE) }),
  paint(ctx, rect, phase, tint, weather, plates, nowMs) {
    const L = layout(rect.w, rect.h, rect.x, rect.y);
    const m = mood(tint, weather, nowMs, location, phase, reduced);
    const seen = m.band !== 'hidden';
    drawSky(ctx, L, phase, tint, plates, m);
    // a hidden wall is not painted at all; the glacier's foot and the bench under it
    // are, because the cloud base leaves them in view
    if (seen) drawWall(ctx, L, phase, tint, plates, m);
    drawGlacier(ctx, L, phase, tint, plates, m);
    drawMoraine(ctx, L, phase, tint, plates, m);
    drawLens(ctx, L, phase, tint, plates, nowMs, m);
    drawPlume(ctx, L, phase, tint, plates, nowMs, m);
    drawSpindrift(ctx, L, phase, tint, plates, nowMs, m);
    drawDeck(ctx, L, phase, tint, plates, nowMs, m);
    drawLake(ctx, L, phase, tint, plates, nowMs, m, () => {
      // the deck hides the spires from the water too: reflect only what sits below it
      ctx.save();
      if (m.band === 'capped') {
        ctx.beginPath();
        ctx.rect(L.ox, L.Y(deckHeight(m.cover)), L.w, L.Y(SHORE) - L.Y(deckHeight(m.cover)));
        ctx.clip();
      }
      if (seen) drawWall(ctx, L, phase, tint, plates, m);
      drawGlacier(ctx, L, phase, tint, plates, m);
      ctx.restore();
      drawMoraine(ctx, L, phase, tint, plates, m);
      drawLens(ctx, L, phase, tint, plates, nowMs, m);
      drawPlume(ctx, L, phase, tint, plates, nowMs, m);
      // ... and the deck itself, over them as it is above the water: a capped or hidden
      // lake does not mirror open sky, or a wall the cloud has swallowed
      if (!seen || m.band === 'capped') drawDeck(ctx, L, phase, tint, plates, nowMs, m, true);
    });
    const shore = drawShore(ctx, L, phase, tint, plates, nowMs, m, minutesToSunrise(nowMs, location), shoreFolk(nowMs, location, m.season));
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
      tourists: shore.tourists,
      condor: shore.condor,
      season: m.season,
    };
  },
};
