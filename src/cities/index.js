// The registry of cities: one folder per city under src/cities/, one import
// and one entry here, and one entry in places.js. Lint fails an unlisted folder.
//
// A city entry provides:
//   id        kebab-case (a hyphen is fine: 'el-chalten'); the same as its places.js entry and its folder name
//   title     the name on the label
//   country   the country shown after the city on the label, the tab title and the accessible text; optional on read (placeName in places.js falls back to title)
//   location  { lat, lon, zone } (from places.js); drives the city's clock
//   lid       'cork' | 'tin'
//   label     { inks: { plate, ink } } - names of colours in the look's PALETTE
//   buildPlates(w, h)   precomputed, size-dependent drawing data
//   paint(ctx, rect, phase, tint, weather, plates, nowMs)
//             draws the diorama into rect (the jar's interior, local px); may
//             return a small plain object, which the test surface exposes as
//             window.__jar.scene(id)
//   cadenceMs(weather, { reduced, nowMs })
//             optional: ms between redraws the scene needs (a rolling sea);
//             absent or 0 for a still scene; nowMs is the jar's moment, which
//             a scene may ignore
//   labelLine(weather)
//             optional: a string for a fourth line on the label plate, or null
//             for none (Nazare's swell, El Chalten's view of the peak)
//   water(rect, scene)
//             optional: the open water in the jar's local px, { x, y, w, h },
//             where the shared rain lands as rings; null for none (a frozen
//             lake). `scene` is what paint returned for this frame
//   sky       optional: { sun: false } declines the shared sky's sun disc (a
//             view that faces away from where the sun crosses)
//   seed      optional number for the city's own randomness
//
// One jar is one city: a second view of a city (another square, another statue)
// is a change to that city's scene, never a second jar.
import warsaw from './warsaw/index.js';
import nazare from './nazare/index.js';
import elChalten from './el-chalten/index.js';

export const CITIES = [warsaw, nazare, elChalten];

export const findCity = (id) => CITIES.find((c) => c.id === id) || null;
