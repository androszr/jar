// Warsaw: the skyline seen from the Praga bank (Varso, the Palace of Culture and
// Science, Zlota 44, the InterContinental, Warsaw Spire, the Cosmopolitan), the
// narrow Vistula, the Swietokrzyski Bridge landing on the near bank, and a small
// Mermaid on the far quay beside the bridge. After dark small white and red
// lights move along the deck, driven by nowMs (small cars and a bus by day); in a
// hard frost (below -5 C) ice floes drift right on the river and steam rises off
// the roofs. The traffic's tick carries the ice too. The near bank is rows of
// trees behind a strip of beach (forest.js); the boat, the birds, the steam, the
// New Year fireworks and the Christmas tree are in life.js.
import { PLACES } from '../places.js';
import { layout, buildPlates, drawSkyline, drawRiver, drawMermaid, nightAmount, sunLight, seasonWeights, SEASONS, SKYLINE, PALACE, FAR_BANK } from './scene.js';
import { drawBridge } from './bridge.js';
import { drawNearBank } from './forest.js';
import { drawBoat, drawBirds, drawSteam, drawFireworks, drawTree, lifeCadence } from './life.js';

const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const place = PLACES.find((p) => p.id === 'warsaw');
const PKIN = SKYLINE.find((t) => t.id === 'pkin');

export default {
  id: 'warsaw',
  title: place.title,
  country: place.country,
  location: { lat: place.lat, lon: place.lon, zone: place.zone },
  lid: 'cork',
  label: { inks: { plate: 'plate', ink: 'labelInk' } },
  // lightning finds the tip of the Palace's needle (fractions of the jar interior)
  sky: { strike: [PKIN.x, FAR_BANK - PALACE.needle] },
  buildPlates,
  // the bridge traffic's 200 ms tick (400 reduced) is never slower than the ice needs (250 / 500);
  // the New Year fireworks ask for 100 ms while they last
  cadenceMs: (weather, opts = {}) => lifeCadence(weather, opts) || (opts.reduced ? 400 : 200),
  // the river band, where rain rings may land: same local px as paint's rect
  water(rect) {
    const L = layout(rect.w, rect.h, rect.x, rect.y);
    return { x: L.ox, y: L.river.top, w: L.w, h: L.river.bottom - L.river.top };
  },
  // Returns what the scene shows, for the tests and the smoke check:
  // { season, golden, windows, glitter, moonTrack, wet, boat, birds, steam, vehicles, lamps, fireworks, tree }
  paint(ctx, rect, phase, tint, weather, plates, nowMs) {
    const L = layout(rect.w, rect.h, rect.x, rect.y);
    const night = nightAmount(tint.light);
    const light = sunLight(phase, weather);
    const shown = { fireworks: false, tree: false, steam: 0 };
    const birds = drawBirds(ctx, L, tint, 1 - night, weather, nowMs, reduced);
    const sky = drawSkyline(ctx, rect, phase, tint, plates, weather, nowMs, {
      behind: () => { shown.fireworks = drawFireworks(ctx, L, night, nowMs, reduced); },
      foot: () => { shown.tree = drawTree(ctx, L, night, nowMs, reduced); },
      roofs: () => { shown.steam = drawSteam(ctx, L, tint, night, weather, nowMs, reduced); },
    });
    const river = drawRiver(ctx, rect, phase, tint, weather, nowMs, reduced);
    const boat = drawBoat(ctx, L, 1 - night, weather, nowMs, reduced);
    const bank = drawNearBank(ctx, L, tint, night, weather, nowMs, light);
    const bridge = drawBridge(ctx, rect, phase, tint, weather, nowMs, reduced, light);
    drawMermaid(ctx, rect, phase, tint, weather);
    const w = seasonWeights(nowMs);
    return {
      season: SEASONS.reduce((a, b) => (w[b] > w[a] ? b : a)),
      golden: light.golden * (1 - night),
      windows: sky.windows,
      glitter: river.glitter,
      moonTrack: river.moonTrack,
      wet: river.wet,
      boat,
      birds,
      steam: shown.steam,
      vehicles: bridge.vehicles,
      lamps: bank.lamps,
      fireworks: shown.fireworks,
      tree: shown.tree,
    };
  },
};
